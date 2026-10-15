import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { req } from './vitest-env';

/**
 * Contract: GET /api/models (allowlisted gateway models with prices and Vercel metadata),
 * `models_url` on GET /api/plugin/config, and POST /api/chat refusing non-allowlisted models.
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

const listing = {
  object: 'list',
  data: [
    {
      id: DEFAULT_MODEL,
      object: 'model',
      name: 'GPT-4o mini',
      type: 'language',
      context_window: 128000,
      max_tokens: 16384,
      supported_parameters: ['temperature', 'tools', 'tool_choice'],
      modalities: { input: ['text', 'image'], output: ['text'] },
      pricing: { input: '0.00000015', output: '0.0000006' },
    },
    {
      id: 'vendor/not-allowlisted',
      object: 'model',
      name: 'Not allowlisted',
      type: 'language',
      context_window: 8000,
      max_tokens: 1000,
      supported_parameters: ['tools'],
      modalities: { input: ['text'], output: ['text'] },
      pricing: { input: '0.000001', output: '0.000002' },
    },
    {
      id: 'openai/text-embedding-3-small',
      object: 'model',
      name: 'Embedding',
      type: 'embedding',
      context_window: 8191,
      pricing: { input: '0.00000002' },
    },
  ],
};

type FetchMode = 'ok' | '500' | 'throw';
let fetchMode: FetchMode = 'ok';
let listingOverride: typeof listing | null = null;
const fetchMock = vi.fn(async (input: unknown) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  if (url.startsWith(LISTING_URL)) {
    if (fetchMode === 'throw') throw new Error('network down');
    if (fetchMode === '500') return new Response('boom', { status: 500 });
    return new Response(JSON.stringify(listingOverride ?? listing), {
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

type Model = {
  id: string;
  name: string;
  context_window: number | null;
  max_output_tokens: number | null;
  pricing: { input_per_1m: number; output_per_1m: number; cached_input_per_1m?: number };
  supports_tools: boolean;
  supports_vision: boolean;
};

/**
 * Resets the catalog cache. While the module does not exist yet, the /api/models specs fail on
 * their own import; the plugin/config and chat specs still run and fail for their own reasons.
 */
async function resetCatalog() {
  let mod: { __resetModelCatalogCache?: () => void };
  try {
    mod = await import('@/src/lib/models/catalog');
  } catch (e) {
    if (/Failed to (load|resolve)|Cannot find|does not exist/i.test(String(e))) return;
    throw e;
  }
  mod.__resetModelCatalogCache?.();
}

