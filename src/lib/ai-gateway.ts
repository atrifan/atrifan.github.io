/**
 * Vercel AI Gateway client and per-call cost, shared by /api/chat and the gigs spec builder.
 * Edge-safe (fetch only).
 */
import { createOpenAI } from '@ai-sdk/openai';
import { chatModelPrice, type ModelPrice } from './models/catalog.ts';
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

/** A model the Tulzo gateway doesn't offer (not a Vercel chat model) has no price. */
export class UnknownModelError extends Error {
  readonly model: string;
  constructor(model: string) {
    super(`Model "${model}" is not offered by the Tulzo gateway`);
    this.name = 'UnknownModelError';
    this.model = model;
  }
}

/** Cost in USD at a model's base (pre-markup) price. */
export function calculateCost(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * price.inputPer1M + (outputTokens / 1_000_000) * price.outputPer1M;
}

/**
 * Base cost in USD for a model, priced from the cached Vercel listing (chatModelPrice). Throws
 * UnknownModelError for a model the gateway doesn't offer, so nothing is billed at a made-up price.
 */
export async function costForModel(modelId: string, inputTokens: number, outputTokens: number): Promise<number> {
  const price = await chatModelPrice(modelId);
  if (!price) throw new UnknownModelError(modelId);
  return calculateCost(price, inputTokens, outputTokens);
}

/**
 * The multiplier /api/chat applies to a call's cost before billing it: CREDIT_MARKUP (default 1.3),
 * for account keys and QA review keys alike. /api/models lists prices with the same function, so the
 * listed price is the billed price.
 */
export function chatBillingMarkup(): number {
  return creditMarkupFromEnv();
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
