import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GATEWAY_MODELS, DEFAULT_CHAT_MODEL } from '@/src/config/gateway-models';
import {
  MODELS_URL,
  VERCEL_MODELS_URL,
  __resetModelCatalogCache,
  buildCatalog,
  fetchVercelListing,
  findAllowedModel,
  modelNotAllowedBody,
  perTokenToPer1M,
  type VercelModel,
} from '@/src/lib/models/catalog';
import { AI_GATEWAY_BASE_URL, UnknownModelError, calculateCost, chatBillingMarkup } from '@/src/lib/ai-gateway';

const snapshot = JSON.parse(readFileSync('tests/fixtures/vercel-models-snapshot.json', 'utf8')) as {
  data: VercelModel[];
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the allowlist is the price table', () => {
  it('every allowlisted model has a positive input and output price', () => {
    expect(GATEWAY_MODELS.length).toBeGreaterThan(0);
    for (const m of GATEWAY_MODELS) {
      expect(m.inputPer1M, m.id).toBeGreaterThan(0);
      expect(m.outputPer1M, m.id).toBeGreaterThan(0);
      if (m.cachedInputPer1M !== undefined) expect(m.cachedInputPer1M, m.id).toBeGreaterThan(0);
    }
  });

  it('ids are unique and provider-prefixed', () => {
    const ids = GATEWAY_MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
  });

  it('the default chat model and the gigs defaults are allowlisted', async () => {
    expect(DEFAULT_CHAT_MODEL).toBe('openai/gpt-4o-mini');
    expect(findAllowedModel(DEFAULT_CHAT_MODEL)).not.toBeNull();
    // spec-builder builds a Supabase client at import; any URL/key will do, nothing is called.
    vi.stubEnv('STORAGE_SUPABASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('STORAGE_SUPABASE_SERVICE_ROLE_KEY', 'unit-test');
    const { DEFAULT_SPEC_MODEL } = await import('@/src/lib/jobs/spec-builder');
    const { DEFAULT_STEERING_MODEL } = await import('@/src/lib/jobs/steering');
    expect(findAllowedModel(DEFAULT_SPEC_MODEL)).not.toBeNull();
    expect(findAllowedModel(DEFAULT_STEERING_MODEL)).not.toBeNull();
  });

  it('every allowlisted id exists in the Vercel listing snapshot, at the same base price', () => {
    const byId = new Map(snapshot.data.map((m) => [m.id, m]));
    for (const m of GATEWAY_MODELS) {
      const v = byId.get(m.id);
      expect(v, `${m.id} missing from tests/fixtures/vercel-models-snapshot.json`).toBeDefined();
      expect(m.inputPer1M, m.id).toBeCloseTo(perTokenToPer1M(v!.pricing!.input)!, 9);
      expect(m.outputPer1M, m.id).toBeCloseTo(perTokenToPer1M(v!.pricing!.output)!, 9);
    }
  });
});

describe('perTokenToPer1M', () => {
  it('converts Vercel per-token USD strings to per-1M numbers without float noise', () => {
    expect(perTokenToPer1M('0.00000015')).toBe(0.15);
    expect(perTokenToPer1M('0.000003')).toBe(3);
    expect(perTokenToPer1M('0.0000225')).toBe(22.5);
    expect(perTokenToPer1M('0.000000025')).toBe(0.025);
  });

  it('returns null for missing, empty or invalid values', () => {
    expect(perTokenToPer1M(undefined)).toBeNull();
    expect(perTokenToPer1M('')).toBeNull();
    expect(perTokenToPer1M('abc')).toBeNull();
    expect(perTokenToPer1M('-0.1')).toBeNull();
  });
});

