import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { installMocks, resetDb, sql, seedBalance, clerkState, streamState, call } from './helpers';
import { seedActiveContract, seedDeviceKey, balance, toolCall } from './qa-helpers';
import { startFakeGithub, FAKE_TOKENS, FAKE_REPOS, type FakeGithub } from '../support/fake-github';

installMocks();

process.env.PAT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.ADMIN_EMAILS = 'billing-admin@test.local';

let chat: typeof import('../../app/api/chat/route');
let adminMcp: typeof import('../../app/api/admin/qa/mcp/route');
let tools: typeof import('../../src/lib/jobs/mcp/tools/submission');
let github: FakeGithub;

const ADMIN = 'user_bill_admin';
const CUSTOMER = 'user_bill_cust';
const PROVIDER = 'user_bill_prov';
const MODEL = 'openai/gpt-4o'; // $2.50 / 1M in, $10 / 1M out
let adminKey: string;

/** Gateway stand-in: each call "uses" the given tokens and reports them to onFinish. */
function gatewayUses(inputTokens: number, outputTokens: number) {
  streamState.streamText = (args) => {
    const finished = Promise.resolve(args.onFinish?.({ usage: { inputTokens, outputTokens }, response: { headers: {} } }));
    return { text: finished.then(() => 'ok') };
  };
}

function chatWith(key: string) {
  return call(chat.POST, {
    method: 'POST', url: '/api/chat', headers: { 'x-api-key': key },
    body: { model: MODEL, messages: [{ role: 'user', content: 'review this repo' }], stream: false },
  });
}

before(async () => {
  await resetDb();
  github = await startFakeGithub();
  process.env.GITHUB_API_BASE = github.url;
  chat = await import('../../app/api/chat/route');
  adminMcp = await import('../../app/api/admin/qa/mcp/route');
  tools = await import('../../src/lib/jobs/mcp/tools/submission');
  clerkState.users.set(ADMIN, { emailAddresses: [{ emailAddress: 'billing-admin@test.local' }], publicMetadata: {} });
  adminKey = await seedDeviceKey(ADMIN, 'pro');
});

after(async () => {
  await github.close();
  delete process.env.GITHUB_API_BASE;
  await resetDb();
});

beforeEach(() => {
  streamState.calls.length = 0;
});

async function reviewKeyFor(qaChecks: string[] | null): Promise<{ submissionId: string; key: string; keyId: string }> {
  const c = await seedActiveContract({ customer: CUSTOMER, provider: PROVIDER, qaChecks, title: `Billing ${randomBytes(3).toString('hex')}` });
  const out = await tools.send_project.handler({ userId: PROVIDER, principalId: null, agentIdentityId: null }, {
    contract_id: c.contractId, git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good,
  });
  const cred = await toolCall(adminMcp.POST, '/api/admin/qa/mcp', 'qa_credentials_get', { submission_id: out.submission.id }, { 'x-api-key': adminKey });
  assert.equal(cred.status, 200, JSON.stringify(cred.body));
  return { submissionId: out.submission.id, key: cred.data.review_key.key, keyId: cred.data.review_key.key_id };
}

async function usedCredits(submissionId: string): Promise<number> {
  const [r] = await sql<any>('SELECT used_credits FROM qa_requests WHERE subject_id = $1', [submissionId]);
  return Number(r.used_credits);
}

