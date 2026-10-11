import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import Stripe from 'stripe';

// Behaviour-only contract tests for the gigs marketplace API (jobs, specs,
// bids, offers, contracts, Stripe Connect and the billing webhook). Runs
// against a throwaway DB and a fake Stripe; auth uses the e2e header bypass.

test.skip(
  !process.env.JOBS_E2E_AUTH_SECRET || !process.env.STRIPE_WEBHOOK_SECRET,
  'gigs e2e env not set',
);

const E2E_SECRET = process.env.JOBS_E2E_AUTH_SECRET ?? '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const stripe = new Stripe('sk_test_x');

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

function uid(role: string): string {
  return `e2e_${role}_${Date.now()}_${rand()}`;
}

function auth(userId: string): Record<string, string> {
  return { 'x-e2e-user': userId, 'x-e2e-secret': E2E_SECRET };
}

function uniqueWord(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${rand()}`;
}

interface WebhookEvent {
  id: string;
  object: 'event';
  type: string;
  api_version: string;
  created: number;
  livemode: boolean;
  data: { object: Record<string, unknown> };
}

function makeEvent(type: string, object: Record<string, unknown>): WebhookEvent {
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

async function postSignedWebhook(
  request: APIRequestContext,
  payload: string,
): Promise<APIResponse> {
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
  return request.post('/api/billing/webhook', {
    data: payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
  });
}

async function enableConnect(
  request: APIRequestContext,
  userId: string,
): Promise<string> {
  const onboard = await request.post('/api/connect/onboard', {
    headers: auth(userId),
    data: { country: 'DE' },
  });
  expect(onboard.status()).toBe(200);
  const { account_id } = (await onboard.json()) as { account_id: string };
  const payload = JSON.stringify(
    makeEvent('account.updated', {
      id: account_id,
      object: 'account',
      country: 'DE',
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
      requirements: { disabled_reason: null, currently_due: [] },
    }),
  );
  const hook = await postSignedWebhook(request, payload);
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
): Promise<Record<string, unknown> & { id: string }> {
  const res = await request.post('/api/jobs', {
    headers: auth(userId),
    data: {
      title: `E2E job ${rand()}`,
      description: 'A job created by the gigs e2e suite for contract testing.',
      category: 'development',
      budget_min_cents: 20000,
      budget_max_cents: 40000,
      deadline: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      ...overrides,
    },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { job: Record<string, unknown> & { id: string } };
  return body.job;
}

const DUMMY_ID = '00000000-0000-4000-8000-000000000000';

// ---------------------------------------------------------------------------

test.describe('gigs API: unauthenticated', () => {
  const endpoints: Array<{ method: 'get' | 'post' | 'patch' | 'delete'; path: string }> = [
    { method: 'post', path: '/api/jobs' },
    { method: 'get', path: '/api/jobs' },
    { method: 'get', path: `/api/jobs/${DUMMY_ID}` },
    { method: 'patch', path: `/api/jobs/${DUMMY_ID}` },
    { method: 'delete', path: `/api/jobs/${DUMMY_ID}` },
    { method: 'post', path: `/api/jobs/${DUMMY_ID}/spec/draft` },
    { method: 'post', path: `/api/jobs/${DUMMY_ID}/spec/approve` },
    { method: 'post', path: `/api/jobs/${DUMMY_ID}/bids` },
    { method: 'get', path: `/api/jobs/${DUMMY_ID}/bids` },
    { method: 'post', path: `/api/bids/${DUMMY_ID}/accept` },
    { method: 'post', path: '/api/offers' },
    { method: 'get', path: '/api/offers' },
    { method: 'post', path: '/api/connect/onboard' },
    { method: 'get', path: '/api/connect/status' },
  ];

  for (const { method, path } of endpoints) {
    test(`${method.toUpperCase()} ${path} without auth → 401 unauthorized`, async ({ request }) => {
      const opts = method === 'get' || method === 'delete' ? {} : { data: {} };
      const res = await request[method](path, { ...opts, maxRedirects: 0 });
      expect(res.status()).toBe(401);
      expect(await res.json()).toMatchObject({ error: 'unauthorized' });
    });
  }

  test('wrong e2e secret → 401 unauthorized', async ({ request }) => {
    const res = await request.get('/api/jobs', {
      headers: { 'x-e2e-user': uid('nobody'), 'x-e2e-secret': `${E2E_SECRET}_wrong` },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'unauthorized' });
  });
});

// ---------------------------------------------------------------------------

test.describe('gigs API: billing webhook signature', () => {
  test('webhook without stripe-signature → 400', async ({ request }) => {
    const payload = JSON.stringify(makeEvent('account.updated', { id: 'acct_x', object: 'account' }));
    const res = await request.post('/api/billing/webhook', {
      data: payload,
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });

  test('webhook with a bad stripe-signature → 400', async ({ request }) => {
    const payload = JSON.stringify(makeEvent('account.updated', { id: 'acct_x', object: 'account' }));
    const res = await request.post('/api/billing/webhook', {
      data: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=deadbeef`,
      },
    });
    expect(res.status()).toBe(400);
  });

  test('webhook signed with the wrong secret → 400', async ({ request }) => {
    const payload = JSON.stringify(makeEvent('account.updated', { id: 'acct_x', object: 'account' }));
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: `${WEBHOOK_SECRET}_wrong`,
    });
    const res = await request.post('/api/billing/webhook', {
      data: payload,
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    });
    expect(res.status()).toBe(400);
  });

  test('webhook body tampered after signing → 400', async ({ request }) => {
    const payload = JSON.stringify(makeEvent('account.updated', { id: 'acct_x', object: 'account' }));
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const res = await request.post('/api/billing/webhook', {
      data: payload.replace('acct_x', 'acct_y'),
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    });
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------

test.describe('gigs API: validation', () => {
  const user = uid('validator');

  const badJobs: Array<{ name: string; body: Record<string, unknown> }> = [
    { name: 'title missing', body: { description: 'A perfectly valid description.' } },
    { name: 'title too short', body: { title: 'ab', description: 'A perfectly valid description.' } },
    { name: 'description too short', body: { title: 'Valid title', description: 'short' } },
    {
      name: 'budget min > max',
      body: {
        title: 'Valid title',
        description: 'A perfectly valid description.',
        budget_min_cents: 50000,
        budget_max_cents: 10000,
      },
    },
    {
      name: 'negative budget',
      body: { title: 'Valid title', description: 'A perfectly valid description.', budget_min_cents: -1 },
    },
    {
      name: 'non-integer budget',
      body: { title: 'Valid title', description: 'A perfectly valid description.', budget_min_cents: 10.5 },
    },
    {
      name: 'deadline not a datetime',
      body: { title: 'Valid title', description: 'A perfectly valid description.', deadline: 'tomorrow' },
    },
  ];

  for (const { name, body } of badJobs) {
    test(`POST /api/jobs (${name}) → 400 invalid_request`, async ({ request }) => {
      const res = await request.post('/api/jobs', { headers: auth(user), data: body });
      expect(res.status()).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_request' });
    });
  }

  test('POST /api/jobs minimal valid body → 201 draft job with defaults', async ({ request }) => {
    const res = await request.post('/api/jobs', {
      headers: auth(user),
      data: { title: 'Minimal job', description: 'Just the required fields here.' },
    });
    expect(res.status()).toBe(201);
    const { job } = await res.json();
    expect(job).toMatchObject({
      user_id: user,
      title: 'Minimal job',
      description: 'Just the required fields here.',
      currency: 'eur',
      status: 'draft',
      current_spec_version_id: null,
    });
    expect(typeof job.id).toBe('string');
    expect(typeof job.created_at).toBe('string');
    expect(typeof job.updated_at).toBe('string');
  });

  test('GET /api/jobs/:id with an invalid id → 404 not_found', async ({ request }) => {
    const res = await request.get('/api/jobs/not-a-real-id', { headers: auth(user) });
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });

  test('GET /api/jobs/:id with an unknown uuid → 404 not_found', async ({ request }) => {
    const res = await request.get(`/api/jobs/${DUMMY_ID}`, { headers: auth(user) });
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });

  test('GET /api/jobs default paging → limit 20, offset 0', async ({ request }) => {
    const res = await request.get('/api/jobs', { headers: auth(user) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
    expect(body.jobs.length).toBeLessThanOrEqual(20);
  });

  test('GET /api/jobs limit above max is capped at 50 or rejected', async ({ request }) => {
    const res = await request.get('/api/jobs?limit=500', { headers: auth(user) });
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.limit).toBeLessThanOrEqual(50);
      expect(body.jobs.length).toBeLessThanOrEqual(50);
    } else {
      expect(res.status()).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_request' });
    }
  });
});

// ---------------------------------------------------------------------------

test.describe.serial('gigs API: draft job visibility and owner-only actions', () => {
  const owner = uid('owner');
  const stranger = uid('stranger');
  const word = uniqueWord('draftvis');
  let jobId = '';

  test('owner creates a draft job', async ({ request }) => {
    const job = await createJob(request, owner, { title: `Draft ${word} job` });
    expect(job.status).toBe('draft');
    expect(job.user_id).toBe(owner);
    jobId = job.id;
  });

  test('owner can GET own draft job with spec null', async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}`, { headers: auth(owner) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.job.id).toBe(jobId);
    expect(body.job.status).toBe('draft');
    expect(body.spec).toBeNull();
  });

  test("another user's GET of a draft job → 404 not_found", async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}`, { headers: auth(stranger) });
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });

  test("draft job is not in another user's public listing", async ({ request }) => {
    for (const qs of [`q=${word}`, `q=${word}&status=draft`]) {
      const res = await request.get(`/api/jobs?${qs}`, { headers: auth(stranger) });
      expect(res.status()).toBe(200);
      const { jobs } = (await res.json()) as { jobs: Array<{ id: string }> };
      expect(jobs.map((j) => j.id)).not.toContain(jobId);
    }
  });

  test("draft job is not in the owner's public listing either (non-draft only)", async ({ request }) => {
    const res = await request.get(`/api/jobs?q=${word}`, { headers: auth(owner) });
    expect(res.status()).toBe(200);
    const { jobs } = (await res.json()) as { jobs: Array<{ id: string }> };
    expect(jobs.map((j) => j.id)).not.toContain(jobId);
  });

  test('owner sees the draft with mine=true; stranger does not', async ({ request }) => {
    const mine = await request.get('/api/jobs?mine=true&limit=50', { headers: auth(owner) });
    expect(mine.status()).toBe(200);
    const mineBody = (await mine.json()) as {
      jobs: Array<{ id: string; user_id: string; status: string; bid_count: number }>;
    };
    const found = mineBody.jobs.find((j) => j.id === jobId);
    expect(found).toBeDefined();
    expect(found?.status).toBe('draft');
    expect(typeof found?.bid_count).toBe('number');
    for (const j of mineBody.jobs) expect(j.user_id).toBe(owner);

    const theirs = await request.get('/api/jobs?mine=true&limit=50', { headers: auth(stranger) });
    expect(theirs.status()).toBe(200);
    const { jobs } = (await theirs.json()) as { jobs: Array<{ id: string }> };
    expect(jobs.map((j) => j.id)).not.toContain(jobId);
  });

  test('PATCH by non-owner → 404', async ({ request }) => {
    const res = await request.patch(`/api/jobs/${jobId}`, {
      headers: auth(stranger),
      data: { title: 'Hijacked title' },
    });
    expect(res.status()).toBe(404);
  });

  test('PATCH by owner with invalid body → 400 invalid_request', async ({ request }) => {
    const res = await request.patch(`/api/jobs/${jobId}`, {
      headers: auth(owner),
      data: { budget_min_cents: 90000, budget_max_cents: 1000 },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_request' });
  });

  test('PATCH by owner while draft → 200 with updated fields', async ({ request }) => {
    const res = await request.patch(`/api/jobs/${jobId}`, {
      headers: auth(owner),
      data: { title: `Draft ${word} job renamed`, budget_max_cents: 45000 },
    });
    expect(res.status()).toBe(200);
    const { job } = await res.json();
    expect(job.id).toBe(jobId);
    expect(job.title).toBe(`Draft ${word} job renamed`);
    expect(job.budget_max_cents).toBe(45000);
    expect(job.status).toBe('draft');
  });

  test('spec draft by non-owner → 404', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(stranger),
      data: { spec: validSpec() },
    });
    expect(res.status()).toBe(404);
  });

  test('AI spec draft with no balance → 402 insufficient_balance', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(owner),
      data: {},
    });
    expect(res.status()).toBe(402);
    expect(await res.json()).toMatchObject({ error: 'insufficient_balance' });
  });

  test('AI spec draft with instructions and no balance → 402 insufficient_balance', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(owner),
      data: { instructions: 'Keep it short' },
    });
    expect(res.status()).toBe(402);
    expect(await res.json()).toMatchObject({ error: 'insufficient_balance' });
  });

  test('manual spec draft with empty acceptance_criteria → 400 invalid_request', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(owner),
      data: { spec: { ...validSpec(), acceptance_criteria: [] } },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_request' });
  });

  test('manual spec draft with empty requirements → 400 invalid_request', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(owner),
      data: { spec: { ...validSpec(), requirements: [] } },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_request' });
  });

  test('manual spec draft with bad data_sensitivity → 400 invalid_request', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(owner),
      data: {
        spec: {
          ...validSpec(),
          security: { data_sensitivity: 'top-secret', secrets_allowed: false, notes: '' },
        },
      },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_request' });
  });

  test('approve with no draft spec → 409 no_draft_spec', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/approve`, {
      headers: auth(owner),
      data: {},
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'no_draft_spec' });
  });

  test('approve by non-owner → 404', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/approve`, {
      headers: auth(stranger),
      data: {},
    });
    expect(res.status()).toBe(404);
  });

  test('DELETE by non-owner → 404 and job unchanged', async ({ request }) => {
    const res = await request.delete(`/api/jobs/${jobId}`, { headers: auth(stranger) });
    expect(res.status()).toBe(404);
    const check = await request.get(`/api/jobs/${jobId}`, { headers: auth(owner) });
    expect((await check.json()).job.status).toBe('draft');
  });

  test('DELETE by owner → 200 cancelled', async ({ request }) => {
    const res = await request.delete(`/api/jobs/${jobId}`, { headers: auth(owner) });
    expect(res.status()).toBe(200);
    const { job } = await res.json();
    expect(job.id).toBe(jobId);
    expect(job.status).toBe('cancelled');
  });

  test('PATCH a cancelled job → 409 invalid_state', async ({ request }) => {
    const res = await request.patch(`/api/jobs/${jobId}`, {
      headers: auth(owner),
      data: { title: 'Too late now' },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'invalid_state' });
  });

  test('spec draft on a cancelled job → 409 invalid_state', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(owner),
      data: { spec: validSpec() },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'invalid_state' });
  });
});