describe('buildCatalog', () => {
  const listing: VercelModel[] = [
    {
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o mini (Vercel name)',
      type: 'language',
      context_window: 128000,
      max_tokens: 16384,
      supported_parameters: ['max_tokens', 'tools'],
      modalities: { input: ['text', 'image'], output: ['text'] },
      pricing: { input: '0.00000015', output: '0.0000006' },
    },
    { id: 'mistral/ministral-3b', type: 'language', supported_parameters: [], modalities: { input: ['text'] } },
    { id: 'vendor/not-allowlisted', type: 'language', context_window: 1, max_tokens: 1 },
    { id: 'openai/text-embedding-3-small', type: 'embedding' },
  ];

  it('returns only allowlisted models, in allowlist order', () => {
    const ids = buildCatalog(listing, 1).map((m) => m.id);
    expect(ids).toEqual(GATEWAY_MODELS.map((m) => m.id));
    expect(ids).not.toContain('vendor/not-allowlisted');
    expect(ids).not.toContain('openai/text-embedding-3-small');
  });

  it('takes context window, output limit and capabilities from the listing', () => {
    const mini = buildCatalog(listing, 1).find((m) => m.id === 'openai/gpt-4o-mini')!;
    expect(mini).toMatchObject({
      context_window: 128000,
      max_output_tokens: 16384,
      supports_tools: true,
      supports_vision: true,
    });
  });

  it('uses null and false when the listing lacks a field or the model', () => {
    const ministral = buildCatalog(listing, 1).find((m) => m.id === 'mistral/ministral-3b')!;
    expect(ministral.context_window).toBeNull();
    expect(ministral.max_output_tokens).toBeNull();
    expect(ministral.supports_tools).toBe(false);
    expect(ministral.supports_vision).toBe(false);
    const absent = buildCatalog([], 1).find((m) => m.id === 'openai/gpt-4o-mini')!;
    expect(absent.context_window).toBeNull();
    expect(absent.supports_tools).toBe(false);
  });

  it('names come from the Tulzo table, not the listing', () => {
    const mini = buildCatalog(listing, 1).find((m) => m.id === 'openai/gpt-4o-mini')!;
    expect(mini.name).toBe(findAllowedModel('openai/gpt-4o-mini')!.name);
  });

  it('prices are the table price times the billing markup, rounded to 6 decimals', () => {
    const row = findAllowedModel('openai/gpt-4o-mini')!;
    const plain = buildCatalog(listing, 1).find((m) => m.id === row.id)!;
    expect(plain.pricing.input_per_1m).toBe(row.inputPer1M);
    expect(plain.pricing.output_per_1m).toBe(row.outputPer1M);
    const marked = buildCatalog(listing, 1.3).find((m) => m.id === row.id)!;
    expect(marked.pricing.input_per_1m).toBe(0.195);
    expect(marked.pricing.output_per_1m).toBe(0.78);
    expect(marked.pricing.cached_input_per_1m).toBe(0.0975);
  });

  it('omits cached_input_per_1m when the table has no cached price', () => {
    for (const m of buildCatalog([], 1)) {
      const row = findAllowedModel(m.id)!;
      if (row.cachedInputPer1M === undefined) expect('cached_input_per_1m' in m.pricing).toBe(false);
    }
  });
});

describe('calculateCost and refusal', () => {
  it('prices allowlisted models from the table', () => {
    const row = findAllowedModel('openai/gpt-4o-mini')!;
    expect(calculateCost(row.id, 1_000_000, 0)).toBeCloseTo(row.inputPer1M, 12);
    expect(calculateCost(row.id, 0, 1_000_000)).toBeCloseTo(row.outputPer1M, 12);
  });

  it('refuses to price a model that is not allowlisted, instead of a default price', () => {
    expect(() => calculateCost('openai/definitely-not-real', 10, 10)).toThrow(UnknownModelError);
  });

  it('findAllowedModel is exact', () => {
    expect(findAllowedModel('openai/definitely-not-real')).toBeNull();
    expect(findAllowedModel('OPENAI/GPT-4O-MINI')).toBeNull();
    expect(findAllowedModel('')).toBeNull();
  });

  it('the refusal body names the model and points at /api/models', () => {
    const body = modelNotAllowedBody('openai/definitely-not-real');
    expect(body).toMatchObject({ code: 'model_not_allowed', model: 'openai/definitely-not-real', models_url: '/api/models' });
    expect(body.error).toContain('openai/definitely-not-real');
    expect(body.error).toContain('/api/models');
  });
});

describe('gateway endpoint', () => {
  it('uses the documented AI Gateway host', () => {
    expect(AI_GATEWAY_BASE_URL).toBe('https://ai-gateway.vercel.sh/v1');
  });
});

describe('edge cases the mutation run found unpinned', () => {
  it('findAllowedModel only accepts strings', () => {
    expect(findAllowedModel(undefined)).toBeNull();
    expect(findAllowedModel(42)).toBeNull();
    expect(findAllowedModel({ id: 'openai/gpt-4o-mini' })).toBeNull();
  });

  it('perTokenToPer1M: whitespace is missing, zero is a real (free) price', () => {
    expect(perTokenToPer1M('   ')).toBeNull();
    expect(perTokenToPer1M('0')).toBe(0);
  });

  it('context window and output limit must be positive integers', () => {
    const one = (v: Partial<VercelModel>) =>
      buildCatalog([{ id: 'openai/gpt-4o-mini', ...v }], 1).find((m) => m.id === 'openai/gpt-4o-mini')!;
    expect(one({ context_window: 0 }).context_window).toBeNull();
    expect(one({ context_window: -5 }).context_window).toBeNull();
    expect(one({ context_window: 1.5 }).context_window).toBeNull();
    expect(one({ context_window: '128000' as unknown as number }).context_window).toBeNull();
    expect(one({ context_window: 1 }).context_window).toBe(1);
    expect(one({ max_tokens: 0 }).max_output_tokens).toBeNull();
  });

  it('capabilities default to false when only part of the listing entry is present', () => {
    const one = (v: Partial<VercelModel>) =>
      buildCatalog([{ id: 'openai/gpt-4o-mini', ...v }], 1).find((m) => m.id === 'openai/gpt-4o-mini')!;
    expect(one({ modalities: { output: ['text'] } }).supports_vision).toBe(false);
    expect(one({ modalities: { input: ['text'] } }).supports_vision).toBe(false);
    expect(one({ supported_parameters: ['max_tokens'] }).supports_tools).toBe(false);
    expect(one({}).supports_vision).toBe(false);
    expect(one({}).supports_tools).toBe(false);
  });

  it('UnknownModelError carries the model id and its name', () => {
    try {
      calculateCost('openai/definitely-not-real', 1, 1);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownModelError);
      expect((e as UnknownModelError).model).toBe('openai/definitely-not-real');
      expect((e as Error).name).toBe('UnknownModelError');
      expect((e as Error).message).toContain('openai/definitely-not-real');
    }
  });

  it('chatBillingMarkup: account keys ×1, QA review keys × CREDIT_MARKUP', () => {
    vi.stubEnv('CREDIT_MARKUP', '1.3');
    expect(chatBillingMarkup({ review: false })).toBe(1);
    expect(chatBillingMarkup({ review: true })).toBe(1.3);
  });
});

