/**
 * Vercel AI Gateway client and per-call cost, shared by /api/chat and the gigs spec builder.
 * Edge-safe (fetch only).
 */
import { createOpenAI } from '@ai-sdk/openai';

export const AI_GATEWAY_BASE_URL = 'https://gateway.ai.vercel.com/v1';

export function createGateway() {
  return createOpenAI({
    baseURL: AI_GATEWAY_BASE_URL,
    apiKey: process.env.AI_GATEWAY_API_KEY!,
  });
}

export const MODEL_COSTS: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'openai/gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
  'openai/gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'openai/gpt-4.1-mini': { inputPer1M: 0.40, outputPer1M: 1.60 },
  'openai/gpt-4.1-nano': { inputPer1M: 0.10, outputPer1M: 0.40 },
  'anthropic/claude-sonnet-4-5': { inputPer1M: 3.00, outputPer1M: 15.00 },
  'anthropic/claude-haiku-3.5': { inputPer1M: 0.80, outputPer1M: 4.00 },
  'mistral/ministral-3b': { inputPer1M: 0.04, outputPer1M: 0.04 },
  'google/gemini-2.0-flash': { inputPer1M: 0.10, outputPer1M: 0.40 },
};

/** Local cost estimate in USD; unknown models use a conservative default. */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[modelId] || { inputPer1M: 0.50, outputPer1M: 1.50 };
  return (inputTokens / 1_000_000) * costs.inputPer1M + (outputTokens / 1_000_000) * costs.outputPer1M;
}

/**
 * The gateway's billed cost for a generation, if it reports one; otherwise the fallback.
 */
export async function resolveGenerationCost(generationId: string | null | undefined, fallback: number): Promise<number> {
  if (!generationId) return fallback;
  try {
    const res = await fetch(`https://ai-gateway.vercel.sh/v1/generation?id=${generationId}`, {
      headers: { Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY!}` },
    });
    if (res.ok) {
      const report = await res.json();
      if (report?.data?.total_cost) return parseFloat(report.data.total_cost);
    }
  } catch {
    // fall back to the local calculation
  }
  return fallback;
}
