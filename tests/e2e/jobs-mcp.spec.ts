import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import Stripe from 'stripe';

// Behaviour-only contract tests for the Jobs MCP endpoint (POST /api/jobs/mcp)
// and the customer-side contract HTTP API it pairs with (messages, activity,
// milestones, steering). Runs against a throwaway DB, a fake Stripe and no AI.

test.skip(!process.env.JOBS_E2E_AUTH_SECRET, 'gigs e2e env not set');

const E2E_SECRET = process.env.JOBS_E2E_AUTH_SECRET ?? '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const API_KEY = process.env.JOBS_MCP_E2E_API_KEY ?? '';
const API_KEY_USER = process.env.JOBS_MCP_E2E_API_KEY_USER ?? '';
const REVOKED_KEY = process.env.JOBS_MCP_E2E_REVOKED_KEY ?? '';
const stripe = new Stripe('sk_test_x');

const MCP = '/api/jobs/mcp';
const DUMMY_ID = '00000000-0000-4000-8000-000000000000';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// helpers

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

function uid(role: string): string {
  return `user_mcp_${role}_${Date.now().toString(36)}${rand()}`;
}

function uniqueWord(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${rand()}`;
}

type Headers = Record<string, string>;

function auth(userId: string, client?: string): Headers {
  const h: Headers = { 'x-e2e-user': userId, 'x-e2e-secret': E2E_SECRET };
  if (client) h['x-e2e-client'] = client;
  return h;
}

let rpcId = 1;

async function rpcRaw(
  request: APIRequestContext,
  headers: Headers,
  body: unknown,
): Promise<APIResponse> {
  return request.post(MCP, {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    // A Buffer goes on the wire as-is; Playwright JSON-encodes a non-JSON string sent as application/json.
    data: typeof body === 'string' ? Buffer.from(body) : JSON.stringify(body),
  });
}

interface RpcBody {
  jsonrpc: string;
  id: unknown;
  result?: Record<string, any>;
  error?: { code: number; message: string };
}

async function rpc(
  request: APIRequestContext,
  headers: Headers,
  method: string,
  params: Record<string, unknown> = {},
): Promise<{ res: APIResponse; body: RpcBody }> {
  const id = rpcId++;
  const res = await rpcRaw(request, headers, { jsonrpc: '2.0', id, method, params });
  const body = (await res.json()) as RpcBody;
  return { res, body };
}

interface ToolResult {
  isError: boolean;
  sc: Record<string, any>;
  text: string;
}

async function callTool(
  request: APIRequestContext,
  headers: Headers,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  const { res, body } = await rpc(request, headers, 'tools/call', { name, arguments: args });
  expect(res.status(), `${name} http status`).toBe(200);
  expect(body.error, `${name} unexpected JSON-RPC error`).toBeUndefined();
  const result = body.result as Record<string, any>;
  expect(Array.isArray(result.content)).toBe(true);
  expect(result.content[0].type).toBe('text');
  return {
    isError: result.isError === true,
    sc: result.structuredContent as Record<string, any>,
    text: result.content[0].text as string,
  };
}

/** Call a tool and expect success; returns structuredContent. */
async function ok(
  request: APIRequestContext,
  headers: Headers,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, any>> {
  const r = await callTool(request, headers, name, args);
  expect(r.isError, `${name} failed: ${JSON.stringify(r.sc)}`).toBe(false);
  return r.sc;
}

/** Call a tool and expect a domain failure with the given code. */
async function fails(
  request: APIRequestContext,
  headers: Headers,
  name: string,
  args: Record<string, unknown>,
  code: string,
): Promise<Record<string, any>> {
  const r = await callTool(request, headers, name, args);
  expect(r.isError, `${name} should fail with ${code}: ${JSON.stringify(r.sc)}`).toBe(true);
  expect(r.sc.error).toBe(code);
  expect(typeof r.sc.message).toBe('string');
  return r.sc;
}

function makeEvent(type: string, object: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `evt_${Date.now()}_${rand()}`,
    object: 'event',
    type,
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object },
  };
}

async function postSignedWebhook(request: APIRequestContext, payload: string): Promise<APIResponse> {
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return request.post('/api/billing/webhook', {
    data: payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
  });
}

async function enableConnect(request: APIRequestContext, userId: string): Promise<string> {
  const onboard = await request.post('/api/connect/onboard', {
    headers: auth(userId),
    data: { country: 'DE' },
  });
  expect(onboard.status()).toBe(200);
  const { account_id } = (await onboard.json()) as { account_id: string };
  const hook = await postSignedWebhook(
    request,
    JSON.stringify(
      makeEvent('account.updated', {
        id: account_id,
        object: 'account',
        country: 'DE',
        payouts_enabled: true,
        charges_enabled: true,
        details_submitted: true,
        requirements: { disabled_reason: null, currently_due: [] },
      }),
    ),
  );
  expect(hook.status()).toBe(200);
  return account_id;
}

function validSpec(): Record<string, unknown> {
  return {
    requirements: ['Build a CSV import endpoint', 'Validate rows against the schema'],
    deliverables: ['Source code in a PR', 'Short README section'],
    acceptance_criteria: ['All provided sample files import without errors'],
    constraints: ['TypeScript only'],
    deadline: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    budget_min_cents: 20000,
    budget_max_cents: 40000,
    permitted_tools: ['node', 'vitest'],
    security: { data_sensitivity: 'internal', secrets_allowed: false, notes: 'No prod data' },
  };
}

async function createJob(
  request: APIRequestContext,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; title: string }> {
  const res = await request.post('/api/jobs', {
    headers: auth(userId),
    data: {
      title: `MCP e2e job ${rand()}`,
      description: 'A job created by the jobs MCP e2e suite for contract testing.',
      category: 'development',
      budget_min_cents: 20000,
      budget_max_cents: 40000,
      deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      ...overrides,
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { job: { id: string; title: string } }).job;
}

async function createOpenJob(
  request: APIRequestContext,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; title: string }> {
  const job = await createJob(request, userId, overrides);
  const draft = await request.post(`/api/jobs/${job.id}/spec/draft`, {
    headers: auth(userId),
    data: { spec: validSpec() },
  });
  expect(draft.status()).toBe(201);
  const approve = await request.post(`/api/jobs/${job.id}/spec/approve`, {
    headers: auth(userId),
    data: {},
  });
  expect(approve.status()).toBe(200);
  expect((await approve.json()).job.status).toBe('open');
  return job;
}

interface ContractSetup {
  customer: string;
  provider: string;
  /** MCP headers for the provider's agent. */
  agent: Headers;
  /** MCP headers for the customer's agent. */
  customerAgent: Headers;
  jobId: string;
  bidId: string;
  contractId: string;
  version: Record<string, any>;
}

const BID_PRICE = 30000;

/**
 * Customer opens a job; Connect-enabled provider bids via MCP; customer accepts.
 * With pay=true the checkout is completed via a signed webhook (contract active).
 */
async function setupContract(
  request: APIRequestContext,
  opts: { pay?: boolean; credits?: number } = {},
): Promise<ContractSetup> {
  const pay = opts.pay ?? true;
  const customer = uid('customer');
  const provider = uid('provider');
  const agent = auth(provider, `client_${rand()}`);
  const customerAgent = auth(customer, `client_${rand()}`);
  const job = await createOpenJob(request, customer);
  await enableConnect(request, provider);
  const bidSc = await ok(request, agent, 'jobs_bid', {
    job_id: job.id,
    price_cents: BID_PRICE,
    eta_days: 7,
    plan: 'Streaming CSV parser, schema validation, tests.',
    deliverables: ['PR with importer'],
    included_steering_credits: opts.credits ?? 2,
  });
  const bidId = bidSc.bid.id as string;

  const accept = await request.post(`/api/bids/${bidId}/accept`, {
    headers: auth(customer),
    data: { withdrawal_consent: true },
  });
  expect(accept.status()).toBe(201);
  const acc = await accept.json();
  expect(acc.contract.status).toBe('pending_payment');
  const contractId = acc.contract.id as string;
  const version = acc.version as Record<string, any>;

  if (pay) {
    const suffix = `${Date.now()}_${rand()}`;
    const payload = JSON.stringify(
      makeEvent('checkout.session.completed', {
        id: acc.contract.stripe_checkout_session_id ?? `cs_test_${suffix}`,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        status: 'complete',
        amount_total: version.customer_total_cents,
        currency: version.currency ?? 'eur',
        payment_intent: `pi_test_${suffix}`,
        metadata: { kind: 'contract', contract_id: contractId, job_id: job.id, bid_id: bidId },
      }),
    );
    const hook = await postSignedWebhook(request, payload);
    expect(hook.status()).toBe(200);
    const check = await request.get(`/api/contracts/${contractId}`, { headers: auth(customer) });
    expect(check.status()).toBe(200);
    expect((await check.json()).contract.status).toBe('active');
  }

  return { customer, provider, agent, customerAgent, jobId: job.id, bidId, contractId, version };
}

async function getContract(
  request: APIRequestContext,
  userId: string,
  contractId: string,
): Promise<Record<string, any>> {
  const res = await request.get(`/api/contracts/${contractId}`, { headers: auth(userId) });
  expect(res.status()).toBe(200);
  return res.json();
}

async function postSteering(
  request: APIRequestContext,
  customer: string,
  contractId: string,
  data: Record<string, unknown>,
): Promise<Record<string, any>> {
  const res = await request.post(`/api/contracts/${contractId}/steering`, {
    headers: auth(customer),
    data,
  });
  expect(res.status(), JSON.stringify(data)).toBe(201);
  return res.json();
}

const REQUIRED_TOOLS = [
  'jobs_search',
  'jobs_get',
  'offers_post',
  'offers_list_mine',
  'jobs_bid',
  'jobs_withdraw_bid',
  'contracts_list',
  'contract_get',
  'contract_accept_version',
  'progress_post',
  'milestone_update',
  'steering_list',
  'steering_respond',
  'whoami',
];

// ---------------------------------------------------------------------------

test.describe('jobs MCP: auth and transport', () => {
  for (const method of ['initialize', 'tools/list', 'tools/call']) {
    test(`${method} without credentials → 401 -32001 with WWW-Authenticate`, async ({ request }) => {
      const res = await rpcRaw(request, {}, {
        jsonrpc: '2.0',
        id: 7,
        method,
        params: method === 'tools/call' ? { name: 'whoami', arguments: {} } : {},
      });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.jsonrpc).toBe('2.0');
      expect('id' in body).toBe(true);
      expect(body.error.code).toBe(-32001);
      expect(typeof body.error.message).toBe('string');
      const www = res.headers()['www-authenticate'] ?? '';
      expect(www.startsWith('Bearer')).toBe(true);
      expect(www).toContain('resource_metadata="');
    });
  }

  test('revoked API key → 401 -32001', async ({ request }) => {
    test.skip(!REVOKED_KEY, 'no revoked key seeded');
    const res = await rpcRaw(request, { 'x-api-key': REVOKED_KEY }, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe(-32001);
  });

  test('unknown API key (x-api-key and Bearer) → 401 -32001', async ({ request }) => {
    for (const headers of <Headers[]>[
      { 'x-api-key': `tz_unknown_${rand()}${rand()}` },
      { authorization: `Bearer tz_unknown_${rand()}${rand()}` },
    ]) {
      const res = await rpcRaw(request, headers, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      expect(res.status(), JSON.stringify(headers)).toBe(401);
      expect((await res.json()).error.code).toBe(-32001);
    }
  });

  test('wrong x-e2e-secret → 401 -32001', async ({ request }) => {
    const res = await rpcRaw(
      request,
      { 'x-e2e-user': uid('nobody'), 'x-e2e-secret': `${E2E_SECRET}_wrong` },
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    );
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe(-32001);
  });

  test('body not JSON → 400 -32700', async ({ request }) => {
    const res = await rpcRaw(request, auth(uid('parse')), '{"jsonrpc": "2.0", not json');
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  test('unknown method → 200 -32601', async ({ request }) => {
    const { res, body } = await rpc(request, auth(uid('method')), 'foo/bar');
    expect(res.status()).toBe(200);
    expect(body.error?.code).toBe(-32601);
  });

  test('notification (no id) → 202 with empty body', async ({ request }) => {
    const res = await rpcRaw(request, auth(uid('notif')), {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(res.status()).toBe(202);
    expect(await res.text()).toBe('');
  });

  test('GET /api/jobs/mcp → 405', async ({ request }) => {
    const res = await request.get(MCP, { headers: auth(uid('get')), maxRedirects: 0 });
    expect(res.status()).toBe(405);
  });

  test('protected resource metadata', async ({ request }) => {
    const res = await request.get('/.well-known/oauth-protected-resource/api/jobs/mcp');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.resource).toBe('string');
    expect(body.resource.endsWith('/api/jobs/mcp')).toBe(true);
    expect(Array.isArray(body.authorization_servers)).toBe(true);
    expect(body.authorization_servers.length).toBeGreaterThan(0);
    for (const s of body.authorization_servers) expect(typeof s).toBe('string');
  });

  test('unknown tool name → JSON-RPC -32602', async ({ request }) => {
    const { res, body } = await rpc(request, auth(uid('tool')), 'tools/call', {
      name: `no_such_tool_${rand()}`,
      arguments: {},
    });
    expect(res.status()).toBe(200);
    expect(body.error?.code).toBe(-32602);
  });
});

// ---------------------------------------------------------------------------

test.describe('jobs MCP: free-plan API key', () => {
  test.skip(!API_KEY || !API_KEY_USER, 'no seeded API key');

  test('whoami via x-api-key → free plan, api_key auth, key user', async ({ request }) => {
    const sc = await ok(request, { 'x-api-key': API_KEY }, 'whoami');
    expect(sc.user_id).toBe(API_KEY_USER);
    expect(sc.plan).toBe('free');
    expect(sc.auth_method).toBe('api_key');
    expect(sc.agent.id).toMatch(UUID_RE);
  });

  test('whoami via Authorization: Bearer → same user and plan', async ({ request }) => {
    const sc = await ok(request, { authorization: `Bearer ${API_KEY}` }, 'whoami');
    expect(sc.user_id).toBe(API_KEY_USER);
    expect(sc.plan).toBe('free');
    expect(sc.auth_method).toBe('api_key');
  });

  test('free plan can list tools', async ({ request }) => {
    const { res, body } = await rpc(request, { 'x-api-key': API_KEY }, 'tools/list');
    expect(res.status()).toBe(200);
    expect(Array.isArray(body.result?.tools)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

test.describe('jobs MCP: initialize, tools/list, whoami', () => {
  test('initialize → server info, tools capability, instructions', async ({ request }) => {
    const { res, body } = await rpc(request, auth(uid('init')), 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'e2e-client', version: '0.0.1' },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] ?? '').toContain('application/json');
    const r = body.result as Record<string, any>;
    expect(typeof r.protocolVersion).toBe('string');
    expect(r.serverInfo.name).toBe('tulzo-jobs');
    expect(typeof r.capabilities.tools).toBe('object');
    expect(r.capabilities.tools).not.toBeNull();
    expect(typeof r.instructions).toBe('string');
    expect(r.instructions.length).toBeGreaterThan(0);
  });

  test('tools/list → required tools with descriptions and object schemas', async ({ request }) => {
    const { res, body } = await rpc(request, auth(uid('list')), 'tools/list');
    expect(res.status()).toBe(200);
    const tools = body.result?.tools as Array<{
      name: string;
      description: string;
      inputSchema: { type: string; properties: Record<string, unknown> };
    }>;
    expect(Array.isArray(tools)).toBe(true);
    const names = tools.map((t) => t.name);
    for (const n of REQUIRED_TOOLS) expect(names).toContain(n);
    for (const t of tools) {
      expect(typeof t.description, t.name).toBe('string');
      expect(t.description.length, t.name).toBeGreaterThan(0);
      expect(t.inputSchema.type, t.name).toBe('object');
      expect(typeof t.inputSchema.properties, t.name).toBe('object');
    }
    const progress = tools.find((t) => t.name === 'progress_post');
    expect(progress?.description).toMatch(/chain[- ]of[- ]thought/i);
    const respond = tools.find((t) => t.name === 'steering_respond');
    expect(respond?.description).toMatch(/scope/i);
  });

  test('whoami for a fresh test user → shape, test auth, connect not enabled, trust n/a', async ({
    request,
  }) => {
    const user = uid('who');
    const sc = await ok(request, auth(user), 'whoami');
    expect(sc.user_id).toBe(user);
    expect(['free', 'pro', 'plus', 'super']).toContain(sc.plan);
    expect(sc.auth_method).toBe('test');
    expect(sc.agent.id).toMatch(UUID_RE);
    expect(typeof sc.agent.name).toBe('string');
    expect(sc.agent.version === null || typeof sc.agent.version === 'string').toBe(true);
    expect(typeof sc.connect.connect_status).toBe('string');
    expect(sc.connect.payouts_enabled).toBe(false);
    expect(() => new URL(sc.connect.onboarding_url)).not.toThrow();
    expect(sc.trust).toEqual({ score: null, status: 'not_available' });
  });

  test('whoami after Connect is enabled → payouts_enabled true', async ({ request }) => {
    const user = uid('whoconn');
    await enableConnect(request, user);
    const sc = await ok(request, auth(user), 'whoami');
    expect(sc.connect.payouts_enabled).toBe(true);
  });

  test('tool result carries text JSON equal to structuredContent', async ({ request }) => {
    const r = await callTool(request, auth(uid('text')), 'whoami');
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.text)).toEqual(r.sc);
  });

  test('initialize clientInfo becomes the agent name/version in whoami', async ({ request }) => {
    const headers = auth(uid('ident'), `client_${rand()}`);
    const name = `Agent ${rand()}`;
    const init = await rpc(request, headers, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name, version: '1.2.3' },
    });
    expect(init.res.status()).toBe(200);
    const sc = await ok(request, headers, 'whoami');
    expect(sc.agent.name).toBe(name);
    expect(sc.agent.version).toBe('1.2.3');
  });

  test('agent identity: same client → same id, different client → different id', async ({
    request,
  }) => {
    const user = uid('multi');
    const a1 = await ok(request, auth(user, 'client_a'), 'whoami');
    const a2 = await ok(request, auth(user, 'client_a'), 'whoami');
    const b = await ok(request, auth(user, 'client_b'), 'whoami');
    expect(a1.agent.id).toBe(a2.agent.id);
    expect(b.agent.id).not.toBe(a1.agent.id);
    expect(a1.user_id).toBe(user);
    expect(b.user_id).toBe(user);
  });
});

// ---------------------------------------------------------------------------

test.describe('jobs MCP: jobs_search and jobs_get', () => {
  test('open job is searchable and readable with its approved spec; drafts are hidden', async ({
    request,
  }) => {
    const customer = uid('customer');
    const agent = auth(uid('searcher'));
    const word = uniqueWord('mcpsearch');
    const open = await createOpenJob(request, customer, { title: `Open ${word} job` });
    const draft = await createJob(request, customer, { title: `Draft ${word} job` });

    const found = await ok(request, agent, 'jobs_search', { q: word });
    expect(Array.isArray(found.jobs)).toBe(true);
    expect(typeof found.total).toBe('number');
    expect(typeof found.limit).toBe('number');
    expect(found.offset).toBe(0);
    const ids = (found.jobs as Array<{ id: string }>).map((j) => j.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(draft.id);
    const job = (found.jobs as Array<Record<string, any>>).find((j) => j.id === open.id)!;
    expect(job.status).toBe('open');
    expect(job.title).toBe(`Open ${word} job`);
    expect(typeof job.description).toBe('string');
    expect(job.budget_min_cents).toBe(20000);
    expect(job.budget_max_cents).toBe(40000);
    expect(typeof job.deadline).toBe('string');
    expect(job.bid_count).toBe(0);

    const filtered = await ok(request, agent, 'jobs_search', { q: word, min_price_cents: 50000 });
    expect((filtered.jobs as Array<{ id: string }>).map((j) => j.id)).not.toContain(open.id);
    const category = await ok(request, agent, 'jobs_search', { q: word, category: 'design' });
    expect((category.jobs as Array<{ id: string }>).map((j) => j.id)).not.toContain(open.id);

    const paged = await ok(request, agent, 'jobs_search', { q: word, limit: 1, offset: 0 });
    expect(paged.limit).toBe(1);
    expect(paged.jobs.length).toBeLessThanOrEqual(1);

    const got = await ok(request, agent, 'jobs_get', { job_id: open.id });
    expect(got.job.id).toBe(open.id);
    expect(got.spec.status).toBe('approved');
    expect(Array.isArray(got.spec.requirements)).toBe(true);
    expect(Array.isArray(got.spec.deliverables)).toBe(true);
    expect(Array.isArray(got.spec.acceptance_criteria)).toBe(true);

    await fails(request, agent, 'jobs_get', { job_id: draft.id }, 'not_found');
    await fails(request, agent, 'jobs_get', { job_id: DUMMY_ID }, 'not_found');
  });

  test('jobs_search with mine=true lists only the caller’s jobs', async ({ request }) => {
    const customer = uid('owner');
    const job = await createOpenJob(request, customer);
    const mine = await ok(request, auth(customer), 'jobs_search', { mine: true, limit: 50 });
    expect((mine.jobs as Array<{ id: string }>).map((j) => j.id)).toContain(job.id);
    const other = await ok(request, auth(uid('other')), 'jobs_search', { mine: true, limit: 50 });
    expect((other.jobs as Array<{ id: string }>).map((j) => j.id)).not.toContain(job.id);
  });
});

// ---------------------------------------------------------------------------

test.describe('jobs MCP: offers', () => {
  test('offers_post validates, creates an active offer, and offers_list_mine lists it', async ({
    request,
  }) => {
    const seller = auth(uid('seller'));
    const word = uniqueWord('mcpoffer');

    await fails(request, seller, 'offers_post', { title: 'Only a title' }, 'invalid_request');
    await fails(
      request,
      seller,
      'offers_post',
      { title: 'Valid offer', description: 'Valid description text.', price_cents: 0, delivery_days: 2 },
      'invalid_request',
    );
    await fails(
      request,
      seller,
      'offers_post',
      { title: 'Valid offer', description: 'Valid description text.', price_cents: 1000, delivery_days: 400 },
      'invalid_request',
    );

    const created = await ok(request, seller, 'offers_post', {
      title: `Logo design ${word}`,
      description: 'I will design a clean vector logo for your brand.',
      price_cents: 15000,
      delivery_days: 3,
      tags: ['design'],
      category: 'design',
    });
    expect(created.offer).toMatchObject({
      title: `Logo design ${word}`,
      price_cents: 15000,
      status: 'active',
    });
    expect(typeof created.offer.id).toBe('string');

    const mine = await ok(request, seller, 'offers_list_mine', {});
    expect((mine.offers as Array<{ id: string }>).map((o) => o.id)).toContain(created.offer.id);
    expect(mine.total).toBeGreaterThanOrEqual(1);
    expect(typeof mine.limit).toBe('number');
    expect(typeof mine.offset).toBe('number');

    const theirs = await ok(request, auth(uid('buyer')), 'offers_list_mine', {});
    expect((theirs.offers as Array<{ id: string }>).map((o) => o.id)).not.toContain(created.offer.id);
  });
});

// ---------------------------------------------------------------------------

test.describe('jobs MCP: bidding', () => {
  test('jobs_bid without Connect → connect_required with onboarding_url', async ({ request }) => {
    const job = await createOpenJob(request, uid('customer'));
    const sc = await fails(
      request,
      auth(uid('noconnect')),
      'jobs_bid',
      { job_id: job.id, price_cents: BID_PRICE, eta_days: 7 },
      'connect_required',
    );
    expect(typeof sc.onboarding_url).toBe('string');
    expect(sc.onboarding_url.length).toBeGreaterThan(0);
  });

  test('jobs_bid success, agent attribution, pricing, owner sees it, bid_exists', async ({
    request,
  }) => {
    test.setTimeout(90_000);
    const customer = uid('customer');
    const provider = uid('provider');
    const agent = auth(provider, `client_${rand()}`);
    const job = await createOpenJob(request, customer);
    await enableConnect(request, provider);
    const me = await ok(request, agent, 'whoami');

    const sc = await ok(request, agent, 'jobs_bid', {
      job_id: job.id,
      price_cents: BID_PRICE,
      eta_days: 7,
      plan: 'Plan text',
      deliverables: ['PR'],
      included_steering_credits: 2,
      assumptions: ['Samples are representative'],
    });
    expect(sc.bid).toMatchObject({
      job_id: job.id,
      status: 'active',
      price_cents: BID_PRICE,
      included_steering_credits: 2,
    });
    expect(sc.bid.agent_identity_id).toMatch(UUID_RE);
    expect(sc.bid.agent_identity_id).toBe(me.agent.id);
    expect(sc.pricing.bid_cents).toBe(BID_PRICE);
    expect(sc.pricing.customer_total_cents).toBe(sc.pricing.bid_cents + sc.pricing.fee_cents);
    expect(typeof sc.pricing.provider_net_cents).toBe('number');
    expect(typeof sc.pricing.commission_bps).toBe('number');

    const bids = await request.get(`/api/jobs/${job.id}/bids`, { headers: auth(customer) });
    expect(bids.status()).toBe(200);
    expect(((await bids.json()).bids as Array<{ id: string }>).map((b) => b.id)).toContain(sc.bid.id);

    await fails(
      request,
      agent,
      'jobs_bid',
      { job_id: job.id, price_cents: 28000, eta_days: 5 },
      'bid_exists',
    );
  });

  test('jobs_bid domain errors: own_job, job_not_open, price_out_of_bounds, not_found, invalid_request', async ({
    request,
  }) => {
    test.setTimeout(90_000);
    const customer = uid('customer');
    const provider = uid('provider');
    const job = await createOpenJob(request, customer);
    const draft = await createJob(request, customer);
    await enableConnect(request, customer);
    await enableConnect(request, provider);
    const agent = auth(provider);

    await fails(
      request,
      auth(customer),
      'jobs_bid',
      { job_id: job.id, price_cents: BID_PRICE, eta_days: 7 },
      'own_job',
    );
    await fails(
      request,
      agent,
      'jobs_bid',
      { job_id: draft.id, price_cents: BID_PRICE, eta_days: 7 },
      'job_not_open',
    );
    await fails(
      request,
      agent,
      'jobs_bid',
      { job_id: job.id, price_cents: 100, eta_days: 7 },
      'price_out_of_bounds',
    );
    await fails(
      request,
      agent,
      'jobs_bid',
      { job_id: DUMMY_ID, price_cents: BID_PRICE, eta_days: 7 },
      'not_found',
    );
    await fails(request, agent, 'jobs_bid', { job_id: job.id, eta_days: 7 }, 'invalid_request');
  });

  test('jobs_withdraw_bid: other user not_found, withdraw, twice bid_not_active, rebid', async ({
    request,
  }) => {
    test.setTimeout(90_000);
    const customer = uid('customer');
    const provider = uid('provider');
    const agent = auth(provider);
    const job = await createOpenJob(request, customer);
    await enableConnect(request, provider);
    const bid = (await ok(request, agent, 'jobs_bid', { job_id: job.id, price_cents: BID_PRICE, eta_days: 7 }))
      .bid;

    await fails(request, auth(uid('thief')), 'jobs_withdraw_bid', { bid_id: bid.id }, 'not_found');

    const w = await ok(request, agent, 'jobs_withdraw_bid', { bid_id: bid.id });
    expect(w.bid.id).toBe(bid.id);
    expect(w.bid.status).toBe('withdrawn');

    await fails(request, agent, 'jobs_withdraw_bid', { bid_id: bid.id }, 'bid_not_active');

    const again = await ok(request, agent, 'jobs_bid', { job_id: job.id, price_cents: 29000, eta_days: 6 });
    expect(again.bid.status).toBe('active');
    expect(again.bid.id).not.toBe(bid.id);
  });
});

// ---------------------------------------------------------------------------

test.describe('jobs MCP: contracts', () => {
  test('contracts_list and contract_get for both parties; third party forbidden', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request);
    const stranger = uid('stranger');

    const provList = await ok(request, s.agent, 'contracts_list', { role: 'provider' });
    const pc = (provList.contracts as Array<Record<string, any>>).find((c) => c.id === s.contractId);
    expect(pc).toBeDefined();
    expect(pc!.job_id).toBe(s.jobId);
    expect(typeof pc!.job_title).toBe('string');
    expect(pc!.role).toBe('provider');
    expect(pc!.status).toBe('active');
    expect(pc!.current_version.version).toBe(1);
    expect(pc!.current_version.price_cents).toBe(BID_PRICE);
    expect(pc!.current_version.steering_allowance).toBe(2);

    const custList = await ok(request, s.customerAgent, 'contracts_list', { role: 'customer' });
    const cc = (custList.contracts as Array<Record<string, any>>).find((c) => c.id === s.contractId);
    expect(cc?.role).toBe('customer');

    const asCustomerRoleProvider = await ok(request, s.customerAgent, 'contracts_list', { role: 'provider' });
    expect((asCustomerRoleProvider.contracts as Array<{ id: string }>).map((c) => c.id)).not.toContain(
      s.contractId,
    );

    const strangerList = await ok(request, auth(stranger), 'contracts_list', {});
    expect((strangerList.contracts as Array<{ id: string }>).map((c) => c.id)).not.toContain(s.contractId);

    const got = await ok(request, s.agent, 'contract_get', { contract_id: s.contractId });
    expect(got.contract.id).toBe(s.contractId);
    expect(got.contract.status).toBe('active');
    expect(got.contract.job_id).toBe(s.jobId);
    expect(got.role).toBe('provider');
    expect(got.job.id).toBe(s.jobId);
    expect(typeof got.job.title).toBe('string');
    expect(got.current_version.version).toBe(1);
    expect(got.current_version.price_cents).toBe(BID_PRICE);
    expect(got.current_version.customer_total_cents).toBe(
      got.current_version.price_cents + got.current_version.fee_cents,
    );
    expect(Array.isArray(got.versions)).toBe(true);
    expect(got.versions.find((v: any) => v.id === got.current_version.id)?.state).toBe('current');
    expect(got.work_paused).toBe(false);
    expect(got.steering_credits).toEqual({ allowance: 2, used: 0, remaining: 2 });
    expect(Array.isArray(got.milestones)).toBe(true);
    expect(Array.isArray(got.open_steering)).toBe(true);

    const custGot = await ok(request, s.customerAgent, 'contract_get', { contract_id: s.contractId });
    expect(custGot.role).toBe('customer');

    await fails(request, auth(stranger), 'contract_get', { contract_id: s.contractId }, 'forbidden');
    await fails(request, s.agent, 'contract_get', { contract_id: DUMMY_ID }, 'not_found');

    const http = await request.get(`/api/contracts/${s.contractId}`, { headers: auth(stranger) });
    expect(http.status()).toBe(403);
    expect(await http.json()).toMatchObject({ error: 'forbidden' });
    const http404 = await request.get(`/api/contracts/${DUMMY_ID}`, { headers: auth(s.customer) });
    expect(http404.status()).toBe(404);

    const body = await getContract(request, s.customer, s.contractId);
    expect(body.role).toBe('customer');
    expect(body.contract.id).toBe(s.contractId);
    expect(body.current_version.price_cents).toBe(BID_PRICE);
    expect(Array.isArray(body.versions)).toBe(true);
    expect(body.work_paused).toBe(false);
    expect(body.steering_credits.remaining).toBe(2);
  });

  test('progress_post on a pending_payment contract → invalid_state', async ({ request }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request, { pay: false });
    await fails(
      request,
      s.agent,
      'progress_post',
      { contract_id: s.contractId, summary: 'Started early' },
      'invalid_state',
    );
  });

  test('progress_post: provider ok, customer forbidden, validation; shows in messages with since cursor', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request);

    await fails(request, s.agent, 'progress_post', { contract_id: s.contractId, summary: '' }, 'invalid_request');
    await fails(
      request,
      s.agent,
      'progress_post',
      { contract_id: s.contractId, summary: 'Too far', percent_complete: 101 },
      'invalid_request',
    );
    await fails(
      request,
      s.customerAgent,
      'progress_post',
      { contract_id: s.contractId, summary: 'I am the customer' },
      'forbidden',
    );

    const summary = `Parser done ${rand()}`;
    const posted = await ok(request, s.agent, 'progress_post', {
      contract_id: s.contractId,
      summary,
      details: 'Streaming parser implemented; validation next.',
      percent_complete: 40,
    });
    expect(posted.message.kind).toBe('progress');
    expect(typeof posted.message.id).toBe('string');
    expect(posted.message.body).toContain(summary);

    const list = await request.get(`/api/contracts/${s.contractId}/messages`, { headers: auth(s.customer) });
    expect(list.status()).toBe(200);
    const lb = (await list.json()) as {
      messages: Array<{ id: string; seq: number; kind: string; body: string; author_role: string; created_at: string }>;
      next_cursor: unknown;
    };
    const pm = lb.messages.find((m) => m.id === posted.message.id);
    expect(pm).toBeDefined();
    expect(pm!.kind).toBe('progress');
    expect(pm!.author_role).toBe('provider');
    expect(typeof pm!.seq).toBe('number');
    expect(typeof pm!.created_at).toBe('string');
    expect(lb.next_cursor).toBeTruthy();

    const reply = await request.post(`/api/contracts/${s.contractId}/messages`, {
      headers: auth(s.customer),
      data: { body: 'Thanks, looks good' },
    });
    expect(reply.status()).toBe(201);
    const replyMsg = (await reply.json()).message as { id: string };

    const since = await request.get(
      `/api/contracts/${s.contractId}/messages?since=${encodeURIComponent(String(lb.next_cursor))}`,
      { headers: auth(s.provider) },
    );
    expect(since.status()).toBe(200);
    const sinceIds = ((await since.json()).messages as Array<{ id: string }>).map((m) => m.id);
    expect(sinceIds).toContain(replyMsg.id);
    expect(sinceIds).not.toContain(posted.message.id);
    for (const m of lb.messages) expect(sinceIds).not.toContain(m.id);

    const strangerMsgs = await request.get(`/api/contracts/${s.contractId}/messages`, {
      headers: auth(uid('stranger')),
    });
    expect(strangerMsgs.status()).toBe(403);

    const activity = await request.get(`/api/contracts/${s.contractId}/activity`, { headers: auth(s.customer) });
    expect(activity.status()).toBe(200);
    const ab = await activity.json();
    expect(Array.isArray(ab.events)).toBe(true);
    expect('next_cursor' in ab).toBe(true);
    for (const e of ab.events) {
      expect(typeof e.id).toBe('string');
      expect(typeof e.type).toBe('string');
      expect(typeof e.seq).toBe('number');
    }
  });

  test('milestone_update: create, update, validation, customer forbidden, visible over HTTP', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request);

    await fails(
      request,
      s.agent,
      'milestone_update',
      { contract_id: s.contractId, status: 'pending' },
      'invalid_request',
    );
    await fails(
      request,
      s.customerAgent,
      'milestone_update',
      { contract_id: s.contractId, title: 'Customer milestone', status: 'pending' },
      'forbidden',
    );

    const created = await ok(request, s.agent, 'milestone_update', {
      contract_id: s.contractId,
      title: 'Parser',
      description: 'Streaming CSV parser',
      status: 'in_progress',
    });
    expect(created.milestone.title).toBe('Parser');
    expect(created.milestone.status).toBe('in_progress');
    const mid = created.milestone.id as string;

    const updated = await ok(request, s.agent, 'milestone_update', {
      contract_id: s.contractId,
      milestone_id: mid,
      status: 'done',
    });
    expect(updated.milestone.id).toBe(mid);
    expect(updated.milestone.status).toBe('done');

    await fails(
      request,
      s.agent,
      'milestone_update',
      { contract_id: s.contractId, milestone_id: mid, status: 'finished' },
      'invalid_request',
    );

    const http = await request.get(`/api/contracts/${s.contractId}/milestones`, { headers: auth(s.customer) });
    expect(http.status()).toBe(200);
    const ms = ((await http.json()).milestones as Array<{ id: string; status: string }>).find((m) => m.id === mid);
    expect(ms?.status).toBe('done');
  });
});

// ---------------------------------------------------------------------------

test.describe('jobs MCP: steering', () => {
  test('clarification: free, open; estimate → invalid_state; customer forbidden; answered', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request);

    const provPost = await request.post(`/api/contracts/${s.contractId}/steering`, {
      headers: auth(s.provider),
      data: { message: 'Provider cannot steer' },
    });
    expect(provPost.status()).toBe(403);

    const created = await postSteering(request, s.customer, s.contractId, {
      message: 'Which CSV delimiter should be supported?',
    });
    expect(created.steering.kind).toBe('clarification');
    expect(created.steering.credit_cost).toBe(0);
    expect(created.steering.status).toBe('open');
    expect(created.decision.kind).toBe('clarification');
    const sid = created.steering.id as string;

    const list = await ok(request, s.agent, 'steering_list', { contract_id: s.contractId });
    const item = (list.steering as Array<Record<string, any>>).find((x) => x.id === sid);
    expect(item).toBeDefined();
    expect(item!.kind).toBe('clarification');
    expect(item!.status).toBe('open');
    expect(item!.credit_cost).toBe(0);

    await fails(
      request,
      s.agent,
      'steering_respond',
      { steering_id: sid, response: 'That costs extra', estimate_delta_cents: 5000, eta_days: 2 },
      'invalid_state',
    );
    await fails(
      request,
      s.customerAgent,
      'steering_respond',
      { steering_id: sid, response: 'Answering myself' },
      'forbidden',
    );

    const answered = await ok(request, s.agent, 'steering_respond', {
      steering_id: sid,
      response: 'Comma and semicolon.',
    });
    expect(answered.steering.status).toBe('answered');

    const contract = await getContract(request, s.customer, s.contractId);
    expect(contract.steering_credits.remaining).toBe(2);
    expect(contract.work_paused).toBe(false);
  });

  test('revision consumes a credit, resolves; with no credits left becomes a scope change', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request, { credits: 1 });

    const before = await getContract(request, s.customer, s.contractId);
    expect(before.steering_credits).toEqual({ allowance: 1, used: 0, remaining: 1 });

    const rev = await postSteering(request, s.customer, s.contractId, {
      message: 'Please rename the endpoint to /import',
      requested_kind: 'revision',
    });
    expect(rev.steering.kind).toBe('revision');
    expect(rev.steering.credit_cost).toBe(1);
    expect(rev.steering.status).toBe('open');

    const after = await getContract(request, s.customer, s.contractId);
    expect(after.steering_credits.remaining).toBe(0);
    expect(after.steering_credits.used).toBe(1);

    const viaMcp = await ok(request, s.agent, 'contract_get', { contract_id: s.contractId });
    expect(viaMcp.steering_credits.remaining).toBe(0);

    const resolved = await ok(request, s.agent, 'steering_respond', {
      steering_id: rev.steering.id,
      response: 'Renamed.',
    });
    expect(resolved.steering.status).toBe('resolved');

    const second = await postSteering(request, s.customer, s.contractId, {
      message: 'And rename the query parameter too',
      requested_kind: 'revision',
    });
    expect(second.steering.kind).toBe('scope_change');
  });

  test('scope change: estimate → approve with top-up checkout, work stays paused', async ({ request }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request);
    const oldTotal = s.version.customer_total_cents as number;
    const oldVersionId = s.version.id as string;

    const sc = await postSteering(request, s.customer, s.contractId, {
      message: 'Also support Excel files',
      requested_kind: 'scope_change',
    });
    expect(sc.steering.kind).toBe('scope_change');
    expect(sc.steering.status).toBe('awaiting_estimate');
    expect(sc.decision.requiresApproval).toBe(true);
    const sid = sc.steering.id as string;

    const paused = await getContract(request, s.customer, s.contractId);
    expect(paused.work_paused).toBe(true);
    const pausedMcp = await ok(request, s.agent, 'contract_get', { contract_id: s.contractId });
    expect(pausedMcp.work_paused).toBe(true);
    expect((pausedMcp.open_steering as Array<{ id: string }>).map((x) => x.id)).toContain(sid);

    await fails(
      request,
      s.agent,
      'milestone_update',
      { contract_id: s.contractId, title: 'Excel', status: 'pending' },
      'work_paused',
    );

    const est = await ok(request, s.agent, 'steering_respond', {
      steering_id: sid,
      response: 'Excel support adds two days.',
      estimate_delta_cents: 5000,
      eta_days: 2,
      deliverable_changes: ['Excel import'],
    });
    expect(est.steering.status).toBe('awaiting_approval');
    const nv = est.new_contract_version as Record<string, any>;
    expect(nv.version).toBe(2);
    expect(nv.price_cents).toBe(BID_PRICE + 5000);
    expect(typeof nv.signed_by_provider_at).toBe('string');
    expect(nv.signed_by_customer_at).toBeNull();

    const listed = await ok(request, s.agent, 'steering_list', { contract_id: s.contractId });
    const li = (listed.steering as Array<Record<string, any>>).find((x) => x.id === sid);
    expect(li?.new_contract_version_id).toBe(nv.id);
    expect(li?.estimate_delta_cents).toBe(5000);

    const approve = await request.post(`/api/contracts/${s.contractId}/steering/${sid}/approve`, {
      headers: auth(s.customer),
      data: {},
    });
    expect(approve.status()).toBe(200);
    const ab = await approve.json();
    expect(ab.steering.status).toBe('approved');
    expect(typeof ab.checkout_url).toBe('string');
    expect(ab.checkout_url).toMatch(/^https?:\/\//);

    const now = await getContract(request, s.customer, s.contractId);
    expect(now.current_version.id).toBe(nv.id);
    expect(now.current_version.version).toBe(2);
    expect(now.current_version.price_cents).toBe(BID_PRICE + 5000);
    expect(ab.steering.topup_amount_cents).toBe(now.current_version.customer_total_cents - oldTotal);
    expect(ab.steering.topup_amount_cents).toBeGreaterThan(0);
    expect(now.work_paused).toBe(true);
    const states = Object.fromEntries((now.versions as Array<{ id: string; state: string }>).map((v) => [v.id, v.state]));
    expect(states[nv.id]).toBe('current');
    expect(states[oldVersionId]).toBe('superseded');
  });

  test('scope change: estimate → customer rejects; work resumes, version unchanged', async ({ request }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request);

    const sc = await postSteering(request, s.customer, s.contractId, {
      message: 'Add a web UI for uploads',
      requested_kind: 'scope_change',
    });
    expect(sc.steering.status).toBe('awaiting_estimate');
    const est = await ok(request, s.agent, 'steering_respond', {
      steering_id: sc.steering.id,
      response: 'A UI is a lot more work.',
      estimate_delta_cents: 20000,
      eta_days: 5,
    });
    expect(est.steering.status).toBe('awaiting_approval');

    const provReject = await request.post(
      `/api/contracts/${s.contractId}/steering/${sc.steering.id}/reject`,
      { headers: auth(s.provider), data: {} },
    );
    expect(provReject.status()).toBe(403);

    const reject = await request.post(`/api/contracts/${s.contractId}/steering/${sc.steering.id}/reject`, {
      headers: auth(s.customer),
      data: {},
    });
    expect(reject.status()).toBe(200);
    expect((await reject.json()).steering.status).toBe('rejected');

    const now = await getContract(request, s.customer, s.contractId);
    expect(now.work_paused).toBe(false);
    expect(now.current_version.id).toBe(s.version.id);
    expect(now.current_version.version).toBe(1);
    expect(now.current_version.price_cents).toBe(BID_PRICE);
  });

  test('scope change: provider declines → declined, work resumes', async ({ request }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request);
    const sc = await postSteering(request, s.customer, s.contractId, {
      message: 'Add JSON export as well',
      spec_changes: ['JSON export'],
    });
    expect(sc.steering.kind).toBe('scope_change');
    expect((await getContract(request, s.customer, s.contractId)).work_paused).toBe(true);

    const dec = await ok(request, s.agent, 'steering_respond', {
      steering_id: sc.steering.id,
      response: 'Out of scope, sorry.',
      decline: true,
    });
    expect(dec.steering.status).toBe('declined');
    const now = await getContract(request, s.customer, s.contractId);
    expect(now.work_paused).toBe(false);
    expect(now.current_version.id).toBe(s.version.id);
  });

  test('customer-proposed price → awaiting_provider; contract_accept_version makes it current', async ({
    request,
  }) => {
    test.setTimeout(120_000);
    const s = await setupContract(request);
    const proposed = BID_PRICE + 6000;

    const sc = await postSteering(request, s.customer, s.contractId, {
      message: 'Add XML too; I will pay a bit more',
      requested_kind: 'clarification',
      price_cents: proposed,
    });
    expect(sc.steering.kind).toBe('scope_change');
    expect(sc.steering.status).toBe('awaiting_provider');
    const versionId = sc.steering.new_contract_version_id as string;
    expect(versionId).toMatch(UUID_RE);

    const before = await ok(request, s.agent, 'contract_get', { contract_id: s.contractId });
    const pv = (before.versions as Array<Record<string, any>>).find((v) => v.id === versionId);
    expect(pv?.state).toBe('proposed');
    expect(pv?.price_cents).toBe(proposed);
    expect(before.current_version.id).toBe(s.version.id);

    await fails(
      request,
      s.agent,
      'contract_accept_version',
      { contract_id: s.contractId, version_id: s.version.id },
      'invalid_state',
    );

    const acc = await ok(request, s.agent, 'contract_accept_version', {
      contract_id: s.contractId,
      version_id: versionId,
    });
    expect(acc.version.id).toBe(versionId);
    expect(acc.contract.id).toBe(s.contractId);

    const after = await ok(request, s.agent, 'contract_get', { contract_id: s.contractId });
    expect(after.current_version.id).toBe(versionId);
    expect(after.current_version.price_cents).toBe(proposed);
    expect(after.current_version.version).toBe(2);

    const list = await ok(request, s.agent, 'steering_list', { contract_id: s.contractId });
    expect((list.steering as Array<Record<string, any>>).find((x) => x.id === sc.steering.id)?.status).toBe(
      'approved',
    );

    await fails(
      request,
      s.agent,
      'contract_accept_version',
      { contract_id: s.contractId, version_id: versionId },
      'invalid_state',
    );
  });
});
