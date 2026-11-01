/**
 * Vercel AI Gateway client and per-call cost, shared by /api/chat and the gigs spec builder.
 * Edge-safe (fetch only).
 */
import { createOpenAI } from '@ai-sdk/openai';
import { chatModelPrice, imageGenerationModelPrice, type ImagePrice, type ModelPrice } from './models/catalog.ts';
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

/** Base cost in USD for one generated image request from the model listing, before markup. */
export function calculateImageCost(price: ImagePrice, count: number): number {
  const n = Number.isFinite(count) && count > 0 ? count : 1;
  if (price.image !== undefined) return price.image * n;
  if (price.outputPer1M !== undefined) return (price.outputPer1M / 1_000_000) * n;
  if (price.inputPer1M !== undefined) return (price.inputPer1M / 1_000_000) * n;
  return 0;
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

/** Base cost in USD for one image-generation call. Throws UnknownModelError for a model Tulzo won't proxy. */
export async function imageCostForModel(modelId: string, count: number): Promise<number> {
  const price = await imageGenerationModelPrice(modelId);
  if (!price) throw new UnknownModelError(modelId);
  return calculateImageCost(price, count);
}

/**
 * The multiplier /api/chat applies to a call's cost before billing it: CREDIT_MARKUP (default 1.3),
 * for account keys and QA review keys alike. /api/models lists prices with the same function, so the
 * listed price is the billed price.
 */
export function chatBillingMarkup(): number {
  return creditMarkupFromEnv();
}

export interface ImageGenerationBody {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  response_format?: 'b64_json' | 'url';
  quality?: string;
  background?: string;
  moderation?: string;
  output_format?: string;
  output_compression?: number;
  providerOptions?: Record<string, unknown>;
}

export interface ImageGenerationResponse {
  created: number;
  data: Array<{ b64_json?: string; url?: string }>;
  generationId: string | null;
}

/** OpenAI-compatible image generation through the AI Gateway images endpoint. */
export async function generateImage(body: ImageGenerationBody, userId: string, sessionId: string): Promise<ImageGenerationResponse> {
  const res = await fetch(`${AI_GATEWAY_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY!}`,
      'Content-Type': 'application/json',
      'x-vercel-ai-user-id': userId,
      'x-vercel-ai-tag': sessionId,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Image generation failed: ${res.status}`);
  }
  const json = await res.json() as { created?: unknown; data?: unknown };
  return {
    created: typeof json.created === 'number' ? json.created : Date.now(),
    data: Array.isArray(json.data) ? json.data as Array<{ b64_json?: string; url?: string }> : [],
    generationId: res.headers.get('x-vercel-ai-generation-id'),
  };
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
