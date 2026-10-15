import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installMocks, call, resetDb, sql, seedBalance, aiState, VALID_SPEC } from './helpers';

installMocks();

type Routes = {
  jobs: typeof import('../../app/api/jobs/route');
  job: typeof import('../../app/api/jobs/[id]/route');
  draft: typeof import('../../app/api/jobs/[id]/spec/draft/route');
  approve: typeof import('../../app/api/jobs/[id]/spec/approve/route');
  offers: typeof import('../../app/api/offers/route');
};
let r: Routes;

const CUSTOMER = 'user_int_customer';
const STRANGER = 'user_int_stranger';

before(async () => {
  await resetDb();
  r = {
    jobs: await import('../../app/api/jobs/route'),
    job: await import('../../app/api/jobs/[id]/route'),
    draft: await import('../../app/api/jobs/[id]/spec/draft/route'),
    approve: await import('../../app/api/jobs/[id]/spec/approve/route'),
    offers: await import('../../app/api/offers/route'),
  };
});

async function createJob(user: string, body: Record<string, unknown> = {}) {
  return call(r.jobs.POST, {
    method: 'POST',
    url: '/api/jobs',
    user,
    body: {
      title: 'CSV importer for Postgres',
      description: 'Import CSV files into a Postgres table with validation.',
      category: 'data',
      budget_min_cents: 20000,
      budget_max_cents: 40000,
      deadline: '2026-12-01T00:00:00.000Z',
      ...body,
    },
  });
}

test('every route returns 401 without a Clerk user', async () => {
  const id = '00000000-0000-4000-8000-000000000000';
  const results = await Promise.all([
    call(r.jobs.POST, { method: 'POST', url: '/api/jobs', body: {}, user: null }),
    call(r.jobs.GET, { url: '/api/jobs', user: null }),
    call(r.job.GET, { url: `/api/jobs/${id}`, params: { id }, user: null }),
    call(r.draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, body: {}, user: null }),
    call(r.approve.POST, { method: 'POST', url: `/api/jobs/${id}/spec/approve`, params: { id }, body: {}, user: null }),
    call(r.offers.GET, { url: '/api/offers', user: null }),
  ]);
  for (const res of results) {
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'unauthorized');
  }
});

test('create a draft job', async () => {
  const res = await createJob(CUSTOMER);
  assert.equal(res.status, 201);
  const job = res.body.job;
  assert.equal(job.status, 'draft');
  assert.equal(job.user_id, CUSTOMER);
  assert.equal(job.currency, 'eur');
  assert.equal(job.current_spec_version_id, null);
  const [principal] = await sql(`SELECT kind, user_id FROM principals WHERE user_id = $1`, [CUSTOMER]);
  assert.deepEqual(principal, { kind: 'user', user_id: CUSTOMER });
});

test('create rejects bad input with 400 invalid_request', async () => {
  const res = await createJob(CUSTOMER, { title: 'x', budget_min_cents: 5, budget_max_cents: 1 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_request');
  const bad = await call(r.jobs.POST, { method: 'POST', url: '/api/jobs', user: CUSTOMER, body: 'not json' });
  assert.equal(bad.status, 400);
});

test('draft jobs are private to their owner', async () => {
  const { body } = await createJob(CUSTOMER, { title: 'Private draft zebra' });
  const id = body.job.id;
  const mine = await call(r.job.GET, { url: `/api/jobs/${id}`, params: { id }, user: CUSTOMER });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.spec, null);
  const theirs = await call(r.job.GET, { url: `/api/jobs/${id}`, params: { id }, user: STRANGER });
  assert.equal(theirs.status, 404);
  const listed = await call(r.jobs.GET, { url: '/api/jobs?q=zebra&status=draft', user: STRANGER });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.jobs.length, 0);
  const mineListed = await call(r.jobs.GET, { url: '/api/jobs?q=zebra&mine=true', user: CUSTOMER });
  assert.equal(mineListed.body.jobs.length, 1);
  const notUuid = await call(r.job.GET, { url: '/api/jobs/nope', params: { id: 'nope' }, user: CUSTOMER });
  assert.equal(notUuid.status, 404);
});

