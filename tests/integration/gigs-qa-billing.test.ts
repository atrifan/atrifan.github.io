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

test('a review key bills the customer reserve, not the admin; stops at the cap with 402', async () => {
  await seedBalance(CUSTOMER, 10);
  await seedBalance(ADMIN, 0); // the admin's own balance is not needed and not touched
  const { submissionId, key, keyId } = await reviewKeyFor(['code_review']); // cap 60 + 300
  assert.equal(await balance(CUSTOMER), 7);

  gatewayUses(100_000, 50_000); // $0.25 + $0.50 = $0.75 = 75 credits per call
  for (let i = 1; i <= 4; i += 1) {
    const r = await chatWith(key);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(await usedCredits(submissionId), 75 * i);
  }
  const last = await chatWith(key); // only 60 left: clamped
  assert.equal(last.status, 200);
  assert.equal(await usedCredits(submissionId), 360);

  const capped = await chatWith(key);
  assert.equal(capped.status, 402);
  assert.equal(capped.body.code, 'qa_reserve_exhausted');
  assert.match(capped.body.error, /reserve/i);
  assert.equal(capped.body.cap_credits, 360);
  assert.equal(capped.body.used_credits, 360);
  assert.equal(streamState.calls.length, 5, 'the gateway is not called once the cap is reached');

  assert.equal(await balance(ADMIN), 0);
  assert.equal(await balance(CUSTOMER), 7);
  const log = await sql<any>('SELECT * FROM qa_usage_log WHERE submission_id = $1 ORDER BY id', [submissionId]);
  assert.equal(log.length, 5);
  assert.deepEqual(log.map((l) => Number(l.credits_charged)), [75, 75, 75, 75, 60]);
  assert.ok(log.every((l) => l.api_key_id === keyId && l.reviewer_user_id === ADMIN && l.model === MODEL));
  assert.equal(Number(log[0].cost_usd), 0.75);
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
  await chatWith(key); // 150 used
  const mark = await toolCall(adminMcp.POST, '/api/admin/qa/mcp', 'qa_mark', { submission_id: submissionId, verdict: 'requires_changes', reason: 'Add tests' }, { 'x-api-key': adminKey });
  assert.deepEqual(mark.data.credits, { used: 150, platform_charged: 60, customer_charged: 90, customer_released: 210 });
  assert.equal(await balance(CUSTOMER), 9.1);
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
