/**
 * The model catalog behind GET /api/models, GET /api/models/images and /api/chat: a pass-through
 * of Vercel AI Gateway's public listing. Every priced language model (except -batch variants) is
 * offered for chat, while the image catalog is an explicit exact-id subset of image-capable models
 * Tulzo currently proxies, with Vercel's price × Tulzo's markup. When the listing can't be fetched
 * and nothing is cached, the built-in list in src/config/gateway-models.ts stands in for chat.
 * Edge-safe (fetch only).
 */
import { GATEWAY_MODELS, type GatewayModel } from '../../config/gateway-models.ts';

export const VERCEL_MODELS_URL = 'https://ai-gateway.vercel.sh/v1/models';
// Tests point AI_GATEWAY_MODELS_URL at a closed local port (the built-in list then stands in),
// the same way STRIPE_API_BASE and GITHUB_API_BASE point at fakes. Unset in every deploy.
export const MODELS_URL = '/api/models';
export const IMAGE_MODELS_URL = '/api/models/images';
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
  pricing?: {
    input?: string;
    output?: string;
    input_cache_read?: string;
    image?: string;
    image_dimension_quality_pricing?: Array<{ size: string; cost: string }>;
  };
}

export interface CatalogModel {
  type: 'language';
  id: string;
  name: string;
  context_window: number | null;
  max_output_tokens: number | null;
  pricing: { input_per_1m: number; output_per_1m: number; cached_input_per_1m?: number };
  supports_tools: boolean;
  supports_vision: boolean;
}

export interface ImageCatalogModel {
  type: 'image' | 'language';
  id: string;
  name: string;
  pricing: {
    image_per_image?: number;
    input_per_1m?: number;
    output_per_1m?: number;
    cached_input_per_1m?: number;
  };
  input_modalities: string[];
  output_modalities: string[];
  response_formats: Array<'b64_json' | 'url'>;
  supports_stream: false;
  supports_edits: boolean;
  edits: ImageEditSupport | null;
}

export interface ImageEditSupport {
  content_types: Array<'application/json'>;
  image_sources: Array<'https' | 'data'>;
  file_id: false;
  mask: false;
  multipart: false;
}

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
}

export interface ImagePrice {
  image?: number;
  inputPer1M?: number;
  outputPer1M?: number;
  cachedInputPer1M?: number;
}

interface TulzoImageModelRegistryEntry {
  edits: ImageEditSupport | null;
}

const JSON_ONLY_IMAGE_EDIT_SUPPORT = {
  content_types: ['application/json'],
  image_sources: ['https', 'data'],
  file_id: false,
  mask: false,
  multipart: false,
} satisfies ImageEditSupport;

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

/** Base pricing for image-generation models; some models are priced per image, others with token-like fields. */
export function imagePriceFromListing(v: VercelModel): ImagePrice | null {
  const image = typeof v.pricing?.image === 'string' && v.pricing.image.trim() !== '' ? Number(v.pricing.image) : null;
  const inputPer1M = perTokenToPer1M(v.pricing?.input);
  const outputPer1M = perTokenToPer1M(v.pricing?.output);
  const cachedInputPer1M = perTokenToPer1M(v.pricing?.input_cache_read);
  const price: ImagePrice = {};
  if (image !== null && Number.isFinite(image) && image >= 0) price.image = image;
  if (inputPer1M !== null) price.inputPer1M = inputPer1M;
  if (outputPer1M !== null) price.outputPer1M = outputPer1M;
  if (cachedInputPer1M !== null) price.cachedInputPer1M = cachedInputPer1M;
  return price.image !== undefined || price.inputPer1M !== undefined || price.outputPer1M !== undefined ? price : null;
}

/** A model /api/chat can call: a priced language model, not a -batch variant (those are for the batch API). */
export function isChatModel(v: VercelModel): boolean {
  return v.type === 'language' && !v.id.endsWith('-batch') && priceFromListing(v) !== null;
}

/** An image-generation model the dedicated images route may call. */
export function isImageGenerationModel(v: VercelModel): boolean {
  if (v.type === 'image') return imagePriceFromListing(v) !== null;
  return v.type === 'language'
    && !v.id.endsWith('-batch')
    && (v.modalities?.output?.includes('image') ?? false)
    && imagePriceFromListing(v) !== null;
}

/** Exact image model ids Tulzo currently proxies on the shared image surface. */
export const TULZO_IMAGE_MODEL_REGISTRY = {
  'bfl/flux-kontext-pro': { edits: JSON_ONLY_IMAGE_EDIT_SUPPORT },
  'microsoft/mai-image-2.6-flash': { edits: JSON_ONLY_IMAGE_EDIT_SUPPORT },
  'openai/gpt-image-1-mini': { edits: JSON_ONLY_IMAGE_EDIT_SUPPORT },
  'quiverai/arrow-2': { edits: null },
  'recraft/recraft-v4.1-flash': { edits: null },
  'spacexai/grok-imagine-image': { edits: JSON_ONLY_IMAGE_EDIT_SUPPORT },
} satisfies Record<string, TulzoImageModelRegistryEntry>;

/** Exact image model ids Tulzo currently proxies on POST /api/images/edits. */
export const TULZO_IMAGE_EDIT_MODEL_REGISTRY: Record<string, ImageEditSupport> = Object.fromEntries(
  Object.entries(TULZO_IMAGE_MODEL_REGISTRY)
    .flatMap(([id, support]) => support.edits ? [[id, support.edits]] : []),
);