test('a review key bills the customer reserve at cost × CREDIT_MARKUP, not the admin; stops at the cap with 402', async () => {
  await seedBalance(CUSTOMER, 10);
  await seedBalance(ADMIN, 0); // the admin's own balance is not needed and not touched
  const { submissionId, key, keyId } = await reviewKeyFor(['code_review']); // cap 60 + 300
  assert.equal(await balance(CUSTOMER), 7);

  gatewayUses(100_000, 50_000); // $0.25 + $0.50 = $0.75 raw × 1.3 = 97.5 credits per call
  for (let i = 1; i <= 3; i += 1) {
    const r = await chatWith(key);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await usedCredits(submissionId), 97.5 * i);
  }
  const last = await chatWith(key); // 67.5 left, more than this call's hold: runs, charge clamped
  assert.equal(last.status, 200);
  assert.equal(await usedCredits(submissionId), 360);

  const capped = await chatWith(key);
  assert.equal(capped.status, 402);
  assert.equal(capped.body.code, 'qa_reserve_exhausted');
  assert.match(capped.body.error, /reserve/i);
  assert.equal(capped.body.cap_credits, 360);
  assert.equal(capped.body.used_credits, 360);
  assert.equal(streamState.calls.length, 4, 'the gateway is not called once the cap is reached');
  assert.equal((await sql('SELECT 1 FROM qa_credit_holds')).length, 0, 'every hold is released after its call');

  assert.equal(await balance(ADMIN), 0);
  assert.equal(await balance(CUSTOMER), 7);
  const log = await sql<any>('SELECT * FROM qa_usage_log WHERE submission_id = $1 ORDER BY id', [submissionId]);
  assert.equal(log.length, 4);
  assert.deepEqual(log.map((l) => Number(l.credits_charged)), [97.5, 97.5, 97.5, 67.5]);
  assert.ok(log.every((l) => l.api_key_id === keyId && l.reviewer_user_id === ADMIN && l.model === MODEL));
  assert.equal(Number(log[0].cost_usd), 0.75, 'the raw gateway cost is logged; the markup is in the credits');
  const analytics = await sql('SELECT 1 FROM paid_usage_analytics WHERE user_id = $1', [ADMIN]);
  assert.equal(analytics.length, 0, 'review usage is not billed as the admin\'s own usage');

  // the verdict charges the metered usage: platform 60 (basic), customer 300, nothing released
  const mark = await toolCall(adminMcp.POST, '/api/admin/qa/mcp', 'qa_mark', { submission_id: submissionId, verdict: 'validated' }, { 'x-api-key': adminKey });
  assert.deepEqual(mark.data.credits, { used: 360, platform_charged: 60, customer_charged: 300, customer_released: 0 });
  assert.equal(await balance(CUSTOMER), 7);
  const [review] = await sql<any>('SELECT cost_credits FROM qa_reviews WHERE submission_id = $1', [submissionId]);
  assert.equal(Number(review.cost_credits), 360);
});

test('partial usage: the customer pays only beyond basic and gets the rest back', async () => {
  await seedBalance(CUSTOMER, 10);
  const { submissionId, key } = await reviewKeyFor(['code_review']);
  gatewayUses(100_000, 50_000);
  await chatWith(key);
  await chatWith(key); // 2 × 97.5 = 195 used
  const mark = await toolCall(adminMcp.POST, '/api/admin/qa/mcp', 'qa_mark', { submission_id: submissionId, verdict: 'requires_changes', reason: 'Add tests' }, { 'x-api-key': adminKey });
  assert.deepEqual(mark.data.credits, { used: 195, platform_charged: 60, customer_charged: 135, customer_released: 165 });
  assert.equal(await balance(CUSTOMER), 8.65);
});

test('a revoked review key (after the verdict) is rejected with 403', async () => {
  const { submissionId, key } = await reviewKeyFor(null);
  await toolCall(adminMcp.POST, '/api/admin/qa/mcp', 'qa_mark', { submission_id: submissionId, verdict: 'validated' }, { 'x-api-key': adminKey });
  gatewayUses(10, 10);
  const r = await chatWith(key);
  assert.equal(r.status, 403);
  assert.match(r.body.error, /revoked/i);
  assert.equal(streamState.calls.length, 0);
});

test('an expired review key is rejected with 403', async () => {
  const { keyId, key } = await reviewKeyFor(null);
  await sql("UPDATE api_keys SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [keyId]);
  gatewayUses(10, 10);
  const r = await chatWith(key);
  assert.equal(r.status, 403);
  assert.match(r.body.error, /expired/i);
  assert.equal(streamState.calls.length, 0);
});

test('normal device keys still bill the key owner exactly as before', async () => {
  const user = 'user_bill_device';
  const key = await seedDeviceKey(user, 'pro');
  await seedBalance(user, 2);
  gatewayUses(100_000, 50_000);
  const r = await chatWith(key);
  assert.equal(r.status, 200);
  assert.equal(r.body.choices[0].message.content, 'ok');
  assert.equal(await balance(user), 1.25);
  const rows = await sql<any>('SELECT * FROM paid_usage_analytics WHERE user_id = $1', [user]);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].cost_deducted), 0.75);

  await seedBalance(user, 0);
  const broke = await chatWith(key);
  assert.equal(broke.status, 402);
  assert.equal(broke.body.error, 'Insufficient balance');
});