beforeEach(async () => {
  vi.resetModules();
  seed();
  fetchMode = 'ok';
  listingOverride = null;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-gateway-key');
  for (const n of ['STORAGE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) vi.stubEnv(n, 'http://supabase.test');
  for (const n of ['STORAGE_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STORAGE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    vi.stubEnv(n, 'service-role-test');
  }
  await resetCatalog();
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

describe('GET /api/models: auth', () => {
  it('401 with an error string when the Authorization header is missing', async () => {
    const res = await getModels();
    expect(res.status).toBe(401);
    expect(typeof (await res.json()).error).toBe('string');
  });

  it('401 for an unknown key', async () => {
    const res = await getModels(bearer('ak_unknown_key'));
    expect(res.status).toBe(401);
  });

  it('401 for an inactive key', async () => {
    const res = await getModels(bearer(KEYS.inactive));
    expect(res.status).toBe(401);
  });

  it('403 plan_required for a free key', async () => {
    const res = await getModels(bearer(KEYS.free));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'plan_required' });
  });

  for (const plan of ['pro', 'plus', 'super'] as const) {
    it(`200 for a ${plan} key`, async () => {
      const res = await getModels(bearer(KEYS[plan]));
      expect(res.status).toBe(200);
    });
  }
});

describe('GET /api/models: body', () => {
  it('is { object: "list", data: Model[] } with the documented field types', async () => {
    const res = await getModels(bearer(KEYS.plus));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
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

  it('only lists allowlisted models: no extra listing models, no embeddings', async () => {
    const body = await (await getModels(bearer(KEYS.plus))).json();
    const ids = (body.data as Model[]).map((m) => m.id);
    expect(ids).toContain(DEFAULT_MODEL);
    expect(ids).not.toContain('vendor/not-allowlisted');
    expect(ids).not.toContain('openai/text-embedding-3-small');
    expect(ids).not.toContain('openai/definitely-not-real');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('takes context_window, max_output_tokens, tools and vision from the Vercel listing', async () => {
    const body = await (await getModels(bearer(KEYS.plus))).json();
    const m = (body.data as Model[]).find((x) => x.id === DEFAULT_MODEL)!;
    expect(m.context_window).toBe(128000);
    expect(m.max_output_tokens).toBe(16384);
    expect(m.supports_tools).toBe(true);
    expect(m.supports_vision).toBe(true);
  });

  it('reports false for tools/vision and null context_window when the listing lacks them', async () => {
    listingOverride = {
      object: 'list',
      data: [
        {
          id: DEFAULT_MODEL,
          object: 'model',
          name: 'GPT-4o mini',
          type: 'language',
          max_tokens: 16384,
          supported_parameters: ['temperature'],
          modalities: { input: ['text'], output: ['text'] },
          pricing: { input: '0.00000015', output: '0.0000006' },
        } as unknown as (typeof listing)['data'][number],
      ],
    };
    const body = await (await getModels(bearer(KEYS.plus))).json();
    const m = (body.data as Model[]).find((x) => x.id === DEFAULT_MODEL)!;
    expect(m.context_window).toBeNull();
    expect(m.supports_tools).toBe(false);
    expect(m.supports_vision).toBe(false);
  });

  it('every entry has positive numeric input and output prices', async () => {
    const body = await (await getModels(bearer(KEYS.plus))).json();
    for (const m of body.data as Model[]) {
      expect(m.pricing.input_per_1m).toBeGreaterThan(0);
      expect(m.pricing.output_per_1m).toBeGreaterThan(0);
    }
  });
});

describe('GET /api/models: pricing never depends on Vercel being up', () => {
  for (const mode of ['500', 'throw'] as const) {
    it(`listing fetch ${mode === '500' ? 'returns 500' : 'throws'}: still 200, every allowlisted model, priced, null context_window`, async () => {
      const okBody = await (await getModels(bearer(KEYS.plus))).json();
      const allowlisted = (okBody.data as Model[]).map((m) => m.id).sort();

      vi.resetModules();
      await resetCatalog();
      fetchMode = mode;

      const res = await getModels(bearer(KEYS.plus));
      expect(res.status).toBe(200);
      const body = await res.json();
      const models = body.data as Model[];
      expect(models.map((m) => m.id).sort()).toEqual(allowlisted);
      expect(models.map((m) => m.id)).toContain(DEFAULT_MODEL);
      for (const m of models) {
        expect(m.context_window).toBeNull();
        expect(typeof m.pricing.input_per_1m).toBe('number');
        expect(typeof m.pricing.output_per_1m).toBe('number');
        expect(m.pricing.input_per_1m).toBeGreaterThan(0);
        expect(m.pricing.output_per_1m).toBeGreaterThan(0);
      }
    });
  }
});

describe('GET /api/models: caching', () => {
  it('two GETs in a row fetch the Vercel listing once', async () => {
    const { GET } = await import('@/app/api/models/route');
    expect((await GET(req('/api/models', { headers: bearer(KEYS.plus) }))).status).toBe(200);
    expect((await GET(req('/api/models', { headers: bearer(KEYS.pro) }))).status).toBe(200);
    expect(listingCalls()).toBe(1);
  });
});

describe('GET /api/models: price shown = price billed', () => {
  it('pricing per 1M equals 1e6 x calculateCost for every listed model', async () => {
    const body = await (await getModels(bearer(KEYS.plus))).json();
    const { calculateCost } = await import('@/src/lib/ai-gateway');
    const models = body.data as Model[];
    expect(models.map((m) => m.id)).toContain(DEFAULT_MODEL);
    for (const m of models) {
      expect(m.pricing.input_per_1m).toBeCloseTo(1e6 * calculateCost(m.id, 1, 0), 6);
      expect(m.pricing.output_per_1m).toBeCloseTo(1e6 * calculateCost(m.id, 0, 1), 6);
    }
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
    expect(body.quotas).toBeDefined();
    expect(typeof body.quotas).toBe('object');
    expect(body.quotas).not.toBeNull();
  });
});

describe('POST /api/chat: model allowlist', () => {
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
  const gatewayCalls = () => fetchMock.mock.calls.filter((c) => urlOf(c).includes('ai-gateway')).length;

  it('400 model_not_allowed for a non-allowlisted model, without calling the gateway', async () => {
    const res = await chat({ messages: [{ role: 'user', content: 'hi' }], model: 'openai/definitely-not-real' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(body.error).toContain('openai/definitely-not-real');
    expect(body.error).toContain('/api/models');
    expect(body.code).toBe('model_not_allowed');
    expect(body.model).toBe('openai/definitely-not-real');
    expect(body.models_url).toBe('/api/models');
    expect(gatewayCalls()).toBe(0);
  });

  it('accepts the allowlisted default model (200)', async () => {
    const res = await chat({ messages: [{ role: 'user', content: 'hi' }], model: DEFAULT_MODEL, stream: false });
    expect(res.status).toBe(200);
  });

  it('defaults an omitted model to an allowed one and is not refused', async () => {
    const res = await chat({ messages: [{ role: 'user', content: 'hi' }], stream: false });
    expect(res.status).not.toBe(400);
    expect(res.status).toBe(200);
  });
});
