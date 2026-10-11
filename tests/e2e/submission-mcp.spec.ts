import { test, expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import Stripe from 'stripe';
import { FAKE_TOKENS, FAKE_REPOS, FAKE_SHA_HEAD, FAKE_SHA_OTHER } from '../support/fake-github';

// Behaviour-only contract tests for the provider submission tools (send_project,
// qa_status, qa_report_get) served by the Jobs MCP at /api/jobs/mcp. Runs against a
// throwaway DB, a fake Stripe and a fake GitHub; auth uses the e2e header bypass.

test.skip(
  !process.env.JOBS_E2E_AUTH_SECRET || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.QA_E2E_ADMIN_USER,
  'gigs QA e2e env not set',
);

const E2E_SECRET = process.env.JOBS_E2E_AUTH_SECRET ?? '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const stripe = new Stripe('sk_test_x');
const MCP = '/api/jobs/mcp';
const DUMMY_ID = '00000000-0000-4000-8000-000000000000';
const DAY = 86_400_000;

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
): Promise<string> {
  const job = await request.post('/api/jobs', {
    headers: auth(customer),
    data: {
      title: `E2E QA job ${rand()}`,
      description: 'A job created by the QA submission e2e suite.',
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
        acceptance_criteria: ['All provided sample files import without errors'],
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
    data: { price_cents: 30000, eta_days: 7 },
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
  return contractId;
}

// --- MCP helpers -------------------------------------------------------------------

const ALL_TOKENS = Object.values(FAKE_TOKENS);

interface ToolCall {
  status: number;
  text: string;
  result: Json;
  /** structuredContent of the result. */
  sc: Json;
}

async function rpc(
  request: APIRequestContext,
  userId: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<{ status: number; text: string; body: Json }> {
  const res = await request.post(MCP, {
    headers: { ...auth(userId), 'content-type': 'application/json' },
    data: { jsonrpc: '2.0', id: rand(), method, params },
  });
  const text = await res.text();
  // The PAT is never echoed by any submission tool.
  for (const token of ALL_TOKENS) expect(text, `${method} echoed a PAT`).not.toContain(token);
  return { status: res.status(), text, body: JSON.parse(text) };
}

async function callTool(
  request: APIRequestContext,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolCall> {
  const { status, text, body } = await rpc(request, userId, 'tools/call', { name, arguments: args });
  expect(status, text).toBe(200);
  expect(body.jsonrpc).toBe('2.0');
  expect(body.result, text).toBeDefined();
  return { status, text, result: body.result, sc: body.result.structuredContent };
}

async function expectToolError(call: Promise<ToolCall>, code: string): Promise<ToolCall> {
  const r = await call;
  expect(r.result.isError, r.text).toBe(true);
  expect(r.sc.error, r.text).toBe(code);
  expect(typeof r.sc.message).toBe('string');
  expect(r.result.content[0].type).toBe('text');
  return r;
}

async function expectToolOk(call: Promise<ToolCall>): Promise<Json> {
  const r = await call;
  expect(r.result.isError, r.text).toBeFalsy();
  expect(r.result.content[0].type).toBe('text');
  expect(JSON.parse(r.result.content[0].text)).toEqual(r.sc);
  return r.sc;
}

async function contractStatus(request: APIRequestContext, userId: string, contractId: string): Promise<string> {
  const sc = await expectToolOk(callTool(request, userId, 'qa_status', { contract_id: contractId }));
  return sc.contract_status;
}

// ---------------------------------------------------------------------------------

test.describe('submission MCP: tools', () => {
  test('tools/list exposes send_project, qa_status and qa_report_get with input schemas', async ({
    request,
  }) => {
    const init = await rpc(request, uid('lister'), 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '0' },
    });
    expect(init.status).toBe(200);
    expect(init.body.result).toBeDefined();

    const { status, body } = await rpc(request, uid('lister'), 'tools/list');
    expect(status).toBe(200);
    const tools = body.result.tools as Array<{ name: string; description: string; inputSchema: unknown }>;
    const names = tools.map((t) => t.name);
    for (const name of ['send_project', 'qa_status', 'qa_report_get']) expect(names).toContain(name);
    for (const t of tools) {
      expect(typeof t.description).toBe('string');
      expect(typeof t.inputSchema).toBe('object');
    }
  });
});

test.describe('submission MCP: send_project and qa_status', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  const customer = uid('customer');
  const provider = uid('provider');
  const stranger = uid('stranger');
  let contractA = '';
  let contractB = '';
  let submissionId = '';

  test('setup: two active contracts between the same parties', async ({ request }) => {
    await enableConnect(request, provider);
    contractA = await makeActiveContract(request, customer, provider);
    contractB = await makeActiveContract(request, customer, provider);
  });

  test('qa_status before any submission → active, no submissions, can resubmit', async ({ request }) => {
    for (const who of [provider, customer]) {
      const sc = await expectToolOk(callTool(request, who, 'qa_status', { contract_id: contractA }));
      expect(sc).toMatchObject({
        contract_id: contractA,
        contract_status: 'active',
        submissions: [],
        latest_submission: null,
        latest_review: null,
        can_resubmit: true,
      });
    }
  });

  test('qa_status and qa_report_get by a stranger → not_found', async ({ request }) => {
    await expectToolError(callTool(request, stranger, 'qa_status', { contract_id: contractA }), 'not_found');
    await expectToolError(callTool(request, stranger, 'qa_report_get', { review_id: DUMMY_ID }), 'not_found');
  });

  test('send_project by the customer → forbidden, by a stranger → not_found', async ({ request }) => {
    const args = { contract_id: contractA, git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good };
    await expectToolError(callTool(request, customer, 'send_project', args), 'forbidden');
    await expectToolError(callTool(request, stranger, 'send_project', args), 'not_found');
    expect(await contractStatus(request, provider, contractA)).toBe('active');
  });

  test('send_project with an unacceptable PAT, repo or commit → specific error, contract unchanged', async ({
    request,
  }) => {
    const cases: Array<{ name: string; args: Record<string, unknown>; code: string; message?: RegExp }> = [
      { name: 'classic PAT', args: { git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.classic }, code: 'classic_pat' },
      { name: 'revoked PAT', args: { git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.revoked }, code: 'invalid_pat' },
      {
        name: 'public repo',
        args: { git_repo: FAKE_REPOS.public, pat_token: FAKE_TOKENS.publicRepo },
        code: 'public_repo',
        message: /private/i,
      },
      { name: 'PAT reaching two repos', args: { git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.broad }, code: 'pat_too_broad' },
      {
        name: 'PAT expiring in 90 days',
        args: { git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.longExpiry },
        code: 'pat_expiry_too_long',
      },
      {
        name: 'unknown commit',
        args: { git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good, commit_sha: 'f'.repeat(40) },
        code: 'commit_not_found',
      },
      { name: 'repo the PAT cannot see', args: { git_repo: 'acme/nope', pat_token: FAKE_TOKENS.good }, code: 'repo_not_accessible' },
    ];
    for (const c of cases) {
      await test.step(c.name, async () => {
        const r = await expectToolError(
          callTool(request, provider, 'send_project', { contract_id: contractA, ...c.args }),
          c.code,
        );
        if (c.message) expect(r.sc.message).toMatch(c.message);
      });
    }
    const sc = await expectToolOk(callTool(request, provider, 'qa_status', { contract_id: contractA }));
    expect(sc.contract_status).toBe('active');
    expect(sc.submissions).toEqual([]);
  });

  test('send_project with a good PAT and a .git URL → awaiting_qa at HEAD, contract in_qa', async ({
    request,
  }) => {
    const before = Date.now();
    const sc = await expectToolOk(
      callTool(request, provider, 'send_project', {
        contract_id: contractA,
        git_repo: `https://github.com/${FAKE_REPOS.private}.git`,
        pat_token: FAKE_TOKENS.good,
      }),
    );
    expect(sc.submission).toMatchObject({
      contract_id: contractA,
      attempt: 1,
      status: 'awaiting_qa',
      repo_full_name: FAKE_REPOS.private,
      commit_sha: FAKE_SHA_HEAD,
    });
    expect(typeof sc.submission.id).toBe('string');
    expect(Number.isNaN(Date.parse(sc.submission.submitted_at))).toBe(false);
    const expiresIn = Date.parse(sc.submission.pat_expires_at) - before;
    expect(expiresIn).toBeGreaterThan(9 * DAY);
    expect(expiresIn).toBeLessThan(11 * DAY);
    expect(sc.contract_status).toBe('in_qa');
    expect(sc.qa).toEqual({ checks: ['basic'], reserved_credits: 0, platform_credits: 60 });
    submissionId = sc.submission.id;
  });

  test('qa_status after submitting → in_qa with the one submission, for both parties', async ({ request }) => {
    for (const who of [provider, customer]) {
      const sc = await expectToolOk(callTool(request, who, 'qa_status', { contract_id: contractA }));
      expect(sc.contract_status).toBe('in_qa');
      expect(sc.submissions).toHaveLength(1);
      expect(sc.submissions[0]).toMatchObject({
        id: submissionId,
        attempt: 1,
        status: 'awaiting_qa',
        repo_full_name: FAKE_REPOS.private,
        commit_sha: FAKE_SHA_HEAD,
      });
      expect(sc.latest_submission).toMatchObject({ id: submissionId, attempt: 1 });
      expect(sc.latest_review).toBeNull();
    }
  });

  test('send_project again while in_qa → invalid_state, still one submission', async ({ request }) => {
    await expectToolError(
      callTool(request, provider, 'send_project', {
        contract_id: contractA,
        git_repo: FAKE_REPOS.private,
        pat_token: FAKE_TOKENS.good,
      }),
      'invalid_state',
    );
    const sc = await expectToolOk(callTool(request, provider, 'qa_status', { contract_id: contractA }));
    expect(sc.contract_status).toBe('in_qa');
    expect(sc.submissions).toHaveLength(1);
  });

  test('send_project with owner/repo and an explicit commit_sha pins that commit', async ({ request }) => {
    const sc = await expectToolOk(
      callTool(request, provider, 'send_project', {
        contract_id: contractB,
        git_repo: FAKE_REPOS.private,
        pat_token: FAKE_TOKENS.good,
        commit_sha: FAKE_SHA_OTHER,
      }),
    );
    expect(sc.submission).toMatchObject({
      contract_id: contractB,
      attempt: 1,
      status: 'awaiting_qa',
      repo_full_name: FAKE_REPOS.private,
      commit_sha: FAKE_SHA_OTHER,
    });
    expect(sc.contract_status).toBe('in_qa');
    expect(sc.submission.owner_admin).toBe(false);
  });

  test('a repo owner\'s token (GitHub reports admin) is accepted and flagged owner_admin', async ({ request }) => {
    const contractC = await makeActiveContract(request, customer, provider);
    const sc = await expectToolOk(
      callTool(request, provider, 'send_project', { contract_id: contractC, git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.admin }),
    );
    expect(sc.submission).toMatchObject({ contract_id: contractC, status: 'awaiting_qa', owner_admin: true });
    expect(sc.contract_status).toBe('in_qa');
  });
});
