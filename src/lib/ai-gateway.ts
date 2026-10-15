/**
 * Vercel AI Gateway client and per-call cost, shared by /api/chat and the gigs spec builder.
 * Edge-safe (fetch only).
 */
import { createOpenAI } from '@ai-sdk/openai';
import { findAllowedModel } from './models/catalog.ts';
import { creditMarkupFromEnv } from '../config/qa.config.ts';

// The documented AI Gateway host. The old gateway.ai.vercel.com closed the TLS handshake without a
// certificate when probed on 2026-10-15 (curl exit 35, openssl "no peer certificate"), while this host
// served /v1/models (200, 471 models) and already backed resolveGenerationCost below.
export const AI_GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

export function createGateway() {
  return createOpenAI({
    baseURL: AI_GATEWAY_BASE_URL,
    apiKey: process.env.AI_GATEWAY_API_KEY!,
  });
}

/** A model that isn't on the Tulzo allowlist (src/config/gateway-models.ts) has no price. */
export class UnknownModelError extends Error {
  readonly model: string;
  constructor(model: string) {
    super(`Model "${model}" is not on the Tulzo gateway allowlist`);
    this.name = 'UnknownModelError';
    this.model = model;
  }
}

/**
 * Local cost estimate in USD at the allowlist's base price (no markup). Throws UnknownModelError
 * for a model that isn't allowlisted, so nothing is billed at a made-up price.
 */
export function calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  const row = findAllowedModel(modelId);
  if (!row) throw new UnknownModelError(modelId);
  return (inputTokens / 1_000_000) * row.inputPer1M + (outputTokens / 1_000_000) * row.outputPer1M;
}

/**
 * The multiplier /api/chat applies to a call's cost before billing it. Account keys are billed at
 * the gateway's cost (×1); QA review keys at × CREDIT_MARKUP. /api/models lists account prices
 * with the same function, so the listed price is the billed price.
 */
export function chatBillingMarkup({ review }: { review: boolean }): number {
  return review ? creditMarkupFromEnv() : 1;
}

/**
 * The gateway's billed cost for a generation, if it reports one; otherwise the fallback.
 */
export async function resolveGenerationCost(generationId: string | null | undefined, fallback: number): Promise<number> {
  if (!generationId) return fallback;
  try {
    const res = await fetch(`${AI_GATEWAY_BASE_URL}/generation?id=${generationId}`, {
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
