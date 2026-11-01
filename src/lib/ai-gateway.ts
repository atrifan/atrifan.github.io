/**
 * Vercel AI Gateway client and per-call cost, shared by /api/chat and the gigs spec builder.
 * Edge-safe (fetch only).
 */
import { createOpenAI } from '@ai-sdk/openai';
import { chatModelPrice, imageEditModelPrice, imageGenerationModelPrice, type ImagePrice, type ModelPrice } from './models/catalog.ts';
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

/** A non-OK response from the AI Gateway, preserving its JSON body for route handlers. */
export class GatewayRequestError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.name = 'GatewayRequestError';
    this.status = status;
    this.body = body;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function gatewayRequestError(action: string, res: Response): Promise<GatewayRequestError> {
  const raw = await res.text();

  try {
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (isRecord(parsed)) {
      return new GatewayRequestError(`${action} failed: ${res.status}`, res.status, parsed);
    }
  } catch {
    // Fall through to the JSON wrapper below.
  }

  return new GatewayRequestError(`${action} failed: ${res.status}`, res.status, {
    error: `${action} failed`,
    upstream_status: res.status,
    details: raw || res.statusText || 'AI Gateway returned a non-JSON error response.',
  });
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

/** Base cost in USD for one image-edit call. Throws UnknownModelError for a model Tulzo won't proxy. */
export async function imageEditCostForModel(modelId: string, count: number): Promise<number> {
  const price = await imageEditModelPrice(modelId);
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

export interface ImageEditBody {
  model: string;
  prompt: string;
  images: Array<{ image_url: string }>;
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

export interface ImageCapableChatGenerationBody {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  response_format?: 'b64_json' | 'url';
  providerOptions?: Record<string, unknown>;
}

function dataUriBase64(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = /^data:[^;]+;base64,(.+)$/i.exec(url);
  return match?.[1] ?? null;
}

function base64EncodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function extractSvgFromChatContent(content: unknown): string | null {
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map((part) => {
          if (typeof part === 'string') return part;
          if (!part || typeof part !== 'object') return '';
          const textPart = (part as { text?: unknown }).text;
          return typeof textPart === 'string' ? textPart : '';
        }).join('\n')
      : null;
  if (!text) return null;
  const match = text.match(/<svg[\s\S]*?<\/svg>/i);
  return match?.[0] ?? null;
}

function normalizeChatImageData(images: unknown): Array<{ b64_json?: string; url?: string }> {
  if (!Array.isArray(images)) return [];
  const normalized: Array<{ b64_json?: string; url?: string }> = [];
  for (const image of images) {
    const entry = image as {
      b64_json?: unknown;
      base64?: unknown;
      image_base64?: unknown;
      image_url?: { url?: unknown };
    } | null | undefined;
    const inlineBase64 = typeof entry?.b64_json === 'string'
      ? entry.b64_json
      : typeof entry?.base64 === 'string'
        ? entry.base64
        : typeof entry?.image_base64 === 'string'
          ? entry.image_base64
          : null;
    if (inlineBase64 && inlineBase64.length > 0) {
      normalized.push({ b64_json: inlineBase64 });
      continue;
    }
    const url = entry?.image_url?.url;
    if (typeof url !== 'string' || url.length === 0) continue;
    const b64 = dataUriBase64(url);
    if (b64) {
      normalized.push({ b64_json: b64 });
    } else {
      normalized.push({ url });
    }
  }
  return normalized;
}

function normalizeChatImageMessage(message: { images?: unknown; content?: unknown } | undefined): Array<{ b64_json?: string; url?: string }> {
  const directImages = normalizeChatImageData(message?.images);
  if (directImages.length > 0) return directImages;

  const svg = extractSvgFromChatContent(message?.content);
  if (!svg) return [];

  return [{ url: `data:image/svg+xml;base64,${base64EncodeUtf8(svg)}` }];
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
    throw await gatewayRequestError('Image generation', res);
  }
  const json = await res.json() as { created?: unknown; data?: unknown };
  return {
    created: typeof json.created === 'number' ? json.created : Date.now(),
    data: Array.isArray(json.data) ? json.data as Array<{ b64_json?: string; url?: string }> : [],
    generationId: res.headers.get('x-vercel-ai-generation-id'),
  };
}

/** OpenAI-compatible image edits through the AI Gateway images endpoint. */
export async function editImage(body: ImageEditBody, userId: string, sessionId: string): Promise<ImageGenerationResponse> {
  const res = await fetch(`${AI_GATEWAY_BASE_URL}/images/edits`, {
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
    throw await gatewayRequestError('Image edit', res);
  }
  const json = await res.json() as { created?: unknown; data?: unknown };
  return {
    created: typeof json.created === 'number' ? json.created : Date.now(),
    data: Array.isArray(json.data) ? json.data as Array<{ b64_json?: string; url?: string }> : [],
    generationId: res.headers.get('x-vercel-ai-generation-id'),
  };
}

/** Image generation through chat completions for language models with image output. */
export async function generateImageViaChatCompletions(
  body: ImageCapableChatGenerationBody,
  userId: string,
  sessionId: string,
): Promise<ImageGenerationResponse> {
  const res = await fetch(`${AI_GATEWAY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.AI_GATEWAY_API_KEY!}`,
      'Content-Type': 'application/json',
      'x-vercel-ai-user-id': userId,
      'x-vercel-ai-tag': sessionId,
    },
    body: JSON.stringify({
      model: body.model,
      messages: [{ role: 'user', content: body.prompt }],
      modalities: ['text', 'image'],
      stream: false,
      ...(typeof body.n === 'number' ? { n: body.n } : {}),
      ...(typeof body.size === 'string' ? { size: body.size } : {}),
      ...(body.providerOptions && typeof body.providerOptions === 'object' ? { providerOptions: body.providerOptions } : {}),
    }),
  });
  if (!res.ok) {
    throw await gatewayRequestError('Image generation', res);
  }

  const json = await res.json() as {
    created?: unknown;
    choices?: Array<{ message?: { images?: unknown } }>;
  };
  const message = Array.isArray(json.choices) ? json.choices[0]?.message : undefined;
  return {
    created: typeof json.created === 'number' ? json.created : Date.now(),
    data: normalizeChatImageMessage(message),
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
