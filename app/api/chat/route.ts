import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createClient } from '@supabase/supabase-js';

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

const MODEL_COSTS: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'openai/gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
  'openai/gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'openai/gpt-4.1-mini': { inputPer1M: 0.40, outputPer1M: 1.60 },
  'openai/gpt-4.1-nano': { inputPer1M: 0.10, outputPer1M: 0.40 },
  'anthropic/claude-sonnet-4-5': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'anthropic/claude-haiku-3.5': { inputPer1M: 0.80, outputPer1M: 4.00 },
  'mistral/ministral-3b': { inputPer1M: 0.04, outputPer1M: 0.04 },
  'google/gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40 },
};

function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[modelId] || { inputPer1M: 0.50, outputPer1M: 1.50 };
  return (inputTokens / 1_000_000) * costs.inputPer1M + (outputTokens / 1_000_000) * costs.outputPer1M;
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

  if (apiKey.startsWith('ak_')) {
    const hash = await sha256Hex(apiKey);
    const { data: keyRecord } = await supabase
      .from('api_keys')
      .select('id, user_id, is_active')
      .eq('api_key_hash', hash)
      .eq('is_active', true)
      .single();

    if (!keyRecord) {
      return new Response(JSON.stringify({ error: 'Invalid or revoked API key' }), {
        status: 401,
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

  const body = await request.json();
  const { messages, model = 'openai/gpt-4o-mini' } = body;

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Invalid request body: messages required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const gateway = createOpenAI({
    baseURL: 'https://gateway.ai.vercel.com/v1',
    apiKey: process.env.AI_GATEWAY_API_KEY!,
  });

  const result = streamText({
    model: gateway(model),
    messages,
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

      if (cost > 0) {
        let finalCost = cost;

        if (generationId) {
          try {
            const genRes = await fetch(`https://ai-gateway.vercel.sh/v1/generation?id=${generationId}`, {
              headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY!}` },
            });
            if (genRes.ok) {
              const report = await genRes.json();
              if (report?.data?.total_cost) {
                finalCost = parseFloat(report.data.total_cost);
              }
            }
          } catch {
            // Fall back to local calculation
          }
        }

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
    },
  });

  return result.toTextStreamResponse();
}
