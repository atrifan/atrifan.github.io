import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import Stripe from 'stripe';
import { FAKE_TOKENS, FAKE_REPOS, FAKE_SHA_HEAD } from '../support/fake-github';

// Behaviour-only contract tests for the admin QA MCP (/api/admin/qa/mcp): queue,
// submission detail, credentials + review key, and marking a verdict, plus what the
// provider sees afterwards through the submission tools. Runs against a throwaway DB, a
// fake Stripe and a fake GitHub; auth uses the e2e header bypass.

test.skip(
  !process.env.JOBS_E2E_AUTH_SECRET || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.QA_E2E_ADMIN_USER,
  'gigs QA e2e env not set',
);

const E2E_SECRET = process.env.JOBS_E2E_AUTH_SECRET ?? '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const ADMIN = process.env.QA_E2E_ADMIN_USER ?? '';
const stripe = new Stripe('sk_test_x');
const ADMIN_MCP = '/api/admin/qa/mcp';
const SUBMISSION_MCP = '/api/jobs/mcp';
const DUMMY_ID = '00000000-0000-4000-8000-000000000000';
const DAY = 86_400_000;
const HOUR = 3_600_000;
const BID_CENTS = 30000;
const ACCEPTANCE = ['All provided sample files import without errors', 'Importer has unit tests'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

function uid(role: string): string {
  return `e2e_qa_${role}_${Date.now()}_${rand()}`;
}

function auth(userId: string): Record<string, string> {
  return { 'x-e2e-user': userId, 'x-e2e-secret': E2E_SECRET };
}

// --- contract setup (job → spec → approve → Connect → bid → accept → paid) ----------

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

async function enableConnect(request: APIRequestContext, userId: string): Promise<void> {
  const onboard = await request.post('/api/connect/onboard', { headers: auth(userId), data: { country: 'DE' } });
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
}

/** Creates a paid (active) contract between customer and an already Connect-enabled provider. */
async function makeActiveContract(
  request: APIRequestContext,
  customer: string,
  provider: string,
): Promise<{ contractId: string; jobId: string; jobTitle: string }> {
  const jobTitle = `E2E admin QA job ${rand()}`;
  const job = await request.post('/api/jobs', {
    headers: auth(customer),
    data: {
      title: jobTitle,
      description: 'A job created by the admin QA e2e suite.',
      category: 'development',
      budget_min_cents: 20000,
      budget_max_cents: 40000,
      deadline: new Date(Date.now() + 30 * DAY).toISOString(),
    },
  });
  expect(job.status()).toBe(201);
  const jobId = ((await job.json()) as { job: { id: string } }).job.id;

  const draft = await request.post(`/api/jobs/${jobId}/spec/draft`, {
    headers: auth(customer),
    data: {
      spec: {
        requirements: ['Build a CSV import endpoint'],
        deliverables: ['Source code in a PR'],
        acceptance_criteria: ACCEPTANCE,
        constraints: ['TypeScript only'],
        deadline: new Date(Date.now() + 14 * DAY).toISOString(),
        budget_min_cents: 20000,
        budget_max_cents: 40000,
        permitted_tools: ['node'],
        security: { data_sensitivity: 'internal', secrets_allowed: false, notes: 'No prod data' },
      },
    },
  });
  expect(draft.status()).toBe(201);
  const approve = await request.post(`/api/jobs/${jobId}/spec/approve`, { headers: auth(customer), data: {} });
  expect(approve.status()).toBe(200);

  const bid = await request.post(`/api/jobs/${jobId}/bids`, {
    headers: auth(provider),
    data: { price_cents: BID_CENTS, eta_days: 7 },
  });
  expect(bid.status()).toBe(201);
  const bidId = ((await bid.json()) as { bid: { id: string } }).bid.id;

  const accept = await request.post(`/api/bids/${bidId}/accept`, { headers: auth(customer), data: {} });
  expect(accept.status()).toBe(201);
  const accepted = (await accept.json()) as {
    contract: { id: string };
    version: { customer_total_cents: number };
  };
  const contractId = accepted.contract.id;

  const suffix = `${Date.now()}_${rand()}`;
  const hook = await postSignedWebhook(
    request,
    JSON.stringify(
      makeEvent('checkout.session.completed', {
        id: `cs_test_${suffix}`,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        status: 'complete',
        amount_total: accepted.version.customer_total_cents,
        currency: 'eur',
        payment_intent: `pi_test_${suffix}`,
        metadata: { kind: 'contract', contract_id: contractId },
      }),
    ),
  );
  expect(hook.status()).toBe(200);
  return { contractId, jobId, jobTitle };
}

// --- MCP helpers -------------------------------------------------------------------

interface Rpc {
  status: number;
  text: string;
  body: Json;
}

async function rpc(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string>,
  method: string,
  params: Record<string, unknown> = {},
): Promise<Rpc> {
  const res = await request.post(path, {
    headers: { ...headers, 'content-type': 'application/json' },
    data: { jsonrpc: '2.0', id: rand(), method, params },
  });
  const text = await res.text();
  return { status: res.status(), text, body: JSON.parse(text) };
}

/** Calls a tool and expects a JSON-RPC result. Fails if a PAT shows up where it must not. */
async function tool(
  request: APIRequestContext,
  path: string,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; result: Json; sc: Json }> {
  const r = await rpc(request, path, auth(userId), 'tools/call', { name, arguments: args });
  expect(r.status, r.text).toBe(200);
  expect(r.body.result, r.text).toBeDefined();
  if (name !== 'qa_credentials_get') {
    for (const token of Object.values(FAKE_TOKENS)) expect(r.text, `${name} leaked a PAT`).not.toContain(token);
  }
  return { text: r.text, result: r.body.result, sc: r.body.result.structuredContent };
}

async function ok(call: Promise<{ text: string; result: Json; sc: Json }>): Promise<Json> {
  const r = await call;
  expect(r.result.isError, r.text).toBeFalsy();
  expect(JSON.parse(r.result.content[0].text)).toEqual(r.sc);
  return r.sc;
}

async function toolError(call: Promise<{ text: string; result: Json; sc: Json }>, code: string): Promise<Json> {
  const r = await call;
  expect(r.result.isError, r.text).toBe(true);
  expect(r.sc.error, r.text).toBe(code);
  expect(typeof r.sc.message).toBe('string');
  return r.sc;
}

const admin = (request: APIRequestContext, name: string, args: Record<string, unknown>) =>
  tool(request, ADMIN_MCP, ADMIN, name, args);
const party = (request: APIRequestContext, userId: string, name: string, args: Record<string, unknown>) =>
  tool(request, SUBMISSION_MCP, userId, name, args);

async function submit(request: APIRequestContext, provider: string, contractId: string): Promise<Json> {
  return ok(
    party(request, provider, 'send_project', {
      contract_id: contractId,
      git_repo: FAKE_REPOS.private,
      pat_token: FAKE_TOKENS.good,
    }),
  );
}

async function expectKeyRevoked(request: APIRequestContext, key: string): Promise<void> {
  const res = await request.post('/api/chat', {
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    data: { messages: [{ role: 'user', content: 'hi' }], stream: false },
  });
  expect(res.status()).toBe(403);
}

/** One fresh in_review submission: contract → send_project → qa_credentials_get. */
async function inReviewSubmission(
  request: APIRequestContext,
  customer: string,
  provider: string,
): Promise<{ contractId: string; submissionId: string; reviewKey: string }> {
  const { contractId } = await makeActiveContract(request, customer, provider);
  const sent = await submit(request, provider, contractId);
  const creds = await ok(admin(request, 'qa_credentials_get', { submission_id: sent.submission.id }));
  return { contractId, submissionId: sent.submission.id, reviewKey: creds.review_key.key };
}

// ---------------------------------------------------------------------------------

test.describe('admin QA MCP: access control', () => {
  test('no auth headers → 401 with JSON-RPC error -32001', async ({ request }) => {
    const r = await rpc(request, ADMIN_MCP, {}, 'tools/list');
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe(-32001);
    expect(r.body.result).toBeUndefined();
  });

  test('non-admin: tools/list is empty and tools/call → 403 with JSON-RPC error -32003', async ({ request }) => {
    const user = uid('nonadmin');
    const list = await rpc(request, ADMIN_MCP, auth(user), 'tools/list');
    expect(list.status).toBe(200);
    expect(list.body.result).toEqual({ tools: [] });

    for (const name of ['qa_queue_list', 'qa_submission_get', 'qa_credentials_get', 'qa_mark']) {
      const call = await rpc(request, ADMIN_MCP, auth(user), 'tools/call', {
        name,
        arguments: { submission_id: DUMMY_ID, verdict: 'validated' },
      });
      expect(call.status, name).toBe(403);
      expect(call.body.error.code, name).toBe(-32003);
      expect(call.body.result, name).toBeUndefined();
    }
  });

  test('admin tools/list → exactly the four QA tools', async ({ request }) => {
    const r = await rpc(request, ADMIN_MCP, auth(ADMIN), 'tools/list');
    expect(r.status).toBe(200);
    const names = (r.body.result.tools as Array<{ name: string }>).map((t) => t.name).sort();
    expect(names).toEqual(['qa_credentials_get', 'qa_mark', 'qa_queue_list', 'qa_submission_get']);
  });
});

test.describe('admin QA MCP: queue, detail, credentials and a validated verdict', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  const customer = uid('customer');
  const provider = uid('provider');
  let contractId = '';
  let jobId = '';
  let jobTitle = '';
  let submissionId = '';
  const keys: string[] = [];
  let reviewId = '';

  test('setup: an active contract and a fresh submission', async ({ request }) => {
    await enableConnect(request, provider);
    ({ contractId, jobId, jobTitle } = await makeActiveContract(request, customer, provider));
    submissionId = (await submit(request, provider, contractId)).submission.id;
  });

  test('qa_queue_list shows the fresh submission awaiting QA with pricing and parties', async ({ request }) => {
    const sc = await ok(admin(request, 'qa_queue_list', { limit: 50 }));
    const item = (sc.items as Json[]).find((i) => i.submission_id === submissionId);
    expect(item, 'submission not in queue').toBeDefined();
    expect(item).toMatchObject({
      contract_id: contractId,
      job_id: jobId,
      job_title: jobTitle,
      attempt: 1,
      status: 'awaiting_qa',
      repo_full_name: FAKE_REPOS.private,
      commit_sha: FAKE_SHA_HEAD,
      price_cents: BID_CENTS,
      provider: { user_id: provider },
      customer: { user_id: customer },
    });
    expect(item.customer_total_cents).toBe(item.price_cents + item.commission_cents);
    expect(typeof item.commission_bps).toBe('number');
    expect(typeof item.currency).toBe('string');
    for (const p of [item.provider, item.customer]) {
      expect(p.name === null || typeof p.name === 'string').toBe(true);
      expect(p.email === null || typeof p.email === 'string').toBe(true);
      expect(typeof p.plan).toBe('string');
    }
  });

  test('qa_submission_get returns submission, contract, version, spec and QA budget without the PAT', async ({
    request,
  }) => {
    const sc = await ok(admin(request, 'qa_submission_get', { submission_id: submissionId }));
    expect(sc.submission).toMatchObject({
      id: submissionId,
      attempt: 1,
      status: 'awaiting_qa',
      repo_full_name: FAKE_REPOS.private,
      commit_sha: FAKE_SHA_HEAD,
    });
    expect(sc.contract).toMatchObject({ id: contractId, status: 'in_qa' });
    expect(sc.contract_version).toMatchObject({ version: 1, price_cents: BID_CENTS });
    for (const k of ['commission_bps', 'fee_cents', 'customer_total_cents']) {
      expect(typeof sc.contract_version[k], k).toBe('number');
    }
    expect(sc.contract_version).toHaveProperty('deadline');
    expect(sc.contract_version).toHaveProperty('steering_allowance');
    expect(sc.contract_version).toHaveProperty('qa_checks');
    expect(sc.spec.acceptance_criteria).toEqual(ACCEPTANCE);
    expect(sc.spec).toHaveProperty('requirements');
    expect(sc.spec).toHaveProperty('deliverables');
    expect(sc.parties).toHaveProperty('provider');
    expect(sc.parties).toHaveProperty('customer');
    expect(sc.qa).toMatchObject({ checks: ['basic'], reserved_credits: 0, platform_credits: 60 });
    expect(sc.qa).toHaveProperty('used_credits');
    expect(sc.qa).toHaveProperty('status');
    expect(sc.steering_history).toEqual([]);
    expect(sc.previous_reviews).toEqual([]);

    await toolError(admin(request, 'qa_submission_get', { submission_id: DUMMY_ID }), 'not_found');
  });

  test('provider and customer calling qa_credentials_get → JSON-RPC error -32003, no credentials', async ({
    request,
  }) => {
    for (const who of [provider, customer]) {
      const r = await rpc(request, ADMIN_MCP, auth(who), 'tools/call', {
        name: 'qa_credentials_get',
        arguments: { submission_id: submissionId },
      });
      expect(r.body.error?.code, who).toBe(-32003);
      expect(r.body.result).toBeUndefined();
      expect(r.text).not.toContain(FAKE_TOKENS.good);
    }
  });

  test('qa_credentials_get hands over the PAT and a fresh review key; submission moves to in_review', async ({
    request,
  }) => {
    const before = Date.now();
    const sc = await ok(admin(request, 'qa_credentials_get', { submission_id: submissionId }));
    expect(sc).toMatchObject({
      repo_full_name: FAKE_REPOS.private,
      repo_url: 'https://github.com/acme/private-repo',
      commit_sha: FAKE_SHA_HEAD,
      pat_token: FAKE_TOKENS.good,
    });
    expect(Number.isNaN(Date.parse(sc.pat_expires_at))).toBe(false);
    const key = sc.review_key;
    expect(key.key).toMatch(/^ak_/);
    expect(typeof key.key_id).toBe('string');
    expect(key.cap_credits).toBe(60);
    expect(key.chat_url).toMatch(/\/api\/chat$/);
    const ttl = Date.parse(key.expires_at) - before;
    expect(ttl).toBeGreaterThan(23 * HOUR);
    expect(ttl).toBeLessThan(25 * HOUR);
    keys.push(key.key);

    const again = await ok(admin(request, 'qa_credentials_get', { submission_id: submissionId }));
    expect(again.review_key.key).toMatch(/^ak_/);
    expect(again.review_key.key).not.toBe(key.key);
    keys.push(again.review_key.key);

    const detail = await ok(admin(request, 'qa_submission_get', { submission_id: submissionId }));
    expect(detail.submission.status).toBe('in_review');
    const queue = await ok(admin(request, 'qa_queue_list', { status: 'in_review', limit: 50 }));
    const item = (queue.items as Json[]).find((i) => i.submission_id === submissionId);
    expect(item?.status).toBe('in_review');
  });

  test('qa_mark with an unknown verdict or a missing/blank reason → error, nothing changes', async ({
    request,
  }) => {
    await toolError(
      admin(request, 'qa_mark', { submission_id: submissionId, verdict: 'great' }),
      'invalid_request',
    );
    for (const verdict of ['requires_changes', 'rejected']) {
      await toolError(admin(request, 'qa_mark', { submission_id: submissionId, verdict }), 'reason_required');
      await toolError(
        admin(request, 'qa_mark', { submission_id: submissionId, verdict, reason: '   ' }),
        'reason_required',
      );
    }
    const detail = await ok(admin(request, 'qa_submission_get', { submission_id: submissionId }));
    expect(detail.submission.status).toBe('in_review');
    expect(detail.contract.status).toBe('in_qa');
  });

  test('qa_mark validated → contract delivered, report visible to both parties, keys revoked', async ({
    request,
  }) => {
    const reportMd = `# QA report ${rand()}\n\nAll acceptance criteria pass.`;
    const sc = await ok(
      admin(request, 'qa_mark', {
        submission_id: submissionId,
        verdict: 'validated',
        reason: 'Meets the spec',
        report_md: reportMd,
        findings: [],
      }),
    );
    expect(sc.review).toMatchObject({ verdict: 'validated', reason: 'Meets the spec' });
    expect(sc.submission_status).toBe('validated');
    expect(sc.contract_status).toBe('delivered');
    for (const k of ['used', 'platform_charged', 'customer_charged', 'customer_released']) {
      expect(typeof sc.credits[k], k).toBe('number');
    }
    reviewId = sc.review.id;

    const status = await ok(party(request, provider, 'qa_status', { contract_id: contractId }));
    expect(status.contract_status).toBe('delivered');
    expect(status.latest_review).toMatchObject({ id: reviewId, submission_id: submissionId, verdict: 'validated' });
    expect(status.can_resubmit).toBe(false);

    for (const who of [provider, customer]) {
      const report = await ok(party(request, who, 'qa_report_get', { review_id: reviewId }));
      expect(report.review).toMatchObject({
        id: reviewId,
        submission_id: submissionId,
        contract_id: contractId,
        attempt: 1,
        commit_sha: FAKE_SHA_HEAD,
        verdict: 'validated',
        report_md: reportMd,
      });
    }
    await toolError(party(request, uid('stranger'), 'qa_report_get', { review_id: reviewId }), 'not_found');

    for (const key of keys) await expectKeyRevoked(request, key);
  });

  test('qa_mark on an already-marked submission → invalid_state', async ({ request }) => {
    await toolError(
      admin(request, 'qa_mark', { submission_id: submissionId, verdict: 'rejected', reason: 'Changed my mind' }),
      'invalid_state',
    );
    const detail = await ok(admin(request, 'qa_submission_get', { submission_id: submissionId }));
    expect(detail.submission.status).toBe('validated');
    expect(detail.contract.status).toBe('delivered');
  });
});