describe('fetchVercelListing', () => {
  const ok = (data: unknown) => new Response(JSON.stringify({ object: 'list', data }), { status: 200 });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetModelCatalogCache();
  });

  it('fetches the public Vercel listing and keeps only entries with an id', async () => {
    __resetModelCatalogCache();
    const fetchMock = vi.fn(async () => ok([{ id: 'openai/gpt-4o-mini' }, { name: 'no id' }, null, { id: 7 }]));
    vi.stubGlobal('fetch', fetchMock);
    const data = await fetchVercelListing(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://ai-gateway.vercel.sh/v1/models');
    expect(VERCEL_MODELS_URL).toBe('https://ai-gateway.vercel.sh/v1/models');
    expect(MODELS_URL).toBe('/api/models');
    expect(data.map((m) => m.id)).toEqual(['openai/gpt-4o-mini']);
  });

  it('caches for one hour, then refetches', async () => {
    __resetModelCatalogCache();
    const fetchMock = vi.fn(async () => ok([{ id: 'openai/gpt-4o-mini' }]));
    vi.stubGlobal('fetch', fetchMock);
    await fetchVercelListing(0);
    await fetchVercelListing(60 * 60 * 1000 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchVercelListing(60 * 60 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('on an HTTP error or a throw it returns the last good listing, else []', async () => {
    __resetModelCatalogCache();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await fetchVercelListing(0)).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => ok([{ id: 'openai/gpt-4o' }])));
    expect((await fetchVercelListing(0)).map((m) => m.id)).toEqual(['openai/gpt-4o']);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect((await fetchVercelListing(10 * 60 * 60 * 1000)).map((m) => m.id)).toEqual(['openai/gpt-4o']);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect((await fetchVercelListing(20 * 60 * 60 * 1000)).map((m) => m.id)).toEqual(['openai/gpt-4o']);
    __resetModelCatalogCache();
    expect(await fetchVercelListing(0)).toEqual([]);
  });

  it('the cache window is measured from when the listing was fetched', async () => {
    __resetModelCatalogCache();
    const fetchMock = vi.fn(async () => ok([{ id: 'openai/gpt-4o-mini' }]));
    vi.stubGlobal('fetch', fetchMock);
    const t0 = 5 * 60 * 60 * 1000;
    await fetchVercelListing(t0);
    await fetchVercelListing(t0 + 60 * 60 * 1000 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores the body of an HTTP error, even when it parses as a listing', async () => {
    __resetModelCatalogCache();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'openai/gpt-4o' }] }), { status: 503 })));
    expect(await fetchVercelListing(0)).toEqual([]);
  });

  it('a malformed body keeps the last good listing', async () => {
    __resetModelCatalogCache();
    vi.stubGlobal('fetch', vi.fn(async () => ok([{ id: 'openai/gpt-4o' }])));
    await fetchVercelListing(0);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('null', { status: 200 })));
    expect((await fetchVercelListing(2 * 60 * 60 * 1000)).map((m) => m.id)).toEqual(['openai/gpt-4o']);
  });

  it('a body without a data array is an empty listing', async () => {
    __resetModelCatalogCache();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ object: 'list' }), { status: 200 })));
    expect(await fetchVercelListing(0)).toEqual([]);
  });

  it('asks for JSON', async () => {
    __resetModelCatalogCache();
    const fetchMock = vi.fn(async () => ok([]));
    vi.stubGlobal('fetch', fetchMock);
    await fetchVercelListing(0);
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(new Headers(init.headers).get('accept')).toBe('application/json');
  });
});

describe('createGateway', () => {
  it('points the OpenAI-compatible client at the AI Gateway with the Tulzo key', async () => {
    vi.resetModules();
    const createOpenAI = vi.fn(() => () => null);
    vi.doMock('@ai-sdk/openai', () => ({ createOpenAI }));
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gw-test-key');
    const mod = await import('@/src/lib/ai-gateway');
    mod.createGateway();
    expect(createOpenAI).toHaveBeenCalledWith({ baseURL: 'https://ai-gateway.vercel.sh/v1', apiKey: 'gw-test-key' });
    vi.doUnmock('@ai-sdk/openai');
  });
});
