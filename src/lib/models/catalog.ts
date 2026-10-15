/**
 * The model catalog behind GET /api/models: the Tulzo allowlist (src/config/gateway-models.ts)
 * joined with Vercel AI Gateway's public listing for context window, output limit and
 * capabilities. Prices always come from the allowlist table (× the billing markup), so what is
 * listed is what /api/chat bills, and a Vercel outage only blanks the metadata.
 * Edge-safe (fetch only).
 */
import { GATEWAY_MODELS, type GatewayModel } from '../../config/gateway-models.ts';

export const VERCEL_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
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

const BY_ID = new Map(GATEWAY_MODELS.map((m) => [m.id, m]));

/** The allowlist row for an exact model id, or null. */
export function findAllowedModel(id: unknown): GatewayModel | null {
  return typeof id === 'string' ? BY_ID.get(id) ?? null : null;
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

function positiveIntOrNull(n: unknown): number | null {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/** Allowlisted models, in table order, with listing metadata and prices × markup. */
export function buildCatalog(listing: readonly VercelModel[], markup: number): CatalogModel[] {
  const listed = new Map(listing.map((m) => [m.id, m]));
  return GATEWAY_MODELS.map((row) => {
    const v = listed.get(row.id);
    const pricing: CatalogModel['pricing'] = {
      input_per_1m: round6(row.inputPer1M * markup),
      output_per_1m: round6(row.outputPer1M * markup),
    };
    if (row.cachedInputPer1M !== undefined) pricing.cached_input_per_1m = round6(row.cachedInputPer1M * markup);
    return {
      id: row.id,
      name: row.name,
      context_window: positiveIntOrNull(v?.context_window),
      max_output_tokens: positiveIntOrNull(v?.max_tokens),
      pricing,
      supports_tools: v?.supported_parameters?.includes('tools') ?? false,
      supports_vision: v?.modalities?.input?.includes('image') ?? false,
    };
  });
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
    const res = await fetch(VERCEL_MODELS_URL, { headers: { accept: 'application/json' } });
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

/** The /api/chat 400 body for a model that isn't on the allowlist. */
export function modelNotAllowedBody(model: string): { error: string; code: 'model_not_allowed'; model: string; models_url: string } {
  return {
    error: `Model "${model}" is not offered by the Tulzo gateway. GET ${MODELS_URL} lists the models you can use.`,
    code: 'model_not_allowed',
    model,
    models_url: MODELS_URL,
  };
}