/** True only for exact ids Tulzo is willing to proxy on its image routes. */
export function isTulzoImageGenerationModel(id: string): boolean {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TULZO_IMAGE_MODEL_REGISTRY, id);
}

/** The chat models of a listing, sorted by id. */
export function chatModels(listing: readonly VercelModel[]): VercelModel[] {
  return listing.filter(isChatModel).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The exact image-generation models Tulzo proxies from a listing, sorted by id. */
export function imageGenerationModels(listing: readonly VercelModel[]): VercelModel[] {
  return listing
    .filter((v) => isImageGenerationModel(v) && isTulzoImageGenerationModel(v.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** True only for exact ids Tulzo is willing to proxy on POST /api/images/edits. */
export function isTulzoImageEditModel(id: string): boolean {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TULZO_IMAGE_EDIT_MODEL_REGISTRY, id);
}

/** The image-edit models of a listing, sorted by id. */
export function imageEditModels(listing: readonly VercelModel[]): VercelModel[] {
  return imageGenerationModels(listing).filter((m) => isTulzoImageEditModel(m.id));
}

/** Route-specific edit metadata for a model, or null when Tulzo does not proxy edits for it. */
export function imageEditSupportForModel(id: string): ImageEditSupport | null {
  if (!isTulzoImageEditModel(id)) return null;
  const support = TULZO_IMAGE_EDIT_MODEL_REGISTRY[id as keyof typeof TULZO_IMAGE_EDIT_MODEL_REGISTRY];
  return {
    content_types: [...support.content_types],
    image_sources: [...support.image_sources],
    file_id: support.file_id,
    mask: support.mask,
    multipart: support.multipart,
  };
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

function pricedImage(price: ImagePrice, markup: number): ImageCatalogModel['pricing'] {
  const pricing: ImageCatalogModel['pricing'] = {};
  if (price.image !== undefined) pricing.image_per_image = round6(price.image * markup);
  if (price.inputPer1M !== undefined) pricing.input_per_1m = round6(price.inputPer1M * markup);
  if (price.outputPer1M !== undefined) pricing.output_per_1m = round6(price.outputPer1M * markup);
  if (price.cachedInputPer1M !== undefined) pricing.cached_input_per_1m = round6(price.cachedInputPer1M * markup);
  return pricing;
}

function fallbackEntry(row: GatewayModel, markup: number): CatalogModel {
  return {
    type: 'language',
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
    type: 'language' as const,
    id: v.id,
    name: v.name || v.id,
    context_window: positiveIntOrNull(v.context_window),
    max_output_tokens: positiveIntOrNull(v.max_tokens),
    pricing: priced(priceFromListing(v)!, markup),
    supports_tools: v.supported_parameters?.includes('tools') ?? false,
    supports_vision: v.modalities?.input?.includes('image') ?? false,
  }));
}

/** Every model /api/images/generations may call, with truthful upstream type and explicit edit metadata. */
export function buildImageCatalog(listing: readonly VercelModel[], markup: number): ImageCatalogModel[] {
  return imageGenerationModels(listing).map((v) => {
    const edits = imageEditSupportForModel(v.id);
    return {
      type: v.type === 'language' ? 'language' : 'image',
      id: v.id,
      name: v.name || v.id,
      pricing: pricedImage(imagePriceFromListing(v) ?? {}, markup),
      input_modalities: v.modalities?.input?.filter((m): m is string => typeof m === 'string') ?? ['text'],
      output_modalities: v.modalities?.output?.filter((m): m is string => typeof m === 'string') ?? ['image'],
      response_formats: ['b64_json', 'url'],
      supports_stream: false,
      supports_edits: edits !== null,
      edits,
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

/** The base pricing of a model /api/images/generations may call. null for any other model. */
export async function imageGenerationModelPrice(id: string): Promise<ImagePrice | null> {
  if (typeof id !== 'string') return null;
  const models = imageGenerationModels(await fetchVercelListing());
  const v = models.find((m) => m.id === id);
  return v ? imagePriceFromListing(v) : null;
}

/** The base pricing of a model POST /api/images/edits may call. null for any other model. */
export async function imageEditModelPrice(id: string): Promise<ImagePrice | null> {
  if (typeof id !== 'string' || !isTulzoImageEditModel(id)) return null;
  const models = imageEditModels(await fetchVercelListing());
  const v = models.find((m) => m.id === id);
  return v ? imagePriceFromListing(v) : null;
}

/** The /api/chat 400 body for a model that isn't on the allowlist. */
export function modelNotAllowedBody(model: string): { error: string; code: 'model_not_allowed'; model: string; models_url: string } {
  return modelNotAllowedBodyFor(model, MODELS_URL);
}

/** The 400 body for a model that isn't on a route's allowlist, pointing at that route's discovery URL. */
export function modelNotAllowedBodyFor(model: string, modelsUrl: string): { error: string; code: 'model_not_allowed'; model: string; models_url: string } {
  return {
    error: `Model "${model}" is not offered by the Tulzo gateway. GET ${modelsUrl} lists the models you can use.`,
    code: 'model_not_allowed',
    model,
    models_url: modelsUrl,
  };
}