test('PATCH edits a draft, only for the owner; DELETE cancels', async () => {
  const { body } = await createJob(CUSTOMER);
  const id = body.job.id;
  const stranger = await call(r.job.PATCH, { method: 'PATCH', url: `/api/jobs/${id}`, params: { id }, user: STRANGER, body: { title: 'Hijacked title' } });
  assert.equal(stranger.status, 404);
  const ok = await call(r.job.PATCH, { method: 'PATCH', url: `/api/jobs/${id}`, params: { id }, user: CUSTOMER, body: { title: 'Better title' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.job.title, 'Better title');
  const del = await call(r.job.DELETE, { method: 'DELETE', url: `/api/jobs/${id}`, params: { id }, user: CUSTOMER });
  assert.equal(del.status, 200);
  assert.equal(del.body.job.status, 'cancelled');
  const again = await call(r.job.PATCH, { method: 'PATCH', url: `/api/jobs/${id}`, params: { id }, user: CUSTOMER, body: { title: 'Too late now' } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'invalid_state');
});

test('manual spec draft, then approve opens the job', async () => {
  const { body } = await createJob(CUSTOMER, { title: 'Approvable job walrus' });
  const id = body.job.id;

  const noDraft = await call(r.approve.POST, { method: 'POST', url: `/api/jobs/${id}/spec/approve`, params: { id }, user: CUSTOMER, body: {} });
  assert.equal(noDraft.status, 409);
  assert.equal(noDraft.body.error, 'no_draft_spec');

  const bad = await call(r.draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, user: CUSTOMER, body: { spec: { ...VALID_SPEC, acceptance_criteria: [] } } });
  assert.equal(bad.status, 400);

  const d1 = await call(r.draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, user: CUSTOMER, body: { spec: VALID_SPEC } });
  assert.equal(d1.status, 201);
  assert.equal(d1.body.spec.version, 1);
  assert.equal(d1.body.spec.status, 'draft');
  assert.equal(d1.body.spec.source, 'manual');
  assert.deepEqual(d1.body.spec.acceptance_criteria, VALID_SPEC.acceptance_criteria);

  const d2 = await call(r.draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, user: CUSTOMER, body: { spec: { ...VALID_SPEC, constraints: [] } } });
  assert.equal(d2.body.spec.version, 2);

  const stranger = await call(r.approve.POST, { method: 'POST', url: `/api/jobs/${id}/spec/approve`, params: { id }, user: STRANGER, body: {} });
  assert.equal(stranger.status, 404);

  const ok = await call(r.approve.POST, { method: 'POST', url: `/api/jobs/${id}/spec/approve`, params: { id }, user: CUSTOMER, body: {} });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.job.status, 'open');
  assert.equal(ok.body.job.current_spec_version_id, d2.body.spec.id);
  assert.equal(ok.body.spec.status, 'approved');
  assert.ok(ok.body.spec.approved_at);

  const publicList = await call(r.jobs.GET, { url: '/api/jobs?q=WALRUS', user: STRANGER });
  assert.equal(publicList.body.jobs.length, 1);
  assert.equal(publicList.body.jobs[0].bid_count, 0);
  const publicGet = await call(r.job.GET, { url: `/api/jobs/${id}`, params: { id }, user: STRANGER });
  assert.equal(publicGet.status, 200);
  assert.equal(publicGet.body.spec.id, d2.body.spec.id);

  const editOpen = await call(r.draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, user: CUSTOMER, body: { spec: VALID_SPEC } });
  assert.equal(editOpen.status, 409);
});

test('AI spec draft uses generateObject, is billed from the balance like /api/chat', async () => {
  const { body } = await createJob(CUSTOMER, { title: 'AI drafted job' });
  const id = body.job.id;

  const broke = await call(r.draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, user: CUSTOMER, body: {} });
  assert.equal(broke.status, 402);
  assert.equal(broke.body.error, 'insufficient_balance');
  assert.equal(aiState.calls.length, 0);

  await seedBalance(CUSTOMER, 1);
  aiState.generateObject = async () => ({
    object: { ...VALID_SPEC, deadline: 'not a date', requirements: ['  Build it  '] },
    usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
    response: { headers: {} },
  });
  const res = await call(r.draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, user: CUSTOMER, body: { instructions: 'Keep it small' } });
  assert.equal(res.status, 201);
  assert.equal(res.body.spec.source, 'ai');
  assert.equal(res.body.spec.deadline, null);
  assert.deepEqual(res.body.spec.requirements, ['Build it']);
  assert.equal(aiState.calls.length, 1);
  assert.ok(String(aiState.calls[0].prompt).includes('Keep it small'));

  // openai/gpt-4o-mini: 1M in * $0.15 + 1M out * $0.60 = $0.75, × CREDIT_MARKUP 1.3 = $0.975
  const [budget] = await sql<{ remaining_balance: string }>(`SELECT remaining_balance FROM user_budgets WHERE user_id = $1`, [CUSTOMER]);
  assert.equal(Number(budget.remaining_balance), 0.025);
  const usage = await sql<{ cost_deducted: string; model_name: string; tokens_used: string }>(
    `SELECT cost_deducted, model_name, tokens_used FROM paid_usage_analytics WHERE user_id = $1`, [CUSTOMER]);
  assert.equal(usage.length, 1);
  assert.equal(Number(usage[0].cost_deducted), 0.975);
  assert.equal(Number(usage[0].tokens_used), 2_000_000);

  aiState.generateObject = async () => {
    throw new Error('gateway down');
  };
  const failed = await call(r.draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, user: CUSTOMER, body: {} });
  assert.equal(failed.status, 502);
  assert.equal(failed.body.error, 'ai_error');
});

