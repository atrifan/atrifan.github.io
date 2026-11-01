import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { req } from './vitest-env';

/**
 * Contract: GET /api/models passes through every priced chat model in Vercel's gateway listing
 * (marked up by chatBillingMarkup()), with a built-in fallback when the listing is unavailable;
 * POST /api/chat accepts exactly the listed chat models; POST /api/images/generations accepts
 * image-generation models without widening /api/models; GET /api/plugin/config points at both
 * /api/models and /api/models/images.
 * No network or database: Supabase is a fake, fetch is stubbed, `ai` is mocked.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  insertCalls: [] as Array<{ table: string; values: unknown }>,
}));

vi.mock('@supabase/supabase-js', () => {
  const resolved = { data: null, error: null };
  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let writing = false;
    const rows = () => (writing ? [] : (state.tables[table] ?? []).filter((r) => filters.every((f) => f(r))));
    const b: Record<string, unknown> = {};
    const chain = () => b;
    for (const m of ['select', 'order', 'limit', 'range', 'returns', 'abortSignal', 'filter', 'match', 'or', 'not', 'is', 'like', 'ilike', 'contains', 'neq']) {
      b[m] = chain;
    }
    b.eq = (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return b;
    };
    b.in = (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return b;
    };
    for (const m of ['gt', 'gte', 'lt', 'lte']) b[m] = chain;
    b.insert = (values: unknown) => {
      writing = true;
      state.insertCalls.push({ table, values });
      return b;
    };
    for (const m of ['update', 'upsert', 'delete']) {
      b[m] = () => {
        writing = true;
        return b;
      };
    }
    b.single = async () => {
      const r = rows();
      return r.length ? { data: r[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    };
    b.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
      Promise.resolve(writing ? resolved : { data: rows(), error: null, count: rows().length }).then(ok, ko);
    return b;
  }
  const client = {
    from: (table: string) => builder(table),
    rpc: async (fn: string, args?: unknown) => {
      state.rpcCalls.push({ fn, args });
      return resolved;
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    storage: { from: () => ({ upload: async () => resolved, getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), send: async () => 'ok', subscribe: () => ({}) }),
    removeChannel: async () => 'ok',
  };
  return { createClient: () => client };
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: null, sessionClaims: {} }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: async () => null } }),
}));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const usage = { promptTokens: 1, completionTokens: 1, totalTokens: 2, inputTokens: 1, outputTokens: 1 };
  return {
    ...actual,
    streamText: vi.fn(() => ({
      text: Promise.resolve('ok'),
      usage: Promise.resolve(usage),
      totalUsage: Promise.resolve(usage),
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {})(),
      textStream: (async function* () {})(),
    })),
    generateText: vi.fn(async () => ({ text: 'ok', usage, totalUsage: usage, finishReason: 'stop' })),
  };
});

const LISTING_URL = 'https://ai-gateway.vercel.sh/v1/models';
const IMAGE_URL = 'https://ai-gateway.vercel.sh/v1/images/generations';
const IMAGE_EDITS_URL = 'https://ai-gateway.vercel.sh/v1/images/edits';
const CHAT_COMPLETIONS_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const GENERATION_URL = 'https://ai-gateway.vercel.sh/v1/generation?id=';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const IMAGE_MODEL = 'spacexai/grok-imagine-image';
const GENERATION_ONLY_IMAGE_MODEL = 'recraft/recraft-v4.1-flash';
const SECOND_EDIT_IMAGE_MODEL = 'bfl/flux-kontext-pro';
const THIRD_EDIT_IMAGE_MODEL = 'microsoft/mai-image-2.6-flash';
const LANGUAGE_IMAGE_MODEL = 'quiverai/arrow-2';
const BLOCKED_LANGUAGE_IMAGE_MODEL = 'google/gemini-3.1-flash-image-preview';
const EDIT_MODEL = 'openai/gpt-image-1-mini';
const BLOCKED_EDIT_MODEL = 'openai/gpt-image-2';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const KEYS = {
  free: 'ak_test_free_key',
  pro: 'ak_test_pro_key',
  plus: 'ak_test_plus_key',
  super: 'ak_test_super_key',
  inactive: 'ak_test_inactive_key',
};

function seed() {
  state.tables = {
    api_keys: [
      { id: 'k-free', user_id: 'u-free', plan: 'free', is_active: true, api_key_hash: sha(KEYS.free) },
      { id: 'k-pro', user_id: 'u-pro', plan: 'pro', is_active: true, api_key_hash: sha(KEYS.pro) },
      { id: 'k-plus', user_id: 'u-plus', plan: 'plus', is_active: true, api_key_hash: sha(KEYS.plus) },
      { id: 'k-super', user_id: 'u-super', plan: 'super', is_active: true, api_key_hash: sha(KEYS.super) },
      { id: 'k-inactive', user_id: 'u-inactive', plan: 'plus', is_active: false, api_key_hash: sha(KEYS.inactive) },
    ],
    user_budgets: ['u-free', 'u-pro', 'u-plus', 'u-super', 'u-inactive'].map((user_id) => ({
      user_id,
      remaining_balance: 5,
      status: 'active',
    })),
  };
}

type ListingEntry = Record<string, unknown>;
const NEW_MODEL = 'vendor/some-new-model';
const BATCH_MODEL = 'openai/gpt-4o-mini-batch';
const EMBEDDING_MODEL = 'openai/text-embedding-3-small';

// Deliberately unsorted.
const listingData: ListingEntry[] = [
  {
    id: NEW_MODEL,
    object: 'model',
    type: 'language',
    context_window: 64000,
    max_tokens: 4096,
    supported_parameters: ['temperature'],
    modalities: { input: ['text'], output: ['text'] },
    pricing: { input: '0.000002', output: '0.000008' },
  },
  {
    id: DEFAULT_MODEL,
    object: 'model',
    name: 'GPT-4o mini',
    type: 'language',
    context_window: 128000,
    max_tokens: 16384,
    supported_parameters: ['temperature', 'tools', 'tool_choice'],
    modalities: { input: ['text', 'image'], output: ['text'] },
    pricing: { input: '0.00000015', output: '0.0000006', input_cache_read: '0.000000075' },
  },
  {
    id: 'anthropic/claude-test',
    object: 'model',
    name: 'Claude Test',
    type: 'language',
    max_tokens: 8192,
    supported_parameters: ['tools'],
    modalities: { input: ['text'], output: ['text'] },
    pricing: { input: '0.000003', output: '0.000015' },
  },
  {
    id: BATCH_MODEL,
    object: 'model',
    name: 'GPT-4o mini (batch)',
    type: 'language',
    context_window: 128000,
    max_tokens: 16384,
    pricing: { input: '0.000000075', output: '0.0000003' },
  },
  {
    id: EMBEDDING_MODEL,
    object: 'model',
    name: 'Embedding',
    type: 'embedding',
    context_window: 8191,
    pricing: { input: '0.00000002', output: '0.00000002' },
  },
  {
    id: IMAGE_MODEL,
    object: 'model',
    name: 'Grok Imagine Image',
    type: 'image',
    modalities: { input: ['text'], output: ['image'] },
      pricing: { image: '0.02' },
  },
  {
    id: GENERATION_ONLY_IMAGE_MODEL,
    object: 'model',
    name: 'Recraft V4.1 Flash',
    type: 'image',
    modalities: { input: ['text'], output: ['image'] },
    pricing: { image: '0.007' },
  },
  {
    id: SECOND_EDIT_IMAGE_MODEL,
    object: 'model',
    name: 'FLUX.1 Kontext Pro',
    type: 'image',
    modalities: { input: ['text'], output: ['image'] },
    pricing: { image: '0.04' },
  },
  {
    id: THIRD_EDIT_IMAGE_MODEL,
    object: 'model',
    name: 'MAI-Image-2.6-Flash',
    type: 'image',
    modalities: { input: ['text'], output: ['image'] },
    pricing: { input: '0.00000175', output: '0.000019' },
  },
  {
    id: EDIT_MODEL,
    object: 'model',
    name: 'GPT Image 1 Mini',
    type: 'image',
    modalities: { input: ['text'], output: ['image'] },
    pricing: { input: '0.000002', output: '0.000008', input_cache_read: '0.0000002' },
  },
  {
    id: LANGUAGE_IMAGE_MODEL,
    object: 'model',
    name: 'Arrow 2',
    type: 'language',
    modalities: { input: ['text', 'image'], output: ['text', 'image'] },
    pricing: { input: '0.000004', output: '0.00002', input_cache_read: '0.0000004' },
  },
  {
    id: BLOCKED_LANGUAGE_IMAGE_MODEL,
    object: 'model',
    name: 'Gemini 3.1 Flash Image Preview',
    type: 'language',
    modalities: { input: ['text', 'image'], output: ['text', 'image'] },
    pricing: { input: '0.0000004', output: '0.0000012', input_cache_read: '0.0000001' },
  },
  {
    id: BLOCKED_EDIT_MODEL,
    object: 'model',
    name: 'GPT Image 2',
    type: 'image',
    modalities: { input: ['text'], output: ['image'] },
    pricing: { input: '0.000005', output: '0.00003', input_cache_read: '0.00000125' },
  },
  { id: 'vendor/no-price', object: 'model', name: 'No price', type: 'language', context_window: 1000 },
  {
    id: 'vendor/output-missing',
    object: 'model',
    name: 'Output missing',
    type: 'language',
    pricing: { input: '0.000001' },
  },
  {
    id: 'vendor/bad-price',
    object: 'model',
    name: 'Bad price',
    type: 'language',
    pricing: { input: 'n/a', output: 'n/a' },
  },
];
const EXPECTED_IDS = [
  DEFAULT_MODEL,
  LANGUAGE_IMAGE_MODEL,
  BLOCKED_LANGUAGE_IMAGE_MODEL,
  NEW_MODEL,
  'anthropic/claude-test',
].sort();

type FetchMode = 'ok' | '500' | 'throw' | 'no-data';
let fetchMode: FetchMode = 'ok';
let imageGenerationFailure: { status: number; body: Record<string, unknown> } | null = null;
let imageEditFailure: { status: number; body: Record<string, unknown> } | null = null;
let imageChatFailure: { status: number; body: Record<string, unknown> } | null = null;
const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  if (url.startsWith(LISTING_URL)) {
    if (fetchMode === 'throw') throw new Error('network down');
    if (fetchMode === '500') return new Response('boom', { status: 500 });
    const body = fetchMode === 'no-data' ? { object: 'list' } : { object: 'list', data: listingData };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === IMAGE_URL) {
    if (imageGenerationFailure) {
      return new Response(JSON.stringify(imageGenerationFailure.body), {
        status: imageGenerationFailure.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { response_format?: string };
    const data = body.response_format === 'url'
      ? [{ url: 'https://cdn.example.test/generated.png' }]
      : [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }];
    return new Response(JSON.stringify({ created: 1_730_000_000, data }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-vercel-ai-generation-id': 'img_gen_1',
      },
    });
  }
  if (url === IMAGE_EDITS_URL) {
    if (imageEditFailure) {
      return new Response(JSON.stringify(imageEditFailure.body), {
        status: imageEditFailure.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as { response_format?: string };
    const data = body.response_format === 'url'
      ? [{ url: 'https://cdn.example.test/edited.png' }]
      : [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAAC' }];
    return new Response(JSON.stringify({ created: 1_730_000_111, data, ignored: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-vercel-ai-generation-id': 'img_edit_1',
      },
    });
  }
  if (url === CHAT_COMPLETIONS_URL) {
    if (imageChatFailure) {
      return new Response(JSON.stringify(imageChatFailure.body), {
        status: imageChatFailure.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      created: 1_730_000_100,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Here is your image.',
          images: [{
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=',
            },
          }],
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
      },
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-vercel-ai-generation-id': 'chat_img_gen_1',
      },
    });
  }
  if (url.startsWith(GENERATION_URL)) {
    const total_cost = url.endsWith('chat_img_gen_1') ? '0.0000016' : '0.02';
    return new Response(JSON.stringify({ data: { total_cost } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('not found', { status: 404 });
});
const urlOf = (call: unknown[]) => {
  const input = call[0];
  return typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request)?.url ?? '';
};
const listingCalls = () => fetchMock.mock.calls.filter((c) => urlOf(c).startsWith(LISTING_URL)).length;
/** Gateway calls other than the model listing (i.e. inference). */
const inferenceCalls = () =>
  fetchMock.mock.calls.filter((c) => urlOf(c).includes('ai-gateway') && !urlOf(c).startsWith(LISTING_URL)).length;