test('CREDIT_MARKUP overrides the markup on review usage', async () => {
  await seedBalance(CUSTOMER, 10);
  const { submissionId, key } = await reviewKeyFor(['code_review']);
  process.env.CREDIT_MARKUP = '1';
  try {
    gatewayUses(100_000, 50_000);
    assert.equal((await chatWith(key)).status, 200);
    assert.equal(await usedCredits(submissionId), 75);
  } finally {
    delete process.env.CREDIT_MARKUP;
  }
});

test('a review call is capped in output tokens and refused with 402 when the reserve cannot cover its estimate', async () => {
  const { submissionId, key } = await reviewKeyFor(null); // cap 60 (basic)
  gatewayUses(10, 10);
  assert.equal((await chatWith(key)).status, 200);
  assert.equal(streamState.calls.at(-1)?.maxOutputTokens, 8192, 'review calls get an output cap');

  // worst case for this request: ~10 input tokens + 8192 output on gpt-4o ($10/1M) × 1.3 ≈ 10.7 credits
  await sql('UPDATE qa_requests SET used_credits = 55 WHERE subject_id = $1', [submissionId]);
  const calls = streamState.calls.length;
  const r = await chatWith(key);
  assert.equal(r.status, 402, JSON.stringify(r.body));
  assert.equal(r.body.code, 'qa_reserve_insufficient');
  assert.equal(r.body.available_credits, 5);
  assert.ok(r.body.estimate_credits > 5 && r.body.estimate_credits < 12, String(r.body.estimate_credits));
  assert.equal(streamState.calls.length, calls, 'the gateway is not called');
  assert.equal(await usedCredits(submissionId), 55);
});

test('in-flight holds count against the reserve; expired holds do not', async () => {
  const { submissionId, key, keyId } = await reviewKeyFor(null); // cap 60
  const [req] = await sql<{ id: string }>('SELECT id FROM qa_requests WHERE subject_id = $1', [submissionId]);
  await sql(
    `INSERT INTO qa_credit_holds (qa_request_id, api_key_id, credits, expires_at) VALUES ($1, $2, 55, NOW() + INTERVAL '5 minutes')`,
    [req.id, keyId],
  );
  gatewayUses(10, 10);
  const blocked = await chatWith(key);
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.code, 'qa_reserve_insufficient');
  assert.equal(blocked.body.held_credits, 55);

  await sql(`UPDATE qa_credit_holds SET expires_at = NOW() - INTERVAL '1 second' WHERE qa_request_id = $1`, [req.id]);
  assert.equal((await chatWith(key)).status, 200, 'an expired hold (a crashed call) no longer blocks the reserve');
  assert.equal((await sql('SELECT 1 FROM qa_credit_holds WHERE qa_request_id = $1', [req.id])).length, 0);
});

test('concurrent holds on one reserve never add up to more than what is left', async () => {
  const { submissionId, keyId } = await reviewKeyFor(null); // cap 60
  await sql('UPDATE qa_requests SET used_credits = 35 WHERE subject_id = $1', [submissionId]); // 25 left
  const results = await Promise.all(
    Array.from({ length: 6 }, () => sql<{ r: { ok: boolean } }>('SELECT qa_hold_credits($1, 10) AS r', [keyId])),
  );
  const granted = results.filter(([row]) => row.r.ok).length;
  assert.equal(granted, 2);
  const [{ held }] = await sql<{ held: string }>(
    `SELECT COALESCE(SUM(h.credits), 0)::text AS held FROM qa_credit_holds h JOIN qa_requests q ON q.id = h.qa_request_id WHERE q.subject_id = $1`,
    [submissionId],
  );
  assert.equal(Number(held), 20);
});