test.describe('admin QA MCP: requires_changes then resubmit', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  const customer = uid('customer');
  const provider = uid('provider');
  const reason = `Importer crashes on empty files ${rand()}`;
  let contractId = '';
  let firstReviewId = '';

  test('qa_mark requires_changes → contract rework, provider sees the reason and may resubmit', async ({
    request,
  }) => {
    await enableConnect(request, provider);
    const s = await inReviewSubmission(request, customer, provider);
    contractId = s.contractId;

    const sc = await ok(admin(request, 'qa_mark', { submission_id: s.submissionId, verdict: 'requires_changes', reason }));
    expect(sc.submission_status).toBe('requires_changes');
    expect(sc.contract_status).toBe('rework');
    expect(sc.review).toMatchObject({ verdict: 'requires_changes', reason });
    firstReviewId = sc.review.id;

    const status = await ok(party(request, provider, 'qa_status', { contract_id: contractId }));
    expect(status.contract_status).toBe('rework');
    expect(status.latest_review).toMatchObject({ id: firstReviewId, verdict: 'requires_changes', reason });
    expect(status.can_resubmit).toBe(true);

    await expectKeyRevoked(request, s.reviewKey);
  });

  test('second send_project → attempt 2 awaiting QA; its detail lists the earlier review', async ({ request }) => {
    const sent = await submit(request, provider, contractId);
    expect(sent.submission).toMatchObject({ attempt: 2, status: 'awaiting_qa' });
    expect(sent.contract_status).toBe('in_qa');

    const status = await ok(party(request, provider, 'qa_status', { contract_id: contractId }));
    expect((status.submissions as Json[]).map((x) => x.attempt)).toEqual([1, 2]);
    expect(status.latest_submission).toMatchObject({ id: sent.submission.id, attempt: 2 });

    const detail = await ok(admin(request, 'qa_submission_get', { submission_id: sent.submission.id }));
    expect(detail.submission).toMatchObject({ attempt: 2, status: 'awaiting_qa' });
    expect(detail.previous_reviews).toHaveLength(1);
    expect(detail.previous_reviews[0]).toMatchObject({
      id: firstReviewId,
      attempt: 1,
      verdict: 'requires_changes',
      reason,
    });
  });
});

test.describe('admin QA MCP: rejected', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  const customer = uid('customer');
  const provider = uid('provider');

  test('qa_mark rejected → contract disputed, no resubmission, key revoked', async ({ request }) => {
    await enableConnect(request, provider);
    const s = await inReviewSubmission(request, customer, provider);
    const reason = 'Delivered code does not match the spec';

    const sc = await ok(admin(request, 'qa_mark', { submission_id: s.submissionId, verdict: 'rejected', reason }));
    expect(sc.submission_status).toBe('rejected');
    expect(sc.contract_status).toBe('disputed');
    expect(sc.review).toMatchObject({ verdict: 'rejected', reason });

    const status = await ok(party(request, provider, 'qa_status', { contract_id: s.contractId }));
    expect(status.contract_status).toBe('disputed');
    expect(status.can_resubmit).toBe(false);

    await toolError(
      party(request, provider, 'send_project', {
        contract_id: s.contractId,
        git_repo: FAKE_REPOS.private,
        pat_token: FAKE_TOKENS.good,
      }),
      'invalid_state',
    );
    await expectKeyRevoked(request, s.reviewKey);
  });
});
