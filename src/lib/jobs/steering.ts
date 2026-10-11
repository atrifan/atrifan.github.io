/**
 * Steering: the customer asks for something while the work is running.
 *
 * An LLM proposes what kind of request it is (clarification, revision, scope change);
 * the pure gate `decideSteering` has the final say:
 *   - any change to the spec, the price or the deadline is a scope change;
 *   - a revision uses one included steering credit from the contract version, and becomes
 *     a scope change when none is left;
 *   - a clarification is free.
 * A scope change pauses the work until the customer approves the provider's re-estimate
 * (a new contract version) and pays any top-up.
 *
 * Everything here except `classifySteering` is pure. Persistence is in steering-service.ts.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { createGateway } from '../ai-gateway.ts';

export const STEERING_KINDS = ['clarification', 'revision', 'scope_change'] as const;
export type SteeringKind = (typeof STEERING_KINDS)[number];

export const STEERING_STATUSES = [
  'open',
  'awaiting_estimate',
  'awaiting_provider',
  'awaiting_approval',
  'answered',
  'resolved',
  'approved',
  'rejected',
  'declined',
  'cancelled',
] as const;
export type SteeringStatus = (typeof STEERING_STATUSES)[number];

export type TopupStatus = 'none' | 'pending' | 'paid' | 'expired';

export interface SteeringDecisionInput {
  /** What the classifier (or, without AI, the customer) says the request is. */
  classified: SteeringKind;
  /** Requested changes to spec items; blank entries are ignored. */
  specDiff: readonly string[];
  /** Proposed price minus the current price, in cents. */
  priceDelta: number;
  /** Proposed deadline minus the current deadline, in ms. */
  deadlineDelta: number;
  /** Steering credits left on the current contract version. */
  remainingSteeringCredits: number;
}

export interface SteeringDecision {
  kind: SteeringKind;
  consumesCredit: boolean;
  requiresApproval: boolean;
}

const SCOPE_CHANGE: SteeringDecision = { kind: 'scope_change', consumesCredit: false, requiresApproval: true };

export function decideSteering(input: SteeringDecisionInput): SteeringDecision {
  const { classified, specDiff, priceDelta, deadlineDelta, remainingSteeringCredits } = input;
  const changesSpec = specDiff.some((s) => s.trim().length > 0);
  // `!== 0` is also true for NaN, so a garbled delta fails safe into a scope change.
  if (changesSpec || priceDelta !== 0 || deadlineDelta !== 0) return { ...SCOPE_CHANGE };
  if (classified === 'clarification') return { kind: 'clarification', consumesCredit: false, requiresApproval: false };
  if (classified === 'revision' && remainingSteeringCredits >= 1) {
    return { kind: 'revision', consumesCredit: true, requiresApproval: false };
  }
  return { ...SCOPE_CHANGE };
}

/**
 * Status of a new request. A scope change waits for the provider's estimate, or, when
 * the customer already proposed terms (price or deadline), for the provider to accept them.
 */
export function initialSteeringStatus(decision: SteeringDecision, customerProposedTerms: boolean): SteeringStatus {
  if (decision.kind !== 'scope_change') return 'open';
  return customerProposedTerms ? 'awaiting_provider' : 'awaiting_estimate';
}

const PAUSING_STATUSES: ReadonlySet<SteeringStatus> = new Set(['awaiting_estimate', 'awaiting_provider', 'awaiting_approval']);

/** Does this request pause the work? Unresolved scope changes, and approved ones with an unpaid top-up. */
export function pausesWork(req: { kind: SteeringKind; status: SteeringStatus; topup_status: TopupStatus }): boolean {
  if (req.kind !== 'scope_change') return false;
  if (PAUSING_STATUSES.has(req.status)) return true;
  return req.status === 'approved' && req.topup_status === 'pending';
}

/** What the customer still owes after a scope change: the increase in their total. */
export function topupAmountCents(oldCustomerTotalCents: number, newCustomerTotalCents: number): number {
  return newCustomerTotalCents > oldCustomerTotalCents ? newCustomerTotalCents - oldCustomerTotalCents : 0;
}

export function remainingCredits(allowance: number, used: number): number {
  return Math.max(0, allowance - used);
}

// ---------- classifier ----------

export const DEFAULT_STEERING_MODEL = 'openai/gpt-4o-mini';

export const SteeringClassificationSchema = z.object({
  kind: z.enum(STEERING_KINDS),
  confidence: z.number().describe('0 to 1'),
  rationale: z.string().describe('One short sentence, shown to both parties'),
});
export type SteeringClassification = z.infer<typeof SteeringClassificationSchema>;

const CLASSIFIER_SYSTEM = [
  'You classify a customer message sent to a provider while a paid software job is in progress.',
  'clarification: a question or extra context that does not change what must be delivered.',
  'revision: asks to redo or adjust something already within the agreed requirements and deliverables.',
  'scope_change: adds, removes or changes requirements, deliverables, acceptance criteria, price or deadline.',
  'When unsure between revision and scope_change, choose scope_change.',
].join(' ');

export interface ClassifierContext {
  message: string;
  requirements: readonly string[];
  deliverables: readonly string[];
  priceCents: number;
  deadline: string | null;
}

export function buildClassifierPrompt(c: ClassifierContext): string {
  return [
    'Agreed requirements:',
    ...c.requirements.map((r) => `- ${r}`),
    'Agreed deliverables:',
    ...c.deliverables.map((d) => `- ${d}`),
    `Agreed price (cents): ${c.priceCents}`,
    `Agreed deadline: ${c.deadline ?? 'none'}`,
    '',
    'Customer message:',
    c.message,
  ].join('\n');
}

export type ClassifierOutput =
  | ({ source: 'ai'; model: string } & SteeringClassification)
  | { source: 'fallback'; kind: SteeringKind; error: string };

/**
 * Ask the model what kind of request this is. Never throws: without a gateway key or on a
 * model error it falls back to the kind the customer asked for (default clarification);
 * `decideSteering` still forces a scope change for any spec, price or deadline change.
 */
export async function classifySteering(
  c: ClassifierContext,
  opts: { userId: string; requestedKind?: SteeringKind },
): Promise<ClassifierOutput> {
  const fallbackKind = opts.requestedKind ?? 'clarification';
  if (!process.env.AI_GATEWAY_API_KEY) return { source: 'fallback', kind: fallbackKind, error: 'ai_not_configured' };
  const model = process.env.JOBS_STEERING_MODEL || DEFAULT_STEERING_MODEL;
  try {
    const result = await generateObject({
      model: createGateway()(model),
      schema: SteeringClassificationSchema,
      system: CLASSIFIER_SYSTEM,
      prompt: buildClassifierPrompt(c),
      headers: { 'x-vercel-ai-user-id': opts.userId, 'x-vercel-ai-tag': 'gigs-steering-classifier' },
    });
    const parsed = SteeringClassificationSchema.safeParse(result.object);
    if (!parsed.success) return { source: 'fallback', kind: fallbackKind, error: 'invalid_ai_output' };
    return { source: 'ai', model, ...parsed.data };
  } catch (err) {
    console.error('[jobs] steering classification failed:', err instanceof Error ? err.message : err);
    return { source: 'fallback', kind: fallbackKind, error: 'ai_error' };
  }
}
