/**
 * AI job-spec drafting. Uses the same AI Gateway client and the same billing as /api/chat:
 * the user needs a positive, active `user_budgets` balance; the call's cost is deducted with
 * `deduct_user_balance` and logged to `paid_usage_analytics`.
 */
import { generateObject } from 'ai';
import { createGateway, calculateCost, resolveGenerationCost } from '@/src/lib/ai-gateway';
import { jobsDb } from './db';
import { JobsError, dbError } from './errors';
import { getOwnedJob, saveSpecDraft } from './jobs-service';
import { AiJobSpecSchema, JobSpecSchema, normalizeAiSpec } from './schemas';
import type { JobRow, JobSpecVersionRow } from './types';

export const DEFAULT_SPEC_MODEL = 'openai/gpt-4o-mini';

const SYSTEM_PROMPT = [
  'You turn a customer job post into a precise software job spec for AI agents to bid on.',
  'Write short, concrete, testable items. Acceptance criteria must be checkable by an independent QA reviewer.',
  'Money is in euro cents. Use null when the customer gave no deadline or budget; never invent one.',
  'Only list tools the work plausibly needs. Mark data sensitivity conservatively.',
].join(' ');

export function buildSpecPrompt(job: Pick<JobRow, 'title' | 'description' | 'category' | 'budget_min_cents' | 'budget_max_cents' | 'deadline'>, instructions?: string): string {
  const lines = [
    `Title: ${job.title}`,
    `Category: ${job.category ?? 'unspecified'}`,
    `Budget (euro cents): ${job.budget_min_cents ?? 'none'} to ${job.budget_max_cents ?? 'none'}`,
    `Deadline: ${job.deadline ?? 'none'}`,
    '',
    'Description:',
    job.description,
  ];
  if (instructions) lines.push('', 'Extra instructions from the customer:', instructions);
  return lines.join('\n');
}

async function assertBalance(userId: string): Promise<void> {
  const { data: budget, error } = await jobsDb()
    .from('user_budgets')
    .select('remaining_balance, status')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw dbError(error, 'read balance');
  if (!budget || Number(budget.remaining_balance) <= 0 || budget.status !== 'active') {
    throw new JobsError('insufficient_balance', 402, 'Top up your credits to draft a spec with AI');
  }
}

async function chargeUsage(userId: string, model: string, inputTokens: number, outputTokens: number, generationId: string | null) {
  const estimate = calculateCost(model, inputTokens, outputTokens);
  if (estimate <= 0) return;
  const cost = await resolveGenerationCost(generationId, estimate);
  const db = jobsDb();
  const { error } = await db.rpc('deduct_user_balance', { target_user_id: userId, amount: cost });
  if (error) console.error('[jobs] deduct_user_balance failed:', error.message);
  const { error: logError } = await db.from('paid_usage_analytics').insert({
    user_id: userId,
    device_session_id: 'gigs-spec-builder',
    provider: model.split('/')[0] || 'unknown',
    model_name: model,
    tokens_used: inputTokens + outputTokens,
    cost_deducted: cost,
  });
  if (logError) console.error('[jobs] paid_usage_analytics insert failed:', logError.message);
}

export async function draftSpecWithAi(userId: string, jobId: string, instructions?: string): Promise<JobSpecVersionRow> {
  const job = await getOwnedJob(userId, jobId);
  if (job.status !== 'draft') throw new JobsError('invalid_state', 409, 'Specs can only be drafted while the job is a draft');
  await assertBalance(userId);

  const model = process.env.JOBS_SPEC_MODEL || DEFAULT_SPEC_MODEL;
  let result: Awaited<ReturnType<typeof generateObject<typeof AiJobSpecSchema>>>;
  try {
    result = await generateObject({
      model: createGateway()(model),
      schema: AiJobSpecSchema,
      system: SYSTEM_PROMPT,
      prompt: buildSpecPrompt(job, instructions),
      headers: { 'x-vercel-ai-user-id': userId, 'x-vercel-ai-tag': 'gigs-spec-builder' },
    });
  } catch (err) {
    console.error('[jobs] spec generation failed:', err instanceof Error ? err.message : err);
    throw new JobsError('ai_error', 502, 'The AI could not draft a spec; try again or write it manually');
  }

  const headers = (result.response?.headers ?? {}) as Record<string, string | undefined>;
  await chargeUsage(
    userId,
    model,
    result.usage?.inputTokens ?? 0,
    result.usage?.outputTokens ?? 0,
    headers['x-vercel-ai-generation-id'] ?? null,
  );

  const parsed = JobSpecSchema.safeParse(normalizeAiSpec(result.object));
  if (!parsed.success) {
    throw new JobsError('ai_error', 502, 'The AI draft was incomplete; try again or write it manually', parsed.error.issues);
  }
  return saveSpecDraft(userId, job.id, parsed.data, { source: 'ai', model });
}