const imageCalls = () => fetchMock.mock.calls.filter((c) => urlOf(c) === IMAGE_URL);
const imageEditCalls = () => fetchMock.mock.calls.filter((c) => urlOf(c) === IMAGE_EDITS_URL);
const imageChatCalls = () => fetchMock.mock.calls.filter((c) => urlOf(c) === CHAT_COMPLETIONS_URL);

type Model = {
  type: 'language';
  id: string;
  name: string;
  context_window: number | null;
  max_output_tokens: number | null;
  pricing: { input_per_1m: number; output_per_1m: number; cached_input_per_1m?: number };
  supports_tools: boolean;
  supports_vision: boolean;
};
type ImageModel = {
  type: 'image' | 'language';
  id: string;
  name: string;
  pricing: { image_per_image?: number; input_per_1m?: number; output_per_1m?: number; cached_input_per_1m?: number };
  input_modalities: string[];
  output_modalities: string[];
  response_formats: Array<'b64_json' | 'url'>;
  supports_stream: false;
  supports_edits: boolean;
  edits: null | {
    content_types: ['application/json'];
    image_sources: ['https', 'data'];
    file_id: false;
    mask: false;
    multipart: false;
  };
};
type Price = { inputPer1M: number; outputPer1M: number; cachedInputPer1M?: number };

