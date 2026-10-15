/**
 * The model catalog behind GET /api/models and /api/chat: a pass-through of Vercel AI Gateway's
 * public listing. Every priced language model (except -batch variants) is offered, with Vercel's
 * price × Tulzo's markup, so what is listed is what /api/chat bills. When the listing can't be
 * fetched and nothing is cached, the built-in list in src/config/gateway-models.ts stands in.
 * Edge-safe (fetch only).
 */
import { GATEWAY_MODELS, type GatewayModel } from '../../config/gateway-models.ts';

export const VERCEL_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
// Tests point AI_GATEWAY_MODELS_URL at a closed local port (the built-in list then stands in),
// the same way STRIPE_API_BASE and GITHUB_API_BASE point at fakes. Unset in every deploy.
export const MODELS_URL = '/api/models';
const CACHE_TTL_MS = 60 * 60 * 1000;

/** The fields Tulzo reads from one entry of Vercel's /v1/models listing. */
export interface VercelModel {
  id: string;
  name?: string;
  type?: string;
  context_window?: number | null;
  max_tokens?: number | null;
  supported_parameters?: string[];
  modalities?: { input?: string[]; output?: string[] };
  pricing?: { input?: string; output?: string; input_cache_read?: string };
}

export interface CatalogModel {
  id: string;
  name: string;
  context_window: number | null;
  max_output_tokens: number | null;
  pricing: { input_per_1m: number; output_per_1m: number; cached_input_per_1m?: number };
  supports_tools: boolean;
  supports_vision: boolean;
}

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}

/** Round to 6 decimals: per-1M prices without binary float noise (0.15, not 0.15000000000000002). */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Vercel's USD-per-token string → USD per 1M tokens; null when missing or not a non-negative number. */
export function perTokenToPer1M(perToken: string | undefined | null): number | null {
  if (typeof perToken !== 'string' || perToken.trim() === '') return null;
  const n = Number(perToken);
  if (!Number.isFinite(n) || n < 0) return null;
  return round6(n * 1e6);
}

/** The base (pre-markup) per-1M price of a listing entry, or null without an input and output price. */
export function priceFromListing(v: VercelModel): ModelPrice | null {
  const inputPer1M = perTokenToPer1M(v.pricing?.input);
  const outputPer1M = perTokenToPer1M(v.pricing?.output);
  if (inputPer1M === null || outputPer1M === null) return null;
  const cached = perTokenToPer1M(v.pricing?.input_cache_read);
  return cached === null ? { inputPer1M, outputPer1M } : { inputPer1M, outputPer1M, cachedInputPer1M: cached };
}

/** A model /api/chat can call: a priced language model, not a -batch variant (those are for the batch API). */
export function isChatModel(v: VercelModel): boolean {
  return v.type === 'language' && !v.id.endsWith('-batch') && priceFromListing(v) !== null;
}

/** The chat models of a listing, sorted by id. */
export function chatModels(listing: readonly VercelModel[]): VercelModel[] {
  return listing.filter(isChatModel).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function positiveIntOrNull(n: unknown): number | null {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

function priced(price: ModelPrice, markup: number): CatalogModel['pricing'] {
  const pricing: CatalogModel['pricing'] = {
    input_per_1m: round6(price.inputPer1M * markup),
    output_per_1m: round6(price.outputPer1M * markup),
  };
  if (price.cachedInputPer1M !== undefined) pricing.cached_input_per_1m = round6(price.cachedInputPer1M * markup);
  return pricing;
}

function fallbackEntry(row: GatewayModel, markup: number): CatalogModel {
  return {
    id: row.id,
    name: row.name,
    context_window: null,
    max_output_tokens: null,
    pricing: priced(row, markup),
    supports_tools: false,
    supports_vision: false,
  };
}

/**
 * Every Vercel chat model with its metadata and price × markup (sorted by id). When the listing
 * has no chat model (Vercel unreachable and nothing cached), the built-in fallback list instead.
 */
export function buildCatalog(listing: readonly VercelModel[], markup: number): CatalogModel[] {
  const models = chatModels(listing);
  if (models.length === 0) return GATEWAY_MODELS.map((row) => fallbackEntry(row, markup));
  return models.map((v) => ({
    id: v.id,
    name: v.name || v.id,
    context_window: positiveIntOrNull(v.context_window),
    max_output_tokens: positiveIntOrNull(v.max_tokens),
    pricing: priced(priceFromListing(v)!, markup),
    supports_tools: v.supported_parameters?.includes('tools') ?? false,
    supports_vision: v.modalities?.input?.includes('image') ?? false,
  }));
}

let cache: { at: number; data: VercelModel[] } | null = null;

/** Test hook: forget the cached listing. */
export function __resetModelCatalogCache(): void {
  cache = null;
}

/**
 * Vercel's model listing, cached for an hour in this instance. On failure (HTTP error, network
 * error, a body without a data array) it returns the last good listing, or [] (metadata then shows
 * null); it never throws.
 */
export async function fetchVercelListing(now: number = Date.now()): Promise<VercelModel[]> {
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.data;
  try {
    const res = await fetch(process.env.AI_GATEWAY_MODELS_URL || VERCEL_MODELS_URL, { headers: { accept: 'application/json' } });
    if (!res.ok) return cache?.data ?? [];
    const body = (await res.json()) as { data?: unknown } | null;
    if (!Array.isArray(body?.data)) return cache?.data ?? [];
    const data = (body.data as VercelModel[]).filter((m) => m && typeof m.id === 'string');
    cache = { at: now, data };
    return data;
  } catch {
    return cache?.data ?? [];
  }
}

/**
 * The base (pre-markup) per-1M price of a model /api/chat may call, from the cached Vercel listing;
 * from the built-in fallback list when the listing has no chat model. null for any other model.
 */
export async function chatModelPrice(id: string): Promise<ModelPrice | null> {
  if (typeof id !== 'string') return null;
  const models = chatModels(await fetchVercelListing());
  if (models.length === 0) {
    const row = GATEWAY_MODELS.find((m) => m.id === id);
    if (!row) return null;
    const { inputPer1M, outputPer1M, cachedInputPer1M } = row;
    return cachedInputPer1M === undefined ? { inputPer1M, outputPer1M } : { inputPer1M, outputPer1M, cachedInputPer1M };
  }
  const v = models.find((m) => m.id === id);
  return v ? priceFromListing(v) : null;
}

/** The /api/chat 400 body for a model that isn't on the allowlist. */
export function modelNotAllowedBody(model: string): { error: string; code: 'model_not_allowed'; model: string; models_url: string } {
  return {
    error: `Model "${model}" is not offered by the Tulzo gateway. GET ${MODELS_URL} lists the models you can use.`,
    code: 'model_not_allowed',
    model,
    models_url: MODELS_URL,
  };
}
