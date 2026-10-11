import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { createClient } from '@supabase/supabase-js';
import { createGateway, calculateCost, resolveGenerationCost } from '@/src/lib/ai-gateway';
import { creditMarkupFromEnv, creditValueUsdFromEnv, reviewMaxOutputTokensFromEnv } from '@/src/config/qa.config';
import { chargedCredits, estimateInputTokens, remainingCredits, reviewOutputCap } from '@/src/lib/qa/qa-credits';

export const runtime = 'edge';

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getSupabase() {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function jsonError(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

interface ReviewBilling {
  submissionId: string;
  capCredits: number;
}

/**
 * QA review keys (api_keys.purpose = 'qa_review', issued by the Admin QA MCP): usage is
 * metered against the submission's QA reserve (paid by the customer, basic by the
 * platform), never the key owner's balance. Expired or revoked keys get 403; an exhausted
 * reserve gets 402.
 */
async function checkReviewKey(
  supabase: ReturnType<typeof getSupabase>,
  key: { is_active: boolean; revoked_at?: string | null; expires_at?: string | null; submission_id?: string | null; cap_credits?: number | string | null },
): Promise<ReviewBilling | Response> {
  if (!key.is_active || key.revoked_at) {
    return jsonError(403, { error: 'This QA review key has been revoked.', code: 'review_key_revoked' });
  }
  if (!key.expires_at || Date.parse(key.expires_at) <= Date.now()) {
    return jsonError(403, { error: 'This QA review key has expired. Call qa_credentials_get for a new one.', code: 'review_key_expired' });
  }
  const { data: req } = await supabase
    .from('qa_requests')
    .select('status, platform_credits, reserved_credits, used_credits')
    .eq('subject_type', 'contract_submission')
    .eq('subject_id', key.submission_id)
    .maybeSingle();
  if (!req || req.status !== 'reserved') {
    return jsonError(403, { error: 'The QA reserve for this submission is closed.', code: 'review_key_revoked' });
  }
  const capCredits = Math.min(Number(req.platform_credits) + Number(req.reserved_credits), Number(key.cap_credits ?? 0));
  const usedCredits = Number(req.used_credits);
  if (remainingCredits(capCredits, usedCredits) <= 0) {
    return jsonError(402, {
      error: `The QA credit reserve for this submission is used up (${usedCredits} of ${capCredits} credits). Finish the review and call qa_mark.`,
      code: 'qa_reserve_exhausted',
      submission_id: key.submission_id,
      cap_credits: capCredits,
      used_credits: usedCredits,
    });
  }
  return { submissionId: key.submission_id as string, capCredits };
}

/**
 * Hold the worst case for one review call before it runs: the input estimate plus the output
 * cap, priced by the local model table, × CREDIT_MARKUP. qa_hold_credits locks the reserve
 * row, so concurrent calls on one submission each hold their own worst case and together can
 * never start more spend than what is left. Returns the hold id, or a 402 Response.
 */
async function holdReviewCredits(
  supabase: ReturnType<typeof getSupabase>,
  apiKeyId: string | null,
  estimateCredits: number,
  submissionId: string,
): Promise<string | Response> {
  const { data, error } = await supabase.rpc('qa_hold_credits', { p_api_key_id: apiKeyId, p_credits: estimateCredits });
  if (error) {
    console.error('[chat] QA credit hold failed:', submissionId, error.code);
    return jsonError(503, { error: 'Could not reserve QA credits for this call; try again.', code: 'qa_hold_failed' });
  }
  if (!data?.ok) {
    if (data?.error === 'no_open_reserve') {
      return jsonError(403, { error: 'The QA reserve for this submission is closed.', code: 'review_key_revoked' });
    }
    return jsonError(402, {
      error: `The QA credit reserve for this submission cannot cover this call (about ${estimateCredits} credits at most; ${Number(data?.available ?? 0)} left). Finish the review and call qa_mark.`,
      code: 'qa_reserve_insufficient',
      submission_id: submissionId,
      estimate_credits: estimateCredits,
      available_credits: Number(data?.available ?? 0),
      held_credits: Number(data?.held ?? 0),
      cap_credits: Number(data?.cap ?? 0),
      used_credits: Number(data?.used ?? 0),
    });
  }
  return data.hold_id as string;
}

async function validateClerkToken(apiKey: string): Promise<{ userId: string; sessionId: string } | null> {
  try {
    const res = await fetch('https://api.clerk.com/v1/debug', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { userId: data.user_id, sessionId: data.session_id };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing x-api-key header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = getSupabase();
  let userId: string;
  let sessionId: string;
  let apiKeyId: string | null = null;
  let review: ReviewBilling | null = null;

  if (apiKey.startsWith('ak_')) {
    const hash = await sha256Hex(apiKey);
    // '*' so this keeps working whether or not the QA columns (purpose, …) exist yet
    const { data: keyRecord } = await supabase
      .from('api_keys')
      .select('*')
      .eq('api_key_hash', hash)
      .single();

    if (!keyRecord) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (keyRecord.purpose === 'qa_review') {
      const checked = await checkReviewKey(supabase, keyRecord);
      if (checked instanceof Response) return checked;
      review = checked;
    } else if (!keyRecord.is_active) {
      const msg = keyRecord.plan === 'free'
        ? 'Your subscription has expired. Re-subscribe at tulzo.online/pricing to reactivate your API key.'
        : 'API key has been revoked. Please generate a new one from your dashboard.';
      return new Response(JSON.stringify({ error: msg }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    userId = keyRecord.user_id;
    sessionId = keyRecord.id;
    apiKeyId = keyRecord.id;
  } else {
    const authResult = await validateClerkToken(apiKey);
    if (!authResult) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    userId = authResult.userId;
    sessionId = authResult.sessionId;

    const { data: keyRecord } = await supabase
      .from('api_keys')
      .select('id')
      .eq('api_key', apiKey)
      .eq('user_id', userId)
      .maybeSingle();
    apiKeyId = keyRecord?.id || null;
  }

  if (!review) {
    const { data: budget } = await supabase
      .from('user_budgets')
      .select('remaining_balance, status')
      .eq('user_id', userId)
      .single();

    if (!budget || budget.remaining_balance <= 0 || budget.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Insufficient balance' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const body = await request.json();
  const { messages, model = 'openai/gpt-4o-mini', tools, stream = true } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Invalid request body: messages required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // QA review calls: cap the output and hold the call's worst-case credits first.
  let maxOutputTokens: number | undefined;
  let holdId: string | null = null;
  const markup = review ? creditMarkupFromEnv() : 1;
  if (review) {
    maxOutputTokens = reviewOutputCap(body.max_tokens, reviewMaxOutputTokensFromEnv());
    const inputTokens = estimateInputTokens(JSON.stringify({ messages, tools: tools ?? null }));
    const estimate = chargedCredits(calculateCost(model, inputTokens, maxOutputTokens), markup, creditValueUsdFromEnv());
    const held = await holdReviewCredits(supabase, apiKeyId, estimate, review.submissionId);
    if (held instanceof Response) return held;
    holdId = held;
  }
  let holdReleased = false;
  const releaseHold = async () => {
    if (!holdId || holdReleased) return;
    holdReleased = true;
    const { error } = await supabase.rpc('qa_release_hold', { p_hold_id: holdId });
    if (error) console.error('[chat] QA credit hold not released (it expires):', review?.submissionId, error.code);
  };

  const gateway = createGateway();

  // Build tool definitions for Vercel AI SDK if tools provided
  let aiTools: Record<string, any> | undefined;
  if (tools && Array.isArray(tools) && tools.length > 0) {
    const { tool } = await import('ai');
    const { jsonSchema } = await import('ai');
    aiTools = {};
    for (const t of tools) {
      if (t.type === 'function' && t.function) {
        aiTools[t.function.name] = tool({
          description: t.function.description || '',
          inputSchema: jsonSchema({ type: 'object', additionalProperties: true }),
        });
      }
    }
  }

  const result = streamText({
    model: gateway(model),
    messages,
    tools: aiTools,
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    headers: {
      'x-vercel-ai-user-id': userId,
      'x-vercel-ai-tag': sessionId,
    },
    async onFinish({ usage, response }) {
      const inputTokens = usage?.inputTokens || 0;
      const outputTokens = usage?.outputTokens || 0;
      const totalTokens = inputTokens + outputTokens;
      const cost = calculateCost(model, inputTokens, outputTokens);

      const generationId = response?.headers?.['x-vercel-ai-generation-id'] || null;

      if (cost > 0 && review) {
        const finalCost = await resolveGenerationCost(generationId, cost);
        const { data: metered, error: meterError } = await supabase.rpc('qa_meter_usage', {
          p_api_key_id: apiKeyId,
          p_credits: chargedCredits(finalCost, markup, creditValueUsdFromEnv()),
          p_cost_usd: finalCost,
          p_model: model,
          p_input_tokens: inputTokens,
          p_output_tokens: outputTokens,
        });
        if (meterError || !metered?.ok) {
          console.error('[chat] QA review usage not metered:', review.submissionId, meterError?.code ?? metered?.error);
        }
      } else if (cost > 0) {
        const finalCost = await resolveGenerationCost(generationId, cost);

        await supabase.rpc('deduct_user_balance', {
          target_user_id: userId,
          amount: finalCost,
        });

        await supabase.from('paid_usage_analytics').insert({
          user_id: userId,
          device_session_id: sessionId,
          api_key_id: apiKeyId,
          provider: model.split('/')[0] || 'unknown',
          model_name: model,
          tokens_used: totalTokens,
          cost_deducted: finalCost,
        });
      }
      // after metering, so the hold and the usage never both disappear for a moment
      await releaseHold();
    },
    async onError() {
      await releaseHold();
    },
    async onAbort() {
      await releaseHold();
    },
  });

  if (!stream) {
    let text: string;
    try {
      text = await result.text;
    } catch (err) {
      await releaseHold();
      throw err;
    }
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stream as OpenAI-compatible SSE with tool_calls support
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let toolCallIndex = 0;
      let finishReason = 'stop';
      let usageData: { prompt_tokens: number; completion_tokens: number } | null = null;

      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            const chunk = {
              choices: [{ index: 0, delta: { content: part.text }, finish_reason: null }],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          } else if (part.type === 'tool-call') {
            finishReason = 'tool_calls';
            const chunk = {
              choices: [{
                index: 0,
                delta: {
                  tool_calls: [{
                    index: toolCallIndex,
                    id: part.toolCallId,
                    type: 'function',
                    function: { name: part.toolName, arguments: JSON.stringify(part.input) },
                  }],
                },
                finish_reason: null,
              }],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            toolCallIndex++;
          } else if (part.type === 'finish') {
            usageData = {
              prompt_tokens: part.totalUsage?.inputTokens || 0,
              completion_tokens: part.totalUsage?.outputTokens || 0,
            };
          }
        }

        // Send finish chunk
        const finishChunk = {
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
          ...(usageData ? { usage: usageData } : {}),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err: any) {
        await releaseHold();
        const errorChunk = { error: { message: err?.message || 'Stream error' } };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
