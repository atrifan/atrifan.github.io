import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { installMocks, resetDb, sql, seedBalance, notifyState, clerkState, call } from './helpers';
import { seedActiveContract, seedContact, balance, contractStatus, type SeededContract } from './qa-helpers';
import { startFakeGithub, FAKE_TOKENS, FAKE_REPOS, FAKE_SHA_HEAD, type FakeGithub } from '../support/fake-github';

/**
 * The hub /admin/qa page's thin routes over src/lib/qa/qa-review-service.ts, signed in with
 * a Clerk session (auth() is mocked):
 *   GET  /api/admin/qa/queue?status=&limit=
 *   GET  /api/admin/qa/submissions/:id
 *   POST /api/admin/qa/submissions/:id/credentials
 *   POST /api/admin/qa/submissions/:id/verdict   { verdict, reason }
 * Signed out → 401, signed-in non-admin → 403, bad id → 400, unknown id → 404.
 */
installMocks();

process.env.PAT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.ADMIN_EMAILS = 'qa-admin@test.local';
process.env.ADMIN_USER_IDS = '';

let queue: typeof import('../../app/api/admin/qa/queue/route');
let detail: typeof import('../../app/api/admin/qa/submissions/[id]/route');
let credentials: typeof import('../../app/api/admin/qa/submissions/[id]/credentials/route');
let verdict: typeof import('../../app/api/admin/qa/submissions/[id]/verdict/route');
let tools: typeof import('../../src/lib/jobs/mcp/tools/submission');
let github: FakeGithub;

const ADMIN = 'user_qaui_admin'; // admin by email
const ROLE_ADMIN = 'user_qaui_role'; // admin by publicMetadata.role
const CUSTOMER = 'user_qaui_cust';
const PROVIDER = 'user_qaui_prov';

before(async () => {
  await resetDb();
  github = await startFakeGithub();
  process.env.GITHUB_API_BASE = github.url;
  queue = await import('../../app/api/admin/qa/queue/route');
  detail = await import('../../app/api/admin/qa/submissions/[id]/route');
  credentials = await import('../../app/api/admin/qa/submissions/[id]/credentials/route');
  verdict = await import('../../app/api/admin/qa/submissions/[id]/verdict/route');
  tools = await import('../../src/lib/jobs/mcp/tools/submission');
  clerkState.users.set(ADMIN, { emailAddresses: [{ emailAddress: 'QA-Admin@test.local' }], publicMetadata: {} });
  clerkState.users.set(ROLE_ADMIN, { emailAddresses: [{ emailAddress: 'r@test.local' }], publicMetadata: { role: 'admin' } });
  clerkState.users.set(CUSTOMER, { emailAddresses: [{ emailAddress: 'cust@test.local' }], publicMetadata: { role: 'customer' } });
  clerkState.users.set(PROVIDER, { emailAddresses: [{ emailAddress: 'prov@test.local' }], publicMetadata: {} });
  await seedContact(PROVIDER, 'Pat Provider', 'prov@test.local');
  await seedContact(CUSTOMER, 'Cara Customer', 'cust@test.local');
});

after(async () => {
  await github.close();
  delete process.env.GITHUB_API_BASE;
  await resetDb();
});

let c: SeededContract;
let submissionId: string;

async function freshSubmission(qaChecks: string[] | null = null): Promise<void> {
  c = await seedActiveContract({ customer: CUSTOMER, provider: PROVIDER, qaChecks, title: `QA UI ${randomBytes(3).toString('hex')}` });
  const out = await tools.send_project.handler(
    { userId: PROVIDER, principalId: null, agentIdentityId: null },
    { contract_id: c.contractId, git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good },
  );
  submissionId = out.submission.id;
  notifyState.sent.length = 0;
}

beforeEach(() => {
  notifyState.sent.length = 0;
});

const getQueue = (user: string | null, qs = '') => call(queue.GET, { url: `/api/admin/qa/queue${qs}`, user });
const getDetail = (user: string | null, id: string) =>
  call(detail.GET, { url: `/api/admin/qa/submissions/${id}`, params: { id }, user });
const postCreds = (user: string | null, id: string) =>
  call(credentials.POST, { method: 'POST', url: `/api/admin/qa/submissions/${id}/credentials`, params: { id }, user });
const postVerdict = (user: string | null, id: string, body: unknown) =>
  call(verdict.POST, { method: 'POST', url: `/api/admin/qa/submissions/${id}/verdict`, params: { id }, body, user });

test('signed out → 401 on every route', async () => {
  const id = randomUUID();
  for (const r of [await getQueue(null), await getDetail(null, id), await postCreds(null, id), await postVerdict(null, id, { verdict: 'validated' })]) {
    assert.equal(r.status, 401);
    assert.equal(r.body.error, 'unauthorized');
  }
});

test('a signed-in non-admin → 403 on every route, and nothing is revealed or audited', async () => {
  await freshSubmission();
  for (const user of [CUSTOMER, PROVIDER]) {
    for (const r of [
      await getQueue(user),
      await getDetail(user, submissionId),
      await postCreds(user, submissionId),
      await postVerdict(user, submissionId, { verdict: 'validated' }),
    ]) {
      assert.equal(r.status, 403);
      assert.equal(r.body.error, 'forbidden');
      assert.ok(!JSON.stringify(r.body).includes(FAKE_TOKENS.good));
    }
  }
  const audit = await sql("SELECT 1 FROM audit_events WHERE subject_id = $1 AND action IN ('qa_credentials_get','qa_verdict')", [submissionId]);
  assert.equal(audit.length, 0);
  const [sub] = await sql<any>('SELECT status FROM submissions WHERE id = $1', [submissionId]);
  assert.equal(sub.status, 'awaiting_qa');
});