beforeEach(async () => {
  vi.resetModules();
  seed();
  state.rpcCalls = [];
  state.insertCalls = [];
  fetchMode = 'ok';
  imageGenerationFailure = null;
  imageEditFailure = null;
  imageChatFailure = null;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-gateway-key');
  vi.stubEnv('CREDIT_MARKUP', '1.3');
  for (const n of ['STORAGE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) vi.stubEnv(n, 'http://supabase.test');
  for (const n of ['STORAGE_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STORAGE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    vi.stubEnv(n, 'service-role-test');
  }
  const { __resetModelCatalogCache } = await import('@/src/lib/models/catalog');
  __resetModelCatalogCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function getModels(headers: Record<string, string> = {}) {
  const { GET } = await import('@/app/api/models/route');
  return GET(req('/api/models', { headers }));
}
const bearer = (k: string) => ({ authorization: `Bearer ${k}` });
const listModels = async (key: string = KEYS.plus) => {
  const res = await getModels(bearer(key));
  expect(res.status).toBe(200);
  return (await res.json()).data as Model[];
};
const byId = (models: Model[], id: string) => {
  const m = models.find((x) => x.id === id);
  expect(m, `${id} listed`).toBeDefined();
  return m!;
};
const markup = async () => (await import('@/src/lib/ai-gateway')).chatBillingMarkup() as number;

const chat = async (body: Record<string, unknown>, headers: Record<string, string> = { 'x-api-key': KEYS.plus, 'content-type': 'application/json' }) => {
  const { POST } = await import('@/app/api/chat/route');
  return POST(
    req('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
};
const images = async (body: Record<string, unknown>, headers: Record<string, string> = { 'x-api-key': KEYS.plus, 'content-type': 'application/json' }) => {
  const { POST } = await import('@/app/api/images/generations/route');
  return POST(
    req('/api/images/generations', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
};
const edits = async (body: Record<string, unknown>, headers: Record<string, string> = { 'x-api-key': KEYS.plus, 'content-type': 'application/json' }) => {
  const { POST } = await import('@/app/api/images/edits/route');
  return POST(
    req('/api/images/edits', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
};
const listImageModels = async (headers: Record<string, string>) => {
  const { GET } = await import('@/app/api/models/images/route');
  return GET(req('/api/models/images', { headers }));
};
const hi = [{ role: 'user', content: 'hi' }];
const RESTRICTED_MODEL_ERROR = {
  error: {
    message: 'Free tier users do not have access to this model. Upgrade to paid credits at https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dtop-up for unrestricted access.',
    type: 'no_providers_available',
    param: {
      statusCode: 403,
      name: 'RestrictedModelsError',
      message: 'Free tier users do not have access to this model. Upgrade to paid credits at https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dtop-up for unrestricted access.',
    },
  },
  providerMetadata: {
    gateway: {
      routing: {
        originalModelId: EDIT_MODEL,
      },
    },
  },
};

describe('GET /api/models: auth', () => {
  it('401 with an error string when the Authorization header is missing', async () => {
    const res = await getModels();
    expect(res.status).toBe(401);
    expect(typeof (await res.json()).error).toBe('string');
  });

  it('401 for an unknown key', async () => {
    expect((await getModels(bearer('ak_unknown_key'))).status).toBe(401);
  });

  it('401 for an inactive key', async () => {
    expect((await getModels(bearer(KEYS.inactive))).status).toBe(401);
  });

  it('403 plan_required for a free key', async () => {
    const res = await getModels(bearer(KEYS.free));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'plan_required' });
  });

  for (const plan of ['pro', 'plus', 'super'] as const) {
    it(`200 for a ${plan} key`, async () => {
      expect((await getModels(bearer(KEYS[plan]))).status).toBe(200);
    });
  }
});

describe('GET /api/models: pass-through of the Vercel listing', () => {
  it('is { object: "list", data: Model[] } with the documented field types', async () => {
    const res = await getModels(bearer(KEYS.plus));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(Array.isArray(body.data)).toBe(true);
    for (const m of body.data as Model[]) {
      expect(m.type).toBe('language');
      expect(typeof m.id).toBe('string');
      expect(typeof m.name).toBe('string');
      expect(m.context_window === null || typeof m.context_window === 'number').toBe(true);
      expect(m.max_output_tokens === null || typeof m.max_output_tokens === 'number').toBe(true);
      expect(typeof m.pricing.input_per_1m).toBe('number');
      expect(typeof m.pricing.output_per_1m).toBe('number');
      if (m.pricing.cached_input_per_1m !== undefined) expect(typeof m.pricing.cached_input_per_1m).toBe('number');
      expect(typeof m.supports_tools).toBe('boolean');
      expect(typeof m.supports_vision).toBe('boolean');
    }
  });

  it('lists exactly the priced language models, excluding embeddings, -batch and unpriced entries', async () => {
    const ids = (await listModels()).map((m) => m.id);
    expect([...ids].sort()).toEqual(EXPECTED_IDS);
    expect(ids).toContain(NEW_MODEL);
    expect(ids).not.toContain(BATCH_MODEL);
    expect(ids).not.toContain(EMBEDDING_MODEL);
    expect(ids).not.toContain('vendor/no-price');
    expect(ids).not.toContain('vendor/output-missing');
    expect(ids).not.toContain('vendor/bad-price');
  });

  it('sorts data by id ascending', async () => {
    expect((await listModels()).map((m) => m.id)).toEqual(EXPECTED_IDS);
  });

  it('takes name from the listing, falling back to the id', async () => {
    const models = await listModels();
    expect(byId(models, DEFAULT_MODEL).name).toBe('GPT-4o mini');
    expect(byId(models, 'anthropic/claude-test').name).toBe('Claude Test');
    expect(byId(models, NEW_MODEL).name).toBe(NEW_MODEL);
  });

  it('takes context_window, max_output_tokens, tools and vision from the listing', async () => {
    const models = await listModels();
    const mini = byId(models, DEFAULT_MODEL);
    expect(mini.context_window).toBe(128000);
    expect(mini.max_output_tokens).toBe(16384);
    expect(mini.supports_tools).toBe(true);
    expect(mini.supports_vision).toBe(true);
    const fresh = byId(models, NEW_MODEL);
    expect(fresh.supports_tools).toBe(false);
    expect(fresh.supports_vision).toBe(false);
    const claude = byId(models, 'anthropic/claude-test');
    expect(claude.context_window).toBeNull();
    expect(claude.supports_tools).toBe(true);
  });
});

describe('GET /api/models: prices', () => {
  it('chatBillingMarkup() reads CREDIT_MARKUP', async () => {
    expect(await markup()).toBeCloseTo(1.3, 9);
  });

  it('input/output per 1M = listing price x 1e6 x markup (1.3)', async () => {
    const models = await listModels();
    const mini = byId(models, DEFAULT_MODEL);
    expect(mini.pricing.input_per_1m).toBeCloseTo(0.195, 9);
    expect(mini.pricing.output_per_1m).toBeCloseTo(0.78, 9);
    const fresh = byId(models, NEW_MODEL);
    expect(fresh.pricing.input_per_1m).toBeCloseTo(2.6, 9);
    expect(fresh.pricing.output_per_1m).toBeCloseTo(10.4, 9);
  });

  it('cached_input_per_1m comes from input_cache_read, omitted when absent', async () => {
    const models = await listModels();
    expect(byId(models, DEFAULT_MODEL).pricing.cached_input_per_1m).toBeCloseTo(0.000000075 * 1e6 * 1.3, 9);
    expect(byId(models, NEW_MODEL).pricing).not.toHaveProperty('cached_input_per_1m');
  });

  it('the markup applies to every plan: pro, plus and super see the same prices', async () => {
    const { GET } = await import('@/app/api/models/route');
    const prices = [];
    for (const k of [KEYS.pro, KEYS.plus, KEYS.super]) {
      const res = await GET(req('/api/models', { headers: bearer(k) }));
      expect(res.status).toBe(200);
      prices.push(((await res.json()).data as Model[]).map((m) => [m.id, m.pricing]));
    }
    expect(prices[1]).toEqual(prices[0]);
    expect(prices[2]).toEqual(prices[0]);
    expect(byId(await listModels(KEYS.super), DEFAULT_MODEL).pricing.input_per_1m).toBeCloseTo(0.195, 9);
  });

  it('shown = billed: pricing equals chatModelPrice(id) x chatBillingMarkup() for every listed id', async () => {
    const models = await listModels();
    const { chatModelPrice } = await import('@/src/lib/models/catalog');
    const m = await markup();
    expect(models.length).toBe(EXPECTED_IDS.length);
    for (const model of models) {
      const price = (await chatModelPrice(model.id)) as Price | null;
      expect(price, model.id).not.toBeNull();
      expect(model.pricing.input_per_1m).toBeCloseTo(price!.inputPer1M * m, 9);
      expect(model.pricing.output_per_1m).toBeCloseTo(price!.outputPer1M * m, 9);
      if (price!.cachedInputPer1M !== undefined) {
        expect(model.pricing.cached_input_per_1m).toBeCloseTo(price!.cachedInputPer1M * m, 9);
      }
    }
    const mini = (await chatModelPrice(DEFAULT_MODEL)) as Price;
    expect(mini.inputPer1M).toBeCloseTo(0.15, 9);
    expect(mini.outputPer1M).toBeCloseTo(0.6, 9);
  });

  it('chatModelPrice returns null for ids the listing does not offer', async () => {
    const { chatModelPrice } = await import('@/src/lib/models/catalog');
    expect(await chatModelPrice('openai/definitely-not-real')).toBeNull();
    expect(await chatModelPrice(BATCH_MODEL)).toBeNull();
    expect(await chatModelPrice(EMBEDDING_MODEL)).toBeNull();
  });
});

describe('Vercel listing unavailable (nothing cached)', () => {
  const modes: Array<[FetchMode, string]> = [
    ['500', 'returns 500'],
    ['throw', 'throws'],
    ['no-data', 'has no data array'],
  ];
  for (const [mode, label] of modes) {
    it(`listing ${label}: /api/models is 200 with the fallback list incl. openai/gpt-4o-mini`, async () => {
      fetchMode = mode;
      const models = await listModels();
      const mini = byId(models, DEFAULT_MODEL);
      expect(mini.context_window).toBeNull();
      expect(mini.pricing.input_per_1m).toBeGreaterThan(0);
      expect(mini.pricing.output_per_1m).toBeGreaterThan(0);
    });

    it(`listing ${label}: fallback prices are chatModelPrice x chatBillingMarkup()`, async () => {
      fetchMode = mode;
      const mini = byId(await listModels(), DEFAULT_MODEL);
      const { chatModelPrice } = await import('@/src/lib/models/catalog');
      const price = (await chatModelPrice(DEFAULT_MODEL)) as Price | null;
      expect(price).not.toBeNull();
      expect(price!.inputPer1M).toBeGreaterThan(0);
      expect(mini.pricing.input_per_1m).toBeCloseTo(price!.inputPer1M * (await markup()), 9);
      expect(mini.pricing.output_per_1m).toBeCloseTo(price!.outputPer1M * (await markup()), 9);
    });

    it(`listing ${label}: /api/chat still accepts openai/gpt-4o-mini`, async () => {
      fetchMode = mode;
      const res = await chat({ messages: hi, model: DEFAULT_MODEL, stream: false });
      expect(res.status).toBe(200);
    });
  }
});

describe('listing cache', () => {
  it('two GET /api/models in a row fetch the listing once', async () => {
    const { GET } = await import('@/app/api/models/route');
    expect((await GET(req('/api/models', { headers: bearer(KEYS.plus) }))).status).toBe(200);
    expect((await GET(req('/api/models', { headers: bearer(KEYS.pro) }))).status).toBe(200);
    expect(listingCalls()).toBe(1);
  });

  it('/api/models then /api/chat with a listed model fetch the listing once in total', async () => {
    expect((await getModels(bearer(KEYS.plus))).status).toBe(200);
    const res = await chat({ messages: hi, model: NEW_MODEL, stream: false });
    expect(res.status).toBe(200);
    expect(listingCalls()).toBe(1);
  });
});

describe('GET /api/plugin/config', () => {
  it('includes models_url: "/api/models" for a paid key', async () => {
    const { GET } = await import('@/app/api/plugin/config/route');
    const res = await GET(req('/api/plugin/config', { headers: bearer(KEYS.plus) }));
    expect(res.status).toBe(200);
    expect((await res.json()).models_url).toBe('/api/models');
  });

  it('includes image_models_url: "/api/models/images" for a paid key', async () => {
    const { GET } = await import('@/app/api/plugin/config/route');
    const res = await GET(req('/api/plugin/config', { headers: bearer(KEYS.plus) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      models_url: '/api/models',
      image_models_url: '/api/models/images',
    });
  });

  it('a super plan key gets 200 with a quotas object', async () => {
    const { GET } = await import('@/app/api/plugin/config/route');
    const res = await GET(req('/api/plugin/config', { headers: bearer(KEYS.super) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.quotas).toBe('object');
    expect(body.quotas).not.toBeNull();
  });
});

describe('GET /api/models/images: auth', () => {
  it('401 with an error string when the Authorization header is missing', async () => {
    const res = await listImageModels({});
    expect(res.status).toBe(401);
    expect(typeof (await res.json()).error).toBe('string');
  });

  it('401 for an unknown key', async () => {
    expect((await listImageModels(bearer('ak_unknown_key'))).status).toBe(401);
  });

  it('401 for an inactive key', async () => {
    expect((await listImageModels(bearer(KEYS.inactive))).status).toBe(401);
  });

  it('403 plan_required for a free key', async () => {
    const res = await listImageModels(bearer(KEYS.free));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'plan_required' });
  });

  for (const k of [KEYS.pro, KEYS.plus, KEYS.super]) {
    it(`200 for a paid key (${k})`, async () => {
      expect((await listImageModels(bearer(k))).status).toBe(200);
    });
  }
});

describe('GET /api/models/images', () => {
  it('lists image-generation models separately from /api/models, with truthful type, listing-derived price, and explicit edit metadata', async () => {
    const res = await listImageModels(bearer(KEYS.plus));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.object).toBe('list');
    expect(body.data.map((m: ImageModel) => m.id)).toEqual([
      SECOND_EDIT_IMAGE_MODEL,
      THIRD_EDIT_IMAGE_MODEL,
      EDIT_MODEL,
      LANGUAGE_IMAGE_MODEL,
      GENERATION_ONLY_IMAGE_MODEL,
      IMAGE_MODEL,
    ]);
    const models = body.data as ImageModel[];
    expect(models.find((m) => m.id === SECOND_EDIT_IMAGE_MODEL)).toMatchObject({
      type: 'image',
      id: SECOND_EDIT_IMAGE_MODEL,
      name: 'FLUX.1 Kontext Pro',
      pricing: { image_per_image: 0.052 },
      input_modalities: ['text'],
      output_modalities: ['image'],
      response_formats: ['b64_json', 'url'],
      supports_stream: false,
      supports_edits: true,
      edits: {
        content_types: ['application/json'],
        image_sources: ['https', 'data'],
        file_id: false,
        mask: false,
        multipart: false,
      },
    });
    expect(models.find((m) => m.id === THIRD_EDIT_IMAGE_MODEL)).toMatchObject({
      type: 'image',
      id: THIRD_EDIT_IMAGE_MODEL,
      name: 'MAI-Image-2.6-Flash',
      pricing: {
        input_per_1m: 2.275,
        output_per_1m: 24.7,
      },
      input_modalities: ['text'],
      output_modalities: ['image'],
      response_formats: ['b64_json', 'url'],
      supports_stream: false,
      supports_edits: true,
      edits: {
        content_types: ['application/json'],
        image_sources: ['https', 'data'],
        file_id: false,
        mask: false,
        multipart: false,
      },
    });
    expect(models.find((m) => m.id === EDIT_MODEL)).toMatchObject({
      type: 'image',
      id: EDIT_MODEL,
      name: 'GPT Image 1 Mini',
      pricing: {
        input_per_1m: 2.6,
        output_per_1m: 10.4,
        cached_input_per_1m: 0.26,
      },
      input_modalities: ['text'],
      output_modalities: ['image'],
      response_formats: ['b64_json', 'url'],
      supports_stream: false,
      supports_edits: true,
      edits: {
        content_types: ['application/json'],
        image_sources: ['https', 'data'],
        file_id: false,
        mask: false,
        multipart: false,
      },
    });
    expect(models.find((m) => m.id === LANGUAGE_IMAGE_MODEL)).toMatchObject({
      type: 'language',
      id: LANGUAGE_IMAGE_MODEL,
      name: 'Arrow 2',
      pricing: {
        input_per_1m: 5.2,
        output_per_1m: 26,
        cached_input_per_1m: 0.52,
      },
      input_modalities: ['text', 'image'],
      output_modalities: ['text', 'image'],
      response_formats: ['b64_json', 'url'],
      supports_stream: false,
      supports_edits: false,
      edits: null,
    });
    expect(models.find((m) => m.id === GENERATION_ONLY_IMAGE_MODEL)).toMatchObject({
      type: 'image',
      id: GENERATION_ONLY_IMAGE_MODEL,
      name: 'Recraft V4.1 Flash',
      pricing: { image_per_image: 0.0091 },
      input_modalities: ['text'],
      output_modalities: ['image'],
      response_formats: ['b64_json', 'url'],
      supports_stream: false,
      supports_edits: false,
      edits: null,
    });
    expect(models.find((m) => m.id === IMAGE_MODEL)).toMatchObject({
      type: 'image',
      id: IMAGE_MODEL,
      name: 'Grok Imagine Image',
      pricing: { image_per_image: 0.026 },
      input_modalities: ['text'],
      output_modalities: ['image'],
      response_formats: ['b64_json', 'url'],
      supports_stream: false,
      supports_edits: true,
      edits: {
        content_types: ['application/json'],
        image_sources: ['https', 'data'],
        file_id: false,
        mask: false,
        multipart: false,
      },
    });

    const chatIds = (await listModels()).map((m) => m.id);
    expect(chatIds).not.toContain(IMAGE_MODEL);
    expect(chatIds).not.toContain(EDIT_MODEL);
    expect(chatIds).not.toContain(GENERATION_ONLY_IMAGE_MODEL);
    expect(chatIds).toContain(LANGUAGE_IMAGE_MODEL);
  });

  it('shows pricing from the listing plus Tulzo markup, not from generation responses', async () => {
    const res = await listImageModels(bearer(KEYS.plus));
    expect(res.status).toBe(200);
    const body = await res.json();
    const arrow = (body.data as ImageModel[]).find((m) => m.id === LANGUAGE_IMAGE_MODEL)!;
    const edit = (body.data as ImageModel[]).find((m) => m.id === EDIT_MODEL)!;
    const recraft = (body.data as ImageModel[]).find((m) => m.id === GENERATION_ONLY_IMAGE_MODEL)!;
    const grok = (body.data as ImageModel[]).find((m) => m.id === IMAGE_MODEL)!;
    expect(arrow.pricing).toEqual({
      input_per_1m: 5.2,
      output_per_1m: 26,
      cached_input_per_1m: 0.52,
    });
    expect(edit.pricing).toEqual({ input_per_1m: 2.6, output_per_1m: 10.4, cached_input_per_1m: 0.26 });
    expect(recraft.pricing).toEqual({ image_per_image: 0.0091 });
    expect(grok.pricing).toEqual({ image_per_image: 0.026 });
  });

  it('omits blocked-but-public Gemini and GPT Image 2 entries from the Tulzo image catalog', async () => {
    const res = await listImageModels(bearer(KEYS.plus));
    expect(res.status).toBe(200);
    const ids = (await res.json()).data.map((m: ImageModel) => m.id);
    expect(ids).not.toContain(BLOCKED_LANGUAGE_IMAGE_MODEL);
    expect(ids).not.toContain(BLOCKED_EDIT_MODEL);
  });
});

describe('POST /api/chat: models follow the listing', () => {
  for (const [id, label] of [
    ['openai/definitely-not-real', 'an id Vercel does not list'],
    [BATCH_MODEL, 'a -batch id that is in the listing'],
    [EMBEDDING_MODEL, 'an embedding id that is in the listing'],
  ] as const) {
    it(`400 model_not_allowed for ${label}, without inference`, async () => {
      const res = await chat({ messages: hi, model: id });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(typeof body.error).toBe('string');
      expect(body.error).toContain(id);
      expect(body.error).toContain('/api/models');
      expect(body.code).toBe('model_not_allowed');
      expect(body.model).toBe(id);
      expect(body.models_url).toBe('/api/models');
      expect(inferenceCalls()).toBe(0);
    });
  }

  it('accepts a listed model that is not in the old built-in list (200)', async () => {
    const res = await chat({ messages: hi, model: NEW_MODEL, stream: false });
    expect(res.status).toBe(200);
  });

  it('accepts openai/gpt-4o-mini (200)', async () => {
    const res = await chat({ messages: hi, model: DEFAULT_MODEL, stream: false });
    expect(res.status).toBe(200);
  });

  it('an omitted model defaults to openai/gpt-4o-mini', async () => {
    const res = await chat({ messages: hi, stream: false });
    expect(res.status).toBe(200);
    const ai = await import('ai');
    const calls = [
      ...(ai.streamText as unknown as { mock: { calls: unknown[][] } }).mock.calls,
      ...(ai.generateText as unknown as { mock: { calls: unknown[][] } }).mock.calls,
    ];
    expect(calls.length).toBeGreaterThan(0);
    const model = (calls.at(-1)![0] as { model?: unknown }).model;
    const modelId = typeof model === 'string' ? model : (model as { modelId?: string } | undefined)?.modelId;
    expect(modelId).toBe(DEFAULT_MODEL);
  });
});

describe('POST /api/images/generations', () => {
  it('401 with an error string when x-api-key is missing', async () => {
    const res = await images({ model: IMAGE_MODEL, prompt: 'a red fox in snow' }, { 'content-type': 'application/json' });
    expect(res.status).toBe(401);
    expect(typeof (await res.json()).error).toBe('string');
    expect(imageCalls()).toHaveLength(0);
    expect(imageChatCalls()).toHaveLength(0);
  });

  it('matches /api/chat for an inactive key and for insufficient balance before any upstream image call', async () => {
    const inactiveImage = await images({ model: IMAGE_MODEL, prompt: 'a red fox in snow' }, { 'x-api-key': KEYS.inactive, 'content-type': 'application/json' });
    const inactiveChat = await chat({ messages: hi, model: DEFAULT_MODEL, stream: false }, { 'x-api-key': KEYS.inactive, 'content-type': 'application/json' });
    expect(inactiveImage.status).toBe(inactiveChat.status);
    expect(await inactiveImage.json()).toEqual(await inactiveChat.json());
    expect(imageCalls()).toHaveLength(0);
    expect(imageChatCalls()).toHaveLength(0);

    state.tables.user_budgets = state.tables.user_budgets.map((row) => row.user_id === 'u-plus'
      ? { ...row, remaining_balance: 0 }
      : row);
    const brokeImage = await images({ model: IMAGE_MODEL, prompt: 'a red fox in snow' });
    const brokeChat = await chat({ messages: hi, model: DEFAULT_MODEL, stream: false });
    expect(brokeImage.status).toBe(brokeChat.status);
    expect(await brokeImage.json()).toEqual(await brokeChat.json());
    expect(imageCalls()).toHaveLength(0);
    expect(imageChatCalls()).toHaveLength(0);
  });

  it('accepts a type=image model while GET /api/models stays chat-only, and returns OpenAI Images JSON', async () => {
    const listed = (await listModels()).map((m) => m.id);
    expect(listed).not.toContain(IMAGE_MODEL);

    const res = await images({ model: IMAGE_MODEL, prompt: 'a red fox in snow', response_format: 'b64_json' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1_730_000_000);
    expect(body).not.toHaveProperty('choices');
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.data[0].b64_json).toBe('string');
    expect(body).not.toHaveProperty('pricing');
    expect(imageCalls()).toHaveLength(1);
    expect(imageChatCalls()).toHaveLength(0);
  });

  it('accepts a type=language image-capable model via chat completions and normalizes to Images JSON', async () => {
    const listed = (await listModels()).map((m) => m.id);
    expect(listed).toContain(LANGUAGE_IMAGE_MODEL);

    const res = await images({ model: LANGUAGE_IMAGE_MODEL, prompt: 'a watercolor fox in snow', response_format: 'url' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1_730_000_100);
    expect(body).not.toHaveProperty('choices');
    expect(body).not.toHaveProperty('pricing');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toEqual({ b64_json: 'R0lGODlhAQABAAAAACwAAAAAAQABAAA=' });
    expect(imageCalls()).toHaveLength(0);
    expect(imageChatCalls()).toHaveLength(1);

    const init = imageChatCalls()[0]?.[1] as RequestInit;
    const forwarded = JSON.parse(String(init.body));
    expect(forwarded).toEqual({
      model: LANGUAGE_IMAGE_MODEL,
      messages: [{ role: 'user', content: 'a watercolor fox in snow' }],
      modalities: ['text', 'image'],
      stream: false,
    });
  });

  it('returns the exact upstream JSON/status when the image endpoint is restricted for this gateway key', async () => {
    imageGenerationFailure = {
      status: 403,
      body: {
        ...RESTRICTED_MODEL_ERROR,
        providerMetadata: { gateway: { routing: { originalModelId: GENERATION_ONLY_IMAGE_MODEL } } },
      },
    };

    const res = await images({ model: GENERATION_ONLY_IMAGE_MODEL, prompt: 'a red fox in snow' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      ...RESTRICTED_MODEL_ERROR,
      providerMetadata: { gateway: { routing: { originalModelId: GENERATION_ONLY_IMAGE_MODEL } } },
    });
  });

  it('returns the exact upstream JSON/status when the chat-completions image path is restricted for this gateway key', async () => {
    imageChatFailure = {
      status: 403,
      body: {
        ...RESTRICTED_MODEL_ERROR,
        providerMetadata: { gateway: { routing: { originalModelId: LANGUAGE_IMAGE_MODEL } } },
      },
    };

    const res = await images({ model: LANGUAGE_IMAGE_MODEL, prompt: 'a watercolor fox in snow' });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      ...RESTRICTED_MODEL_ERROR,
      providerMetadata: { gateway: { routing: { originalModelId: LANGUAGE_IMAGE_MODEL } } },
    });
  });

  it('normalizes inline SVG from a language-image chat completion into image data', async () => {
    const baseFetch = fetchMock.getMockImplementation()!;
    fetchMock
      .mockImplementationOnce((input: unknown, init?: RequestInit) => baseFetch(input, init))
      .mockImplementationOnce(async () => new Response(JSON.stringify({
      created: 1_730_000_222,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: '```svg\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#00f"/></svg>\n```',
        },
        finish_reason: 'stop',
      }],
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-vercel-ai-generation-id': 'chat_img_gen_1',
      },
    }));

    const res = await images({ model: LANGUAGE_IMAGE_MODEL, prompt: 'draw a blue square' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1_730_000_222);
    expect(body.data).toHaveLength(1);
    expect(typeof body.data[0].url).toBe('string');
    expect(body.data[0].url).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('forwards the OpenAI-style request body, including optional image params', async () => {
    const providerOptions = { openai: { style: 'vivid' } };
    const res = await images({
      model: IMAGE_MODEL,
      prompt: 'studio photo of a ceramic mug',
      n: 2,
      size: '1024x1024',
      response_format: 'b64_json',
      quality: 'high',
      background: 'transparent',
      moderation: 'low',
      output_format: 'png',
      output_compression: 60,
      providerOptions,
    });
    expect(res.status).toBe(200);
    expect(imageCalls()).toHaveLength(1);
    expect(imageChatCalls()).toHaveLength(0);
    const init = imageCalls()[0]?.[1] as RequestInit;
    const forwarded = JSON.parse(String(init.body));
    expect(forwarded).toEqual({
      model: IMAGE_MODEL,
      prompt: 'studio photo of a ceramic mug',
      n: 2,
      size: '1024x1024',
      response_format: 'b64_json',
      quality: 'high',
      background: 'transparent',
      moderation: 'low',
      output_format: 'png',
      output_compression: 60,
      providerOptions,
    });
  });

  it('400 when stream=true because image generations are non-streaming JSON only', async () => {
    const res = await images({ model: IMAGE_MODEL, prompt: 'a lighthouse at dusk', stream: true });
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe('string');
    expect(imageCalls()).toHaveLength(0);
    expect(imageChatCalls()).toHaveLength(0);
  });

  it('400 when image edit payload fields are sent to the generation route', async () => {
    const res = await images({ model: LANGUAGE_IMAGE_MODEL, prompt: 'edit this image', images: ['https://example.test/cat.png'] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Image-guided generation is not supported on POST /api/images/generations. Use prompt-only generation here, or POST /api/images/edits for the JSON edit flow Tulzo currently exposes.',
      code: 'image_edits_not_supported',
    });
    expect(imageCalls()).toHaveLength(0);
    expect(imageChatCalls()).toHaveLength(0);
  });

  it('400 model_not_allowed for a chat-only model, and points at /api/models/images', async () => {
    const res = await images({ model: DEFAULT_MODEL, prompt: 'a lighthouse at dusk' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('model_not_allowed');
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(typeof body.error).toBe('string');
    expect(body.models_url).toBe('/api/models/images');
    expect(body.error).toContain('/api/models/images');
    expect(imageCalls()).toHaveLength(0);
    expect(imageChatCalls()).toHaveLength(0);
  });

  it('400 model_not_allowed for blocked public image models that Tulzo does not expose on this free-tier key', async () => {
    for (const model of [BLOCKED_LANGUAGE_IMAGE_MODEL, BLOCKED_EDIT_MODEL, 'openai/definitely-not-real']) {
      const res = await images({ model, prompt: 'a lighthouse at dusk' });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('model_not_allowed');
      expect(body.model).toBe(model);
      expect(body.models_url).toBe('/api/models/images');
    }
    expect(imageCalls()).toHaveLength(0);
    expect(imageChatCalls()).toHaveLength(0);
  });

  it('bills a successful image generation call like /api/chat does', async () => {
    const res = await images({ model: IMAGE_MODEL, prompt: 'a red fox in snow' });
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toContainEqual({ fn: 'deduct_user_balance', args: { target_user_id: 'u-plus', amount: 0.026 } });
    expect(state.insertCalls).toContainEqual({
      table: 'paid_usage_analytics',
      values: {
        user_id: 'u-plus',
        device_session_id: 'k-plus',
        api_key_id: 'k-plus',
        provider: 'spacexai',
        model_name: IMAGE_MODEL,
        tokens_used: 0,
        cost_deducted: 0.026,
      },
    });
  });

  it('bills a language image-capable generation from the gateway-reported cost, but still returns only { created, data }', async () => {
    const res = await images({ model: LANGUAGE_IMAGE_MODEL, prompt: 'painted mountains at dusk' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      created: 1_730_000_100,
      data: [{ b64_json: 'R0lGODlhAQABAAAAACwAAAAAAQABAAA=' }],
    });
    expect(state.rpcCalls).toContainEqual({ fn: 'deduct_user_balance', args: { target_user_id: 'u-plus', amount: 0.000002 } });
    expect(state.insertCalls).toContainEqual({
      table: 'paid_usage_analytics',
      values: {
        user_id: 'u-plus',
        device_session_id: 'k-plus',
        api_key_id: 'k-plus',
        provider: 'quiverai',
        model_name: LANGUAGE_IMAGE_MODEL,
        tokens_used: 0,
        cost_deducted: 0.000002,
      },
    });
  });
});

describe('POST /api/images/edits', () => {
  it('accepts JSON image_url inputs only, proxies them upstream, and returns only { created, data }', async () => {
    const res = await edits({
      model: EDIT_MODEL,
      prompt: 'Add a watercolor effect',
      images: [{ image_url: 'https://cdn.example.test/source.png' }],
      response_format: 'url',
      n: 1,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ created: 1_730_000_111, data: [{ url: 'https://cdn.example.test/edited.png' }] });
    expect(imageEditCalls()).toHaveLength(1);
    const init = imageEditCalls()[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({
      model: EDIT_MODEL,
      prompt: 'Add a watercolor effect',
      images: [{ image_url: 'https://cdn.example.test/source.png' }],
      response_format: 'url',
      n: 1,
    });
  });

  it('accepts data: image_url and bills like image generations', async () => {
    const res = await edits({
      model: EDIT_MODEL,
      prompt: 'Turn this into pixel art',
      images: [{ image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }],
    });
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toContainEqual({ fn: 'deduct_user_balance', args: { target_user_id: 'u-plus', amount: 0.026 } });
    expect(state.insertCalls).toContainEqual({
      table: 'paid_usage_analytics',
      values: {
        user_id: 'u-plus',
        device_session_id: 'k-plus',
        api_key_id: 'k-plus',
        provider: 'openai',
        model_name: EDIT_MODEL,
        tokens_used: 0,
        cost_deducted: 0.026,
      },
    });
  });

  it('returns the exact upstream JSON/status when image edits are restricted for this gateway key', async () => {
    imageEditFailure = {
      status: 403,
      body: {
        ...RESTRICTED_MODEL_ERROR,
        providerMetadata: { gateway: { routing: { originalModelId: EDIT_MODEL } } },
      },
    };

    const res = await edits({
      model: EDIT_MODEL,
      prompt: 'Turn this into pixel art',
      images: [{ image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }],
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      ...RESTRICTED_MODEL_ERROR,
      providerMetadata: { gateway: { routing: { originalModelId: EDIT_MODEL } } },
    });
  });

  it('rejects missing model, prompt, or source images before any upstream edit call', async () => {
    const missingPrompt = await edits({ model: EDIT_MODEL, images: [{ image_url: 'https://cdn.example.test/source.png' }] });
    expect(missingPrompt.status).toBe(400);
    expect(typeof (await missingPrompt.json()).error).toBe('string');

    const missingImages = await edits({ model: EDIT_MODEL, prompt: 'x', images: [] });
    expect(missingImages.status).toBe(400);
    expect(typeof (await missingImages.json()).error).toBe('string');

    const missingModel = await edits({ prompt: 'x', images: [{ image_url: 'https://cdn.example.test/source.png' }] });
    expect(missingModel.status).toBe(400);
    expect((await missingModel.json()).error).toBe('Invalid request body: model required');

    expect(imageEditCalls()).toHaveLength(0);
  });

  it('rejects file_id, stream=true, masks, unsupported image_url schemes, and non-json content types locally', async () => {
    const fileId = await edits({ model: EDIT_MODEL, prompt: 'x', images: [{ file_id: 'file_123' }] });
    expect(fileId.status).toBe(400);

    const stream = await edits({ model: EDIT_MODEL, prompt: 'x', images: [{ image_url: 'https://cdn.example.test/source.png' }], stream: true });
    expect(stream.status).toBe(400);

    const mask = await edits({ model: EDIT_MODEL, prompt: 'x', images: [{ image_url: 'https://cdn.example.test/source.png' }], mask: 'data:image/png;base64,aaa' });
    expect(mask.status).toBe(400);

    const badScheme = await edits({ model: EDIT_MODEL, prompt: 'x', images: [{ image_url: 'http://cdn.example.test/source.png' }] });
    expect(badScheme.status).toBe(400);

    const formLike = await edits(
      { model: EDIT_MODEL, prompt: 'x', images: [{ image_url: 'https://cdn.example.test/source.png' }] },
      { 'x-api-key': KEYS.plus, 'content-type': 'multipart/form-data; boundary=test' },
    );
    expect(formLike.status).toBe(415);
    expect(imageEditCalls()).toHaveLength(0);
  });

  it('rejects non-allowlisted or non-edit models with model_not_allowed pointing at /api/models/images', async () => {
    for (const model of [DEFAULT_MODEL, LANGUAGE_IMAGE_MODEL, GENERATION_ONLY_IMAGE_MODEL, BLOCKED_EDIT_MODEL, BLOCKED_LANGUAGE_IMAGE_MODEL, 'openai/definitely-not-real']) {
      const res = await edits({ model, prompt: 'x', images: [{ image_url: 'https://cdn.example.test/source.png' }] });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('model_not_allowed');
      expect(body.model).toBe(model);
      expect(body.models_url).toBe('/api/models/images');
    }
    expect(imageEditCalls()).toHaveLength(0);
  });

  it('matches generation auth/budget behavior for inactive keys and insufficient balance', async () => {
    const inactiveEdit = await edits(
      { model: EDIT_MODEL, prompt: 'x', images: [{ image_url: 'https://cdn.example.test/source.png' }] },
      { 'x-api-key': KEYS.inactive, 'content-type': 'application/json' },
    );
    const inactiveGeneration = await images(
      { model: IMAGE_MODEL, prompt: 'x' },
      { 'x-api-key': KEYS.inactive, 'content-type': 'application/json' },
    );
    expect(inactiveEdit.status).toBe(inactiveGeneration.status);
    expect(await inactiveEdit.json()).toEqual(await inactiveGeneration.json());

    state.tables.user_budgets = state.tables.user_budgets.map((row) => row.user_id === 'u-plus'
      ? { ...row, remaining_balance: 0 }
      : row);
    const brokeEdit = await edits({ model: EDIT_MODEL, prompt: 'x', images: [{ image_url: 'https://cdn.example.test/source.png' }] });
    const brokeGeneration = await images({ model: IMAGE_MODEL, prompt: 'x' });
    expect(brokeEdit.status).toBe(brokeGeneration.status);
    expect(await brokeEdit.json()).toEqual(await brokeGeneration.json());
    expect(imageEditCalls()).toHaveLength(0);
  });
});
