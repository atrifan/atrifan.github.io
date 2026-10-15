import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GATEWAY_MODELS, DEFAULT_CHAT_MODEL } from '@/src/config/gateway-models';
import {
  MODELS_URL,
  VERCEL_MODELS_URL,
  __resetModelCatalogCache,
  buildCatalog,
  chatModelPrice,
  chatModels,
  fetchVercelListing,
  isChatModel,
  modelNotAllowedBody,
  perTokenToPer1M,
  priceFromListing,
  type VercelModel,
} from '@/src/lib/models/catalog';
import { AI_GATEWAY_BASE_URL, UnknownModelError, calculateCost, chatBillingMarkup, costForModel } from '@/src/lib/ai-gateway';
const snapshot = JSON.parse(readFileSync('tests/fixtures/vercel-models-snapshot.json', 'utf8')) as {
  data: VercelModel[];
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the built-in fallback list (used only when Vercel's listing is unavailable)", () => {
  it('every fallback model has a positive input and output price', () => {
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

  it('the default chat model and the gigs defaults are in the fallback list', async () => {
    const ids = GATEWAY_MODELS.map((m) => m.id);
    expect(DEFAULT_CHAT_MODEL).toBe('openai/gpt-4o-mini');
    expect(ids).toContain(DEFAULT_CHAT_MODEL);
    // spec-builder builds a Supabase client at import; any URL/key will do, nothing is called.
    vi.stubEnv('STORAGE_SUPABASE_URL', 'http://127.0.0.1:1');
    vi.stubEnv('STORAGE_SUPABASE_SERVICE_ROLE_KEY', 'unit-test');
    const { DEFAULT_SPEC_MODEL } = await import('@/src/lib/jobs/spec-builder');
    const { DEFAULT_STEERING_MODEL } = await import('@/src/lib/jobs/steering');
    expect(ids).toContain(DEFAULT_SPEC_MODEL);
    expect(ids).toContain(DEFAULT_STEERING_MODEL);
  });

  it('every fallback id is a chat model in the Vercel listing snapshot, at the same base price', () => {
    const byId = new Map(snapshot.data.map((m) => [m.id, m]));
    for (const m of GATEWAY_MODELS) {
      const v = byId.get(m.id);
      expect(v, `${m.id} missing from tests/fixtures/vercel-models-snapshot.json`).toBeDefined();
      expect(isChatModel(v!), m.id).toBe(true);
      const p = priceFromListing(v!)!;
      expect(m.inputPer1M, m.id).toBeCloseTo(p.inputPer1M, 9);
      expect(m.outputPer1M, m.id).toBeCloseTo(p.outputPer1M, 9);
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

  it('returns null for missing, empty or invalid values; zero is a real (free) price', () => {
    expect(perTokenToPer1M(undefined)).toBeNull();
    expect(perTokenToPer1M('')).toBeNull();
    expect(perTokenToPer1M('   ')).toBeNull();
    expect(perTokenToPer1M('abc')).toBeNull();
    expect(perTokenToPer1M('-0.1')).toBeNull();
    expect(perTokenToPer1M('0')).toBe(0);
  });
});

const priced = (id: string, extra: Partial<VercelModel> = {}): VercelModel => ({
  id,
  name: `${id} name`,
  type: 'language',
  pricing: { input: '0.000001', output: '0.000002' },
  ...extra,
});

describe('isChatModel and chatModels: pass-through of Vercel chat models', () => {
  it('a chat model is a priced language model that is not a -batch variant', () => {
    expect(isChatModel(priced('vendor/new'))).toBe(true);
    expect(isChatModel(priced('openai/gpt-5-fast'))).toBe(true);
    expect(isChatModel(priced('openai/gpt-5-batch'))).toBe(false);
    expect(isChatModel(priced('openai/text-embedding-3-small', { type: 'embedding' }))).toBe(false);
    expect(isChatModel(priced('vendor/untyped', { type: undefined }))).toBe(false);
    expect(isChatModel(priced('vendor/no-input', { pricing: { output: '0.000002' } }))).toBe(false);
    expect(isChatModel(priced('vendor/no-output', { pricing: { input: '0.000001' } }))).toBe(false);
    expect(isChatModel(priced('vendor/no-pricing', { pricing: undefined }))).toBe(false);
    expect(isChatModel(priced('vendor/bad-price', { pricing: { input: 'n/a', output: '0.000002' } }))).toBe(false);
  });

  it('chatModels keeps chat models only, sorted by id', () => {
    const ids = chatModels([
      priced('zeta/z'),
      priced('alpha/a'),
      priced('openai/gpt-5-batch'),
      priced('openai/text-embedding-3-small', { type: 'embedding' }),
      priced('mid/m'),
    ]).map((m) => m.id);
    expect(ids).toEqual(['alpha/a', 'mid/m', 'zeta/z']);
  });

  it('chatModels of the real snapshot keeps every fallback model', () => {
    const ids = new Set(chatModels(snapshot.data).map((m) => m.id));
    for (const m of GATEWAY_MODELS) expect(ids.has(m.id), m.id).toBe(true);
  });
});

describe('priceFromListing', () => {
  it('is the base per-1M price, with the cached-input price when Vercel has one', () => {
    expect(priceFromListing(priced('a/b', { pricing: { input: '0.00000015', output: '0.0000006', input_cache_read: '0.000000075' } }))).toEqual({
      inputPer1M: 0.15,
      outputPer1M: 0.6,
      cachedInputPer1M: 0.075,
    });
    const noCache = priceFromListing(priced('a/b'))!;
    expect(noCache).toEqual({ inputPer1M: 1, outputPer1M: 2 });
    expect('cachedInputPer1M' in noCache).toBe(false);
    expect(priceFromListing(priced('a/b', { pricing: { input: '0.000001' } }))).toBeNull();
  });
});

describe('buildCatalog', () => {
  const listing: VercelModel[] = [
    priced('openai/gpt-4o-mini', {
      name: 'GPT-4o mini (Vercel name)',
      context_window: 128000,
      max_tokens: 16384,
      supported_parameters: ['max_tokens', 'tools'],
      modalities: { input: ['text', 'image'], output: ['text'] },
      pricing: { input: '0.00000015', output: '0.0000006', input_cache_read: '0.000000075' },
    }),
    priced('vendor/new-model', { supported_parameters: [], modalities: { input: ['text'] } }),
    priced('openai/gpt-4o-mini-batch'),
    priced('openai/text-embedding-3-small', { type: 'embedding' }),
  ];

  it('lists every Vercel chat model (sorted), not a fixed allowlist', () => {
    expect(buildCatalog(listing, 1).map((m) => m.id)).toEqual(['openai/gpt-4o-mini', 'vendor/new-model']);
  });

  it('takes name, context window, output limit and capabilities from the listing', () => {
    const mini = buildCatalog(listing, 1).find((m) => m.id === 'openai/gpt-4o-mini')!;
    expect(mini).toMatchObject({
      name: 'GPT-4o mini (Vercel name)',
      context_window: 128000,
      max_output_tokens: 16384,
      supports_tools: true,
      supports_vision: true,
    });
  });

  it('names fall back to the id', () => {
    expect(buildCatalog([priced('vendor/x', { name: undefined })], 1)[0].name).toBe('vendor/x');
  });

  it('uses null and false when the listing lacks a field', () => {
    const one = (v: Partial<VercelModel>) => buildCatalog([priced('vendor/x', v)], 1)[0];
    expect(one({}).context_window).toBeNull();
    expect(one({}).max_output_tokens).toBeNull();
    expect(one({}).supports_tools).toBe(false);
    expect(one({}).supports_vision).toBe(false);
    expect(one({ context_window: 0 }).context_window).toBeNull();
    expect(one({ context_window: -5 }).context_window).toBeNull();
    expect(one({ context_window: 1.5 }).context_window).toBeNull();
    expect(one({ context_window: '128000' as unknown as number }).context_window).toBeNull();
    expect(one({ context_window: 1 }).context_window).toBe(1);
    expect(one({ max_tokens: 0 }).max_output_tokens).toBeNull();
    expect(one({ modalities: { output: ['text'] } }).supports_vision).toBe(false);
    expect(one({ modalities: { input: ['text'] } }).supports_vision).toBe(false);
    expect(one({ supported_parameters: ['max_tokens'] }).supports_tools).toBe(false);
  });

  it('prices are Vercel price × markup, rounded to 6 decimals', () => {
    const marked = buildCatalog(listing, 1.3).find((m) => m.id === 'openai/gpt-4o-mini')!;
    expect(marked.pricing).toEqual({ input_per_1m: 0.195, output_per_1m: 0.78, cached_input_per_1m: 0.0975 });
    const plain = buildCatalog(listing, 1).find((m) => m.id === 'vendor/new-model')!;
    expect(plain.pricing).toEqual({ input_per_1m: 1, output_per_1m: 2 });
    expect('cached_input_per_1m' in plain.pricing).toBe(false);
  });

  it('without any Vercel chat model it lists the built-in fallback, priced × markup, metadata null', () => {
    for (const empty of [[], [priced('openai/x-batch')], [priced('e/emb', { type: 'embedding' })]] as VercelModel[][]) {
      const out = buildCatalog(empty, 1.3);
      expect(out.map((m) => m.id)).toEqual(GATEWAY_MODELS.map((m) => m.id));
      const mini = out.find((m) => m.id === 'openai/gpt-4o-mini')!;
      expect(mini.pricing.input_per_1m).toBe(0.195);
      expect(mini.name).toBe('GPT-4o mini');
      expect(mini.context_window).toBeNull();
      expect(mini.supports_tools).toBe(false);
    }
    const kimi = buildCatalog([], 1).find((m) => m.id === 'moonshotai/kimi-k2.5')!;
    expect('cached_input_per_1m' in kimi.pricing).toBe(false);
  });
});

describe('calculateCost, costForModel and the billing markup', () => {
  it('calculateCost is base USD for a price', () => {
    expect(calculateCost({ inputPer1M: 0.15, outputPer1M: 0.6 }, 1_000_000, 0)).toBeCloseTo(0.15, 12);
    expect(calculateCost({ inputPer1M: 0.15, outputPer1M: 0.6 }, 0, 1_000_000)).toBeCloseTo(0.6, 12);
    expect(calculateCost({ inputPer1M: 2, outputPer1M: 10 }, 500_000, 100_000)).toBeCloseTo(2, 12);
  });

  it('chatBillingMarkup is CREDIT_MARKUP for every key, default 1.3', () => {
    expect(chatBillingMarkup()).toBe(1.3);
    vi.stubEnv('CREDIT_MARKUP', '1.5');
    expect(chatBillingMarkup()).toBe(1.5);
  });

  it('the refusal body names the model and points at /api/models', () => {
    const body = modelNotAllowedBody('openai/definitely-not-real');
    expect(body).toMatchObject({ code: 'model_not_allowed', model: 'openai/definitely-not-real', models_url: '/api/models' });
    expect(body.error).toContain('openai/definitely-not-real');
    expect(body.error).toContain('/api/models');
  });

  it('UnknownModelError carries the model id and its name', () => {
    const e = new UnknownModelError('openai/x');
    expect(e.model).toBe('openai/x');
    expect(e.name).toBe('UnknownModelError');
    expect(e.message).toContain('openai/x');
    expect(e).toBeInstanceOf(Error);
  });
});

describe('chatModelPrice and costForModel (async, through the cached listing)', () => {
  const ok = (data: unknown) => new Response(JSON.stringify({ object: 'list', data }), { status: 200 });

  afterEach(() => {
    vi.unstubAllGlobals();
    __resetModelCatalogCache();
  });

  it('prices any Vercel chat model; refuses -batch, embeddings and unknown ids', async () => {
    __resetModelCatalogCache();
    vi.stubGlobal('fetch', vi.fn(async () => ok([priced('vendor/new'), priced('vendor/new-batch'), priced('e/emb', { type: 'embedding' })])));
    expect(await chatModelPrice('vendor/new')).toEqual({ inputPer1M: 1, outputPer1M: 2 });
    expect(await chatModelPrice('vendor/new-batch')).toBeNull();
    expect(await chatModelPrice('e/emb')).toBeNull();
    expect(await chatModelPrice('openai/gpt-4o-mini')).toBeNull();
    expect(await chatModelPrice(42 as unknown as string)).toBeNull();
    expect(await costForModel('vendor/new', 1_000_000, 1_000_000)).toBeCloseTo(3, 12);
    await expect(costForModel('vendor/new-batch', 1, 1)).rejects.toBeInstanceOf(UnknownModelError);
  });

  it('falls back to the built-in list when Vercel has no chat models', async () => {
    __resetModelCatalogCache();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await chatModelPrice('openai/gpt-4o-mini')).toEqual({ inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075 });
    expect(await chatModelPrice('vendor/new')).toBeNull();
  });
});

describe('gateway endpoint', () => {
  it('uses the documented AI Gateway host', () => {
    expect(AI_GATEWAY_BASE_URL).toBe('https://ai-gateway.vercel.sh/v1');
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

describe('second mutation round: sorting, fallback shape, generation cost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetModelCatalogCache();
  });

  it('chatModels sorts any order strictly by id', () => {
    const ids = ['m/c', 'm/a', 'z/a', 'a/z', 'm/b', 'a/a', 'm/a2'];
    const sorted = chatModels(ids.map((id) => priced(id))).map((m) => m.id);
    expect(sorted).toEqual(['a/a', 'a/z', 'm/a', 'm/a2', 'm/b', 'm/c', 'z/a']);
    expect(chatModels(['b/b', 'a/a'].map((id) => priced(id))).map((m) => m.id)).toEqual(['a/a', 'b/b']);
    expect(chatModels(['a/a', 'b/b'].map((id) => priced(id))).map((m) => m.id)).toEqual(['a/a', 'b/b']);
  });

  it('fallback entries report no vision and no tools', () => {
    for (const m of buildCatalog([], 1)) {
      expect(m.supports_vision, m.id).toBe(false);
      expect(m.supports_tools, m.id).toBe(false);
      expect(m.max_output_tokens, m.id).toBeNull();
    }
  });

  it('fallback chatModelPrice omits cachedInputPer1M for a model without a cached price', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const kimi = await chatModelPrice('moonshotai/kimi-k2.5');
    expect(kimi).toEqual({ inputPer1M: 0.6, outputPer1M: 3 });
    expect('cachedInputPer1M' in kimi!).toBe(false);
  });

  it('resolveGenerationCost: the gateway-reported total, else the fallback', async () => {
    const { resolveGenerationCost } = await import('@/src/lib/ai-gateway');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gw-k');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { total_cost: '0.0123' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await resolveGenerationCost('gen_1', 9)).toBe(0.0123);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('https://ai-gateway.vercel.sh/v1/generation?id=gen_1');
    expect(new Headers(((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).headers).get('authorization')).toBe('Bearer gw-k');
    expect(await resolveGenerationCost(null, 9)).toBe(9);
    expect(await resolveGenerationCost('', 9)).toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));
    expect(await resolveGenerationCost('gen_2', 9)).toBe(9);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 })));
    expect(await resolveGenerationCost('gen_3', 9)).toBe(9);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await resolveGenerationCost('gen_4', 9)).toBe(9);
  });
});