test('list filters: category, price overlap, deadline, pagination', async () => {
  await resetDb();
  const mk = async (title: string, extra: Record<string, unknown>) => {
    const { body } = await createJob(CUSTOMER, { title, ...extra });
    const id = body.job.id;
    await call(r.draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, user: CUSTOMER, body: { spec: VALID_SPEC } });
    await call(r.approve.POST, { method: 'POST', url: `/api/jobs/${id}/spec/approve`, params: { id }, user: CUSTOMER, body: {} });
    return id;
  };
  await mk('Cheap data job', { category: 'data', budget_min_cents: 1000, budget_max_cents: 5000, deadline: '2026-11-15T00:00:00.000Z' });
  await mk('Pricey web job', { category: 'web', budget_min_cents: 100000, budget_max_cents: 200000, deadline: '2027-02-01T00:00:00.000Z' });
  await mk('Mid web job', { category: 'web', budget_min_cents: 20000, budget_max_cents: 60000, deadline: '2026-12-20T00:00:00.000Z' });

  const all = await call(r.jobs.GET, { url: '/api/jobs', user: STRANGER });
  assert.equal(all.body.total, 3);
  assert.equal(all.body.limit, 20);
  assert.equal(all.body.offset, 0);

  const web = await call(r.jobs.GET, { url: '/api/jobs?category=web', user: STRANGER });
  assert.deepEqual(web.body.jobs.map((j: { title: string }) => j.title).sort(), ['Mid web job', 'Pricey web job']);

  const price = await call(r.jobs.GET, { url: '/api/jobs?min_price_cents=50000&max_price_cents=120000', user: STRANGER });
  assert.deepEqual(price.body.jobs.map((j: { title: string }) => j.title).sort(), ['Mid web job', 'Pricey web job']);

  const soon = await call(r.jobs.GET, { url: '/api/jobs?deadline_before=2026-12-31T00:00:00Z', user: STRANGER });
  assert.deepEqual(soon.body.jobs.map((j: { title: string }) => j.title).sort(), ['Cheap data job', 'Mid web job']);

  const later = await call(r.jobs.GET, { url: '/api/jobs?deadline_after=2026-12-01T00:00:00Z', user: STRANGER });
  assert.deepEqual(later.body.jobs.map((j: { title: string }) => j.title).sort(), ['Mid web job', 'Pricey web job']);

  const page = await call(r.jobs.GET, { url: '/api/jobs?limit=2&offset=2', user: STRANGER });
  assert.equal(page.body.jobs.length, 1);
  assert.equal(page.body.total, 3);

  const bad = await call(r.jobs.GET, { url: '/api/jobs?status=bogus', user: STRANGER });
  assert.equal(bad.status, 400);
});

test('offers: create and list', async () => {
  const bad = await call(r.offers.POST, { method: 'POST', url: '/api/offers', user: STRANGER, body: { title: 'x' } });
  assert.equal(bad.status, 400);
  const res = await call(r.offers.POST, {
    method: 'POST', url: '/api/offers', user: STRANGER,
    body: { title: 'Next.js bug fixing', description: 'I fix Next.js bugs within days.', price_cents: 15000, delivery_days: 3, tags: ['nextjs'] },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.offer.status, 'active');
  assert.equal(res.body.offer.currency, 'eur');
  const mine = await call(r.offers.GET, { url: '/api/offers?mine=true', user: STRANGER });
  assert.equal(mine.body.offers.length, 1);
  const others = await call(r.offers.GET, { url: '/api/offers?mine=true', user: CUSTOMER });
  assert.equal(others.body.offers.length, 0);
  const search = await call(r.offers.GET, { url: '/api/offers?q=next.js&max_price_cents=20000', user: CUSTOMER });
  assert.equal(search.body.total, 1);
});

after(async () => {
  await resetDb();
});
