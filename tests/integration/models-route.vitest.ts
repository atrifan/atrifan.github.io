import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { req } from './vitest-env';

/**
 * Contract: GET /api/models passes through every priced chat model in Vercel's gateway listing
 * (marked up by chatBillingMarkup()), with a built-in fallback when the listing is unavailable;
 * POST /api/chat accepts exactly the listed models; GET /api/plugin/config points at /api/models.
 * No network or database: Supabase is a fake, fetch is stubbed, `ai` is mocked.
 */

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]> }));

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
    for (const m of ['insert', 'update', 'upsert', 'delete']) {
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
    rpc: async () => resolved,
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
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

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
const EXPECTED_IDS = [DEFAULT_MODEL, NEW_MODEL, 'anthropic/claude-test'].sort();

type FetchMode = 'ok' | '500' | 'throw' | 'no-data';
let fetchMode: FetchMode = 'ok';
const fetchMock = vi.fn(async (input: unknown) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  if (url.startsWith(LISTING_URL)) {
    if (fetchMode === 'throw') throw new Error('network down');
    if (fetchMode === '500') return new Response('boom', { status: 500 });
    const body = fetchMode === 'no-data' ? { object: 'list' } : { object: 'list', data: listingData };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
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

type Model = {
  id: string;
  name: string;
  context_window: number | null;
  max_output_tokens: number | null;
  pricing: { input_per_1m: number; output_per_1m: number; cached_input_per_1m?: number };
  supports_tools: boolean;
  supports_vision: boolean;
};
type Price = { inputPer1M: number; outputPer1M: number; cachedInputPer1M?: number };

beforeEach(async () => {
  vi.resetModules();
  seed();
  fetchMode = 'ok';
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

const chat = async (body: Record<string, unknown>) => {
  const { POST } = await import('@/app/api/chat/route');
  return POST(
    req('/api/chat', {
      method: 'POST',
      headers: { 'x-api-key': KEYS.plus, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
};
const hi = [{ role: 'user', content: 'hi' }];

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

  it('a super plan key gets 200 with a quotas object', async () => {
    const { GET } = await import('@/app/api/plugin/config/route');
    const res = await GET(req('/api/plugin/config', { headers: bearer(KEYS.super) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.quotas).toBe('object');
    expect(body.quotas).not.toBeNull();
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