// ---------------------------------------------------------------------------

test.describe.serial('gigs API: offers', () => {
  const seller = uid('seller');
  const other = uid('buyer');
  const word = uniqueWord('offer');
  let offerId = '';

  test('POST /api/offers with bad body → 400 invalid_request', async ({ request }) => {
    const bodies: Array<Record<string, unknown>> = [
      { description: 'No title on this offer at all.', price_cents: 1000, delivery_days: 2 },
      { title: 'Valid offer', description: 'Valid description text.', price_cents: 0, delivery_days: 2 },
      { title: 'Valid offer', description: 'Valid description text.', price_cents: 1000, delivery_days: 0 },
      { title: 'Valid offer', description: 'short', price_cents: 1000, delivery_days: 2 },
      { title: 'Valid offer', description: 'Valid description text.', price_cents: 12.5, delivery_days: 2 },
    ];
    for (const data of bodies) {
      const res = await request.post('/api/offers', { headers: auth(seller), data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_request' });
    }
  });

  test('POST /api/offers → 201 active offer', async ({ request }) => {
    const res = await request.post('/api/offers', {
      headers: auth(seller),
      data: {
        title: `Logo design ${word}`,
        description: 'I will design a clean vector logo for your brand.',
        price_cents: 15000,
        delivery_days: 3,
        tags: ['design', 'logo'],
        category: 'design',
      },
    });
    expect(res.status()).toBe(201);
    const { offer } = await res.json();
    expect(offer).toMatchObject({
      user_id: seller,
      title: `Logo design ${word}`,
      price_cents: 15000,
      currency: 'eur',
      delivery_days: 3,
      tags: ['design', 'logo'],
      status: 'active',
    });
    expect(typeof offer.id).toBe('string');
    offerId = offer.id;
  });

  test('GET /api/offers?mine=true lists only own offers, including the new one', async ({ request }) => {
    const res = await request.get('/api/offers?mine=true', { headers: auth(seller) });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      offers: Array<{ id: string; user_id: string }>;
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.offers.map((o) => o.id)).toContain(offerId);
    for (const o of body.offers) expect(o.user_id).toBe(seller);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(typeof body.limit).toBe('number');
    expect(body.offset).toBe(0);
  });

  test("GET /api/offers?mine=true for another user doesn't include it", async ({ request }) => {
    const res = await request.get('/api/offers?mine=true', { headers: auth(other) });
    expect(res.status()).toBe(200);
    const { offers } = (await res.json()) as { offers: Array<{ id: string }> };
    expect(offers.map((o) => o.id)).not.toContain(offerId);
  });

  test('GET /api/offers search and price filters', async ({ request }) => {
    const hit = await request.get(`/api/offers?q=${word.toUpperCase()}`, { headers: auth(other) });
    expect(hit.status()).toBe(200);
    expect(((await hit.json()).offers as Array<{ id: string }>).map((o) => o.id)).toContain(offerId);

    const tooCheap = await request.get(`/api/offers?q=${word}&max_price_cents=10000`, {
      headers: auth(other),
    });
    expect(tooCheap.status()).toBe(200);
    expect(((await tooCheap.json()).offers as Array<{ id: string }>).map((o) => o.id)).not.toContain(
      offerId,
    );

    const tooDear = await request.get(`/api/offers?q=${word}&min_price_cents=20000`, {
      headers: auth(other),
    });
    expect(tooDear.status()).toBe(200);
    expect(((await tooDear.json()).offers as Array<{ id: string }>).map((o) => o.id)).not.toContain(
      offerId,
    );

    const otherCategory = await request.get(`/api/offers?q=${word}&category=writing`, {
      headers: auth(other),
    });
    expect(otherCategory.status()).toBe(200);
    expect(
      ((await otherCategory.json()).offers as Array<{ id: string }>).map((o) => o.id),
    ).not.toContain(offerId);
  });
});

// ---------------------------------------------------------------------------

test.describe.serial('gigs API: full job → bid → contract → payment flow', () => {
  const customer = uid('customer');
  const provider = uid('provider');
  const word = uniqueWord('gigflow');
  let jobId = '';
  let spec1Id = '';
  let spec2Id = '';
  let providerAccountId = '';
  let bidId = '';
  let contractId = '';
  let customerTotal = 0;
  let checkoutPayload = '';

  test('customer creates a draft job', async ({ request }) => {
    const job = await createJob(request, customer, {
      title: `Build a CSV importer ${word}`,
      budget_min_cents: 20000,
      budget_max_cents: 40000,
    });
    expect(job).toMatchObject({
      user_id: customer,
      title: `Build a CSV importer ${word}`,
      category: 'development',
      budget_min_cents: 20000,
      budget_max_cents: 40000,
      currency: 'eur',
      status: 'draft',
      current_spec_version_id: null,
    });
    expect(typeof job.deadline).toBe('string');
    jobId = job.id;
  });

  test('customer saves a manual spec draft → version 1, source manual', async ({ request }) => {
    const spec = validSpec();
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(customer),
      data: { spec },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.spec).toMatchObject({
      job_id: jobId,
      version: 1,
      status: 'draft',
      source: 'manual',
      requirements: spec.requirements,
      deliverables: spec.deliverables,
      acceptance_criteria: spec.acceptance_criteria,
      constraints: spec.constraints,
      permitted_tools: spec.permitted_tools,
      budget_min_cents: 20000,
      budget_max_cents: 40000,
      security: spec.security,
    });
    spec1Id = body.spec.id;
  });

  test('a second manual draft → version 2', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(customer),
      data: {
        spec: { ...validSpec(), acceptance_criteria: ['Imports 10k rows in under 5 seconds'] },
      },
    });
    expect(res.status()).toBe(201);
    const { spec } = await res.json();
    expect(spec.version).toBe(2);
    expect(spec.status).toBe('draft');
    expect(spec.source).toBe('manual');
    expect(spec.id).not.toBe(spec1Id);
    spec2Id = spec.id;
  });

  test('provider without Connect on a draft job → 403 connect_required (checked first)', async ({
    request,
  }) => {
    const res = await request.post(`/api/jobs/${jobId}/bids`, {
      headers: auth(provider),
      data: { price_cents: 30000, eta_days: 7 },
    });
    // Provider has no Connect yet, so the connect check fires first.
    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'connect_required' });
  });

  test('approve (default latest draft) → job open with current spec = v2', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/approve`, {
      headers: auth(customer),
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.job.id).toBe(jobId);
    expect(body.job.status).toBe('open');
    expect(body.job.current_spec_version_id).toBe(spec2Id);
    expect(body.spec.id).toBe(spec2Id);
    expect(body.spec.status).toBe('approved');
    expect(typeof body.spec.approved_at).toBe('string');
  });

  test('GET job shows open with the approved spec', async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}`, { headers: auth(customer) });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.job.status).toBe('open');
    expect(body.spec.id).toBe(spec2Id);
    expect(body.spec.status).toBe('approved');
  });

  test('open job is visible to another user by id', async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}`, { headers: auth(provider) });
    expect(res.status()).toBe(200);
    expect((await res.json()).job.id).toBe(jobId);
  });

  test('PATCH an open job → 409 invalid_state', async ({ request }) => {
    const res = await request.patch(`/api/jobs/${jobId}`, {
      headers: auth(customer),
      data: { title: 'Changing after open' },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'invalid_state' });
  });

  test('spec draft on an open job → 409 invalid_state', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/spec/draft`, {
      headers: auth(customer),
      data: { spec: validSpec() },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'invalid_state' });
  });

  test('open job is listed in GET /api/jobs by q (case-insensitive) with bid_count 0', async ({
    request,
  }) => {
    const res = await request.get(`/api/jobs?q=${word.toUpperCase()}`, { headers: auth(provider) });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      jobs: Array<{ id: string; status: string; bid_count: number }>;
      total: number;
    };
    const found = body.jobs.find((j) => j.id === jobId);
    expect(found).toBeDefined();
    expect(found?.status).toBe('open');
    expect(found?.bid_count).toBe(0);
    expect(body.total).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/jobs filters: price overlap, category, deadline', async ({ request }) => {
    const ids = async (qs: string): Promise<string[]> => {
      const res = await request.get(`/api/jobs?q=${word}&${qs}`, { headers: auth(provider) });
      expect(res.status(), qs).toBe(200);
      return ((await res.json()).jobs as Array<{ id: string }>).map((j) => j.id);
    };
    // Budget is 20000..40000.
    expect(await ids('min_price_cents=30000')).toContain(jobId);
    expect(await ids('max_price_cents=25000')).toContain(jobId);
    expect(await ids('min_price_cents=10000&max_price_cents=20000')).toContain(jobId);
    expect(await ids('min_price_cents=50000')).not.toContain(jobId);
    expect(await ids('max_price_cents=10000')).not.toContain(jobId);
    expect(await ids('category=development')).toContain(jobId);
    expect(await ids('category=design')).not.toContain(jobId);
    const far = new Date(Date.now() + 365 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(await ids(`deadline_before=${encodeURIComponent(far)}`)).toContain(jobId);
    expect(await ids(`deadline_before=${encodeURIComponent(past)}`)).not.toContain(jobId);
    expect(await ids(`deadline_after=${encodeURIComponent(past)}`)).toContain(jobId);
    expect(await ids(`deadline_after=${encodeURIComponent(far)}`)).not.toContain(jobId);
    expect(await ids('status=draft')).not.toContain(jobId);
  });

  test('provider without Connect → 403 connect_required', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/bids`, {
      headers: auth(provider),
      data: { price_cents: 30000, eta_days: 7 },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'connect_required' });
  });

  test('fresh provider connect status → not connected', async ({ request }) => {
    const res = await request.get('/api/connect/status', { headers: auth(provider) });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      connected: false,
      account_id: null,
      connect_status: 'none',
      payouts_enabled: false,
      charges_enabled: false,
      details_submitted: false,
    });
  });

  test('onboard with unsupported country US → 400 unsupported_country', async ({ request }) => {
    const res = await request.post('/api/connect/onboard', {
      headers: auth(provider),
      data: { country: 'US' },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'unsupported_country' });
  });

  test('onboard DE → 200 onboarding url and acct_ id', async ({ request }) => {
    const res = await request.post('/api/connect/onboard', {
      headers: auth(provider),
      data: { country: 'DE' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe('onboarding');
    expect(body.url).toMatch(/^https:\/\//);
    expect(body.account_id).toMatch(/^acct_/);
    providerAccountId = body.account_id;
  });

  test('onboard again → same account_id', async ({ request }) => {
    const res = await request.post('/api/connect/onboard', {
      headers: auth(provider),
      data: { country: 'DE' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).account_id).toBe(providerAccountId);
  });

  test('after onboarding, before account.updated: payouts still disabled and bidding blocked', async ({
    request,
  }) => {
    const status = await request.get('/api/connect/status', { headers: auth(provider) });
    expect(status.status()).toBe(200);
    const body = await status.json();
    expect(body.account_id).toBe(providerAccountId);
    expect(body.payouts_enabled).toBe(false);
    expect(body.connect_status).not.toBe('enabled');

    const bid = await request.post(`/api/jobs/${jobId}/bids`, {
      headers: auth(provider),
      data: { price_cents: 30000, eta_days: 7 },
    });
    expect(bid.status()).toBe(403);
    expect(await bid.json()).toMatchObject({ error: 'connect_required' });
  });

  test('signed account.updated → 200 and status shows enabled', async ({ request }) => {
    const payload = JSON.stringify(
      makeEvent('account.updated', {
        id: providerAccountId,
        object: 'account',
        country: 'DE',
        payouts_enabled: true,
        charges_enabled: true,
        details_submitted: true,
        requirements: { disabled_reason: null, currently_due: [] },
      }),
    );
    const hook = await postSignedWebhook(request, payload);
    expect(hook.status()).toBe(200);

    const res = await request.get('/api/connect/status', { headers: auth(provider) });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      connected: true,
      account_id: providerAccountId,
      connect_status: 'enabled',
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
      country: 'DE',
    });
  });

  test('provider bid with bad body → 400 invalid_request', async ({ request }) => {
    const bodies: Array<Record<string, unknown>> = [
      { price_cents: 12.5, eta_days: 7 },
      { price_cents: 30000, eta_days: 0 },
      { price_cents: 30000 },
      { eta_days: 7 },
      { price_cents: '30000', eta_days: 7 },
      { price_cents: 30000, eta_days: 7, included_steering_credits: -1 },
    ];
    for (const data of bodies) {
      const res = await request.post(`/api/jobs/${jobId}/bids`, { headers: auth(provider), data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'invalid_request' });
    }
  });

  test('provider bid price out of bounds → 422 price_out_of_bounds', async ({ request }) => {
    for (const price_cents of [100, 10_000_000]) {
      const res = await request.post(`/api/jobs/${jobId}/bids`, {
        headers: auth(provider),
        data: { price_cents, eta_days: 7 },
      });
      expect(res.status(), String(price_cents)).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'price_out_of_bounds' });
    }
  });

  test('provider bid on a draft job → 409 job_not_open', async ({ request }) => {
    const draft = await createJob(request, customer, { title: `Unapproved ${word}` });
    const res = await request.post(`/api/jobs/${draft.id}/bids`, {
      headers: auth(provider),
      data: { price_cents: 30000, eta_days: 7 },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'job_not_open' });
  });

  test('provider bids 30000 → 201 with 15% commission on top', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/bids`, {
      headers: auth(provider),
      data: {
        price_cents: 30000,
        eta_days: 7,
        plan: 'Parse with a streaming CSV parser, validate with a schema, add tests.',
        deliverables: ['PR with importer', 'Test suite'],
        included_steering_credits: 2,
        assumptions: ['Sample files are representative'],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.bid).toMatchObject({
      job_id: jobId,
      user_id: provider,
      price_cents: 30000,
      currency: 'eur',
      eta_days: 7,
      status: 'active',
    });
    expect(typeof body.bid.id).toBe('string');
    expect(body.pricing).toEqual({
      bid_cents: 30000,
      fee_cents: 4500,
      customer_total_cents: 34500,
      provider_net_cents: 30000,
      commission_bps: 1500,
    });
    bidId = body.bid.id;
  });

  test('second active bid by the same provider → 409 bid_exists', async ({ request }) => {
    const res = await request.post(`/api/jobs/${jobId}/bids`, {
      headers: auth(provider),
      data: { price_cents: 28000, eta_days: 5 },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'bid_exists' });
  });

  test('customer without Connect bidding own job → 403 connect_required (checked first)', async ({
    request,
  }) => {
    const res = await request.post(`/api/jobs/${jobId}/bids`, {
      headers: auth(customer),
      data: { price_cents: 30000, eta_days: 7 },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'connect_required' });
  });

  test('Connect-enabled customer bidding own job → 403 own_job', async ({ request }) => {
    await enableConnect(request, customer);
    const res = await request.post(`/api/jobs/${jobId}/bids`, {
      headers: auth(customer),
      data: { price_cents: 30000, eta_days: 7 },
    });
    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'own_job' });
  });

  test('owner GET bids → bid with pricing and provider profile', async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}/bids`, { headers: auth(customer) });
    expect(res.status()).toBe(200);
    const { bids } = (await res.json()) as {
      bids: Array<{
        id: string;
        user_id: string;
        price_cents: number;
        status: string;
        pricing: Record<string, number>;
        provider: { headline: string | null; skills: string[] };
      }>;
    };
    expect(bids).toHaveLength(1);
    const bid = bids[0];
    expect(bid.id).toBe(bidId);
    expect(bid.user_id).toBe(provider);
    expect(bid.price_cents).toBe(30000);
    expect(bid.status).toBe('active');
    expect(bid.pricing).toEqual({
      bid_cents: 30000,
      fee_cents: 4500,
      customer_total_cents: 34500,
      provider_net_cents: 30000,
      commission_bps: 1500,
    });
    expect(bid.provider.headline === null || typeof bid.provider.headline === 'string').toBe(true);
    expect(Array.isArray(bid.provider.skills)).toBe(true);
  });

  test('provider GET bids → 403 forbidden', async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}/bids`, { headers: auth(provider) });
    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'forbidden' });
  });

  test('a third user GET bids → 403 forbidden', async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}/bids`, { headers: auth(uid('lurker')) });
    expect(res.status()).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'forbidden' });
  });

  test('listing shows bid_count 1', async ({ request }) => {
    const res = await request.get(`/api/jobs?q=${word}`, { headers: auth(provider) });
    expect(res.status()).toBe(200);
    const found = ((await res.json()).jobs as Array<{ id: string; bid_count: number }>).find(
      (j) => j.id === jobId,
    );
    expect(found?.bid_count).toBe(1);
  });

  test('provider accepting a bid on a job they do not own → 404 not_found', async ({ request }) => {
    const res = await request.post(`/api/bids/${bidId}/accept`, {
      headers: auth(provider),
      data: {},
    });
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'not_found' });
  });

  test('customer accepts the bid → 201 contract, version, https checkout_url', async ({ request }) => {
    const res = await request.post(`/api/bids/${bidId}/accept`, {
      headers: auth(customer),
      data: {},
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.contract).toMatchObject({
      job_id: jobId,
      bid_id: bidId,
      status: 'pending_payment',
      customer_user_id: customer,
      provider_user_id: provider,
    });
    expect(typeof body.contract.id).toBe('string');
    expect(body.version).toMatchObject({
      version: 1,
      price_cents: 30000,
      commission_bps: 1500,
      fee_cents: 4500,
      customer_total_cents: 34500,
    });
    expect(body.checkout_url).toMatch(/^https:\/\//);
    contractId = body.contract.id;
    customerTotal = body.version.customer_total_cents;
  });

  test('job is awarded after accept', async ({ request }) => {
    const res = await request.get(`/api/jobs/${jobId}`, { headers: auth(customer) });
    expect(res.status()).toBe(200);
    expect((await res.json()).job.status).toBe('awarded');
  });

  test('awarded job is no longer in the default (open) listing', async ({ request }) => {
    const res = await request.get(`/api/jobs?q=${word}`, { headers: auth(provider) });
    expect(res.status()).toBe(200);
    expect(((await res.json()).jobs as Array<{ id: string }>).map((j) => j.id)).not.toContain(jobId);
  });

  test('accepting the same bid again → 409', async ({ request }) => {
    const res = await request.post(`/api/bids/${bidId}/accept`, {
      headers: auth(customer),
      data: {},
    });
    expect(res.status()).toBe(409);
    expect(['already_accepted', 'job_not_open']).toContain((await res.json()).error);
  });

  test('bidding on an awarded job → 409 job_not_open', async ({ request }) => {
    const other = uid('provider2');
    await enableConnect(request, other);
    const res = await request.post(`/api/jobs/${jobId}/bids`, {
      headers: auth(other),
      data: { price_cents: 25000, eta_days: 3 },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'job_not_open' });
  });

  test('signed checkout.session.completed → 200 received and job in_progress', async ({
    request,
  }) => {
    const suffix = `${Date.now()}_${rand()}`;
    checkoutPayload = JSON.stringify(
      makeEvent('checkout.session.completed', {
        id: `cs_test_${suffix}`,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        status: 'complete',
        amount_total: customerTotal,
        currency: 'eur',
        payment_intent: `pi_test_${suffix}`,
        metadata: { kind: 'contract', contract_id: contractId },
      }),
    );
    const hook = await postSignedWebhook(request, checkoutPayload);
    expect(hook.status()).toBe(200);
    const body = await hook.json();
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeFalsy();

    const res = await request.get(`/api/jobs/${jobId}`, { headers: auth(customer) });
    expect(res.status()).toBe(200);
    expect((await res.json()).job.status).toBe('in_progress');
  });

  test('replaying the same event → 200 duplicate:true and nothing changes', async ({ request }) => {
    const hook = await postSignedWebhook(request, checkoutPayload);
    expect(hook.status()).toBe(200);
    expect(await hook.json()).toMatchObject({ received: true, duplicate: true });

    const res = await request.get(`/api/jobs/${jobId}`, { headers: auth(customer) });
    expect(res.status()).toBe(200);
    expect((await res.json()).job.status).toBe('in_progress');
  });

  test('DELETE by non-owner of an in-progress job → 404', async ({ request }) => {
    const res = await request.delete(`/api/jobs/${jobId}`, { headers: auth(provider) });
    expect(res.status()).toBe(404);
  });
});