test('queue: lists awaiting submissions with price, commission, plans and attempt; status filters', async () => {
  await seedBalance(CUSTOMER, 3);
  await freshSubmission(['code_review']);
  const q = await getQueue(ADMIN);
  assert.equal(q.status, 200);
  const item = q.body.items.find((i: { submission_id: string }) => i.submission_id === submissionId);
  assert.ok(item, 'listed');
  assert.equal(item.price_cents, 30000);
  assert.equal(item.commission_cents, 4500);
  assert.equal(item.attempt, 1);
  assert.equal(item.provider.name, 'Pat Provider');
  assert.equal(item.customer.plan, 'free');
  assert.deepEqual(item.checks, ['basic', 'code_review']);
  assert.ok(!JSON.stringify(q.body).includes(FAKE_TOKENS.good));

  const byRole = await getQueue(ROLE_ADMIN, '?status=in_review&limit=5');
  assert.equal(byRole.status, 200);
  assert.ok(!byRole.body.items.some((i: { submission_id: string }) => i.submission_id === submissionId));

  const bad = await getQueue(ADMIN, '?status=bogus');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'invalid_request');
  const badLimit = await getQueue(ADMIN, '?limit=abc');
  assert.equal(badLimit.status, 400);
});

test('detail: the full context without the PAT; bad id 400; unknown id 404', async () => {
  await freshSubmission();
  const d = await getDetail(ADMIN, submissionId);
  assert.equal(d.status, 200);
  assert.equal(d.body.submission.id, submissionId);
  assert.equal(d.body.contract.id, c.contractId);
  assert.deepEqual(d.body.spec.acceptance_criteria, ['The sample file imports with zero errors']);
  assert.ok(!JSON.stringify(d.body).includes(FAKE_TOKENS.good));

  assert.equal((await getDetail(ADMIN, 'not-a-uuid')).status, 400);
  const missing = await getDetail(ADMIN, randomUUID());
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'not_found');
});

test('credentials: decrypted PAT + review key, submission moves to in_review, audited once per reveal', async () => {
  await freshSubmission();
  const r = await postCreds(ADMIN, submissionId);
  assert.equal(r.status, 200);
  assert.equal(r.body.pat_token, FAKE_TOKENS.good);
  assert.equal(r.body.commit_sha, FAKE_SHA_HEAD);
  assert.equal(r.body.repo_url, `https://github.com/${FAKE_REPOS.private}`);
  assert.match(r.body.review_key.key, /^ak_/);
  const [sub] = await sql<any>('SELECT status FROM submissions WHERE id = $1', [submissionId]);
  assert.equal(sub.status, 'in_review');
  const audit = await sql<any>("SELECT actor_user_id FROM audit_events WHERE action = 'qa_credentials_get' AND subject_id = $1", [submissionId]);
  assert.deepEqual(audit.map((a) => a.actor_user_id), [ADMIN]);

  assert.equal((await postCreds(ADMIN, randomUUID())).status, 404);
  assert.equal((await postCreds(ADMIN, 'x')).status, 400);
});

test('verdict: rejected needs a reason (422); then it is recorded and the contract moves', async () => {
  await seedBalance(CUSTOMER, 3);
  await freshSubmission(['code_review']);
  const noReason = await postVerdict(ADMIN, submissionId, { verdict: 'rejected' });
  assert.equal(noReason.status, 422);
  assert.equal(noReason.body.error, 'reason_required');
  const badVerdict = await postVerdict(ADMIN, submissionId, { verdict: 'maybe', reason: 'x' });
  assert.equal(badVerdict.status, 400);
  const notJson = await postVerdict(ADMIN, submissionId, '{nope');
  assert.equal(notJson.status, 400);

  const ok = await postVerdict(ADMIN, submissionId, { verdict: 'rejected', reason: 'Tests fail' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.submission_status, 'rejected');
  assert.equal(ok.body.review.verdict, 'rejected');
  assert.equal(ok.body.review.reason, 'Tests fail');
  assert.equal(await contractStatus(c.contractId), ok.body.contract_status);
  const [review] = await sql<any>('SELECT reviewer_user_id FROM qa_reviews WHERE submission_id = $1', [submissionId]);
  assert.equal(review.reviewer_user_id, ADMIN);
  assert.ok(notifyState.sent.some((n) => n.type === 'qa_verdict' && n.userId === CUSTOMER));
  assert.ok((await balance(CUSTOMER)) !== null);

  const again = await postVerdict(ADMIN, submissionId, { verdict: 'validated' });
  assert.equal(again.status, 409);
  assert.equal((await postVerdict(ADMIN, randomUUID(), { verdict: 'validated' })).status, 404);
});

test('the URL id wins over a submission_id in the body', async () => {
  await freshSubmission();
  const other = randomUUID();
  const r = await postVerdict(ADMIN, other, { verdict: 'validated', submission_id: submissionId });
  assert.equal(r.status, 404);
  const [sub] = await sql<any>('SELECT status FROM submissions WHERE id = $1', [submissionId]);
  assert.equal(sub.status, 'awaiting_qa');
});
