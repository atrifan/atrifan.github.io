import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { installMocks, resetDb, sql, seedBalance, notifyState, clerkState } from './helpers';
import {
  seedActiveContract, seedDeviceKey, seedContact, balance, contractStatus, toolCall, rpc, type SeededContract,
} from './qa-helpers';
import { startFakeGithub, FAKE_TOKENS, FAKE_REPOS, FAKE_SHA_HEAD, type FakeGithub } from '../support/fake-github';

installMocks();

process.env.PAT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.ADMIN_EMAILS = 'qa-admin@test.local';
process.env.ADMIN_USER_IDS = '';

let route: typeof import('../../app/api/admin/qa/mcp/route');
let tools: typeof import('../../src/lib/jobs/mcp/tools/submission');
let github: FakeGithub;

const URL = '/api/admin/qa/mcp';
const ADMIN = 'user_qa_admin';          // admin by email
const ROLE_ADMIN = 'user_qa_role_admin'; // admin by publicMetadata.role
const CUSTOMER = 'user_qa_cust';
const PROVIDER = 'user_qa_prov';
const STRANGER = 'user_qa_nobody';
const ROLE_TOKEN = 'eyJ.role-admin.session';

let adminKey: string;
let providerKey: string;
let customerKey: string;

const H = (key: string) => ({ 'x-api-key': key });
const ctx = (userId: string) => ({ userId, principalId: null, agentIdentityId: null });

before(async () => {
  await resetDb();
  github = await startFakeGithub();
  process.env.GITHUB_API_BASE = github.url;
  route = await import('../../app/api/admin/qa/mcp/route');
  tools = await import('../../src/lib/jobs/mcp/tools/submission');
  clerkState.users.set(ADMIN, { emailAddresses: [{ emailAddress: 'QA-Admin@test.local' }], publicMetadata: {} });
  clerkState.users.set(ROLE_ADMIN, { emailAddresses: [{ emailAddress: 'role@test.local' }], publicMetadata: { role: 'admin' } });
  clerkState.users.set(PROVIDER, { emailAddresses: [{ emailAddress: 'prov@test.local' }], publicMetadata: {} });
  clerkState.users.set(CUSTOMER, { emailAddresses: [{ emailAddress: 'cust@test.local' }], publicMetadata: { role: 'customer' } });
  clerkState.tokens.set(ROLE_TOKEN, ROLE_ADMIN);
  adminKey = await seedDeviceKey(ADMIN, 'super');
  providerKey = await seedDeviceKey(PROVIDER, 'plus');
  customerKey = await seedDeviceKey(CUSTOMER, 'free');
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
  c = await seedActiveContract({ customer: CUSTOMER, provider: PROVIDER, qaChecks, title: `Admin QA ${randomBytes(3).toString('hex')}` });
  const out = await tools.send_project.handler(ctx(PROVIDER), { contract_id: c.contractId, git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good });
  submissionId = out.submission.id;
  notifyState.sent.length = 0; // keep only what the step under test sends
}

beforeEach(() => {
  notifyState.sent.length = 0;
});

const admin = (name: string, args: Record<string, unknown>) => toolCall(route.POST, URL, name, args, H(adminKey));

test('no credentials → 401 JSON-RPC error', async () => {
  const r = await rpc(route.POST, URL, 'tools/list', {}, {});
  assert.equal(r.status, 401);
  assert.equal(r.body.error.code, -32001);
});

test('an unknown or revoked key → 401', async () => {
  const r = await rpc(route.POST, URL, 'tools/list', {}, H('ak_NOTAKEY'));
  assert.equal(r.status, 401);
  const revoked = await seedDeviceKey(ADMIN);
  await sql('UPDATE api_keys SET is_active = FALSE WHERE api_key_hash = $1', [createHash('sha256').update(revoked).digest('hex')]);
  assert.equal((await rpc(route.POST, URL, 'tools/list', {}, H(revoked))).status, 401);
});

test('a non-admin sees no tools and cannot call any', async () => {
  for (const key of [providerKey, customerKey]) {
    const list = await rpc(route.POST, URL, 'tools/list', {}, H(key));
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.result.tools, []);
    for (const name of ['qa_queue_list', 'qa_submission_get', 'qa_credentials_get', 'qa_mark']) {
      const r = await toolCall(route.POST, URL, name, { submission_id: '00000000-0000-4000-8000-000000000000', verdict: 'validated' }, H(key));
      assert.equal(r.status, 403);
      assert.equal(r.body.error.code, -32003);
      assert.equal(r.body.result, undefined);
    }
  }
});

test('admins by email (API key) and by Clerk role (bearer) see the four tools', async () => {
  const init = await rpc(route.POST, URL, 'initialize', { protocolVersion: '2025-06-18' }, H(adminKey));
  assert.equal(init.status, 200);
  assert.ok(init.body.result.serverInfo.name);
  for (const headers of [H(adminKey), { authorization: `Bearer ${ROLE_TOKEN}` }, { authorization: `Bearer ${adminKey}` }]) {
    const list = await rpc(route.POST, URL, 'tools/list', {}, headers);
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.deepEqual(list.body.result.tools.map((t: { name: string }) => t.name), ['qa_queue_list', 'qa_submission_get', 'qa_credentials_get', 'qa_mark']);
  }
  const bad = await rpc(route.POST, URL, 'tools/list', {}, { authorization: 'Bearer eyJ.unknown' });
  assert.equal(bad.status, 401);
  const unknown = await rpc(route.POST, URL, 'nope/method', {}, H(adminKey));
  assert.equal(unknown.body.error.code, -32601);
});

test('queue → detail → credentials: PAT decrypted, review key issued, audit row written', async () => {
  await seedBalance(CUSTOMER, 3); // exactly the code_review reserve
  await freshSubmission(['code_review']);
  assert.equal(await balance(CUSTOMER), 0);

  const q = await admin('qa_queue_list', { limit: 50 });
  assert.equal(q.status, 200);
  const item = q.data.items.find((i: { submission_id: string }) => i.submission_id === submissionId);
  assert.ok(item, 'submission listed');
  assert.equal(item.status, 'awaiting_qa');
  assert.equal(item.contract_id, c.contractId);
  assert.match(item.job_title, /^Admin QA/);
  assert.equal(item.attempt, 1);
  assert.equal(item.price_cents, 30000);
  assert.equal(item.commission_cents, 4500);
  assert.equal(item.commission_bps, 1500);
  assert.equal(item.customer_total_cents, 34500);
  assert.equal(item.currency, 'eur');
  assert.deepEqual(item.provider, { user_id: PROVIDER, name: 'Pat Provider', email: 'prov@test.local', plan: 'plus' });
  assert.deepEqual(item.customer, { user_id: CUSTOMER, name: 'Cara Customer', email: 'cust@test.local', plan: 'free' });
  assert.deepEqual(item.checks, ['basic', 'code_review']);
  assert.ok(item.submitted_at);
  assert.ok(!q.text.includes(FAKE_TOKENS.good));
  const inReview = await admin('qa_queue_list', { status: 'in_review', limit: 50 });
  assert.ok(!inReview.data.items.some((i: { submission_id: string }) => i.submission_id === submissionId));

  const d = await admin('qa_submission_get', { submission_id: submissionId });
  assert.equal(d.data.submission.id, submissionId);
  assert.equal(d.data.contract.id, c.contractId);
  assert.equal(d.data.contract_version.version, 1);
  assert.deepEqual(d.data.contract_version.qa_checks, ['code_review']);
  assert.equal(d.data.contract_version.steering_allowance, 2);
  assert.deepEqual(d.data.spec.acceptance_criteria, ['The sample file imports with zero errors']);
  assert.equal(d.data.parties.provider.plan, 'plus');
  assert.equal(d.data.parties.customer.plan, 'free');
  assert.deepEqual(d.data.qa, { checks: ['basic', 'code_review'], reserved_credits: 300, platform_credits: 60, used_credits: 0, status: 'reserved' });
  assert.deepEqual(d.data.steering_history, []);
  assert.deepEqual(d.data.previous_reviews, []);
  assert.ok(!d.text.includes(FAKE_TOKENS.good));
  const missing = await admin('qa_submission_get', { submission_id: '00000000-0000-4000-8000-000000000000' });
  assert.equal(missing.body.result.isError, true);
  assert.equal(missing.data.error, 'not_found');

  const cred = await admin('qa_credentials_get', { submission_id: submissionId });
  assert.equal(cred.status, 200);
  assert.equal(cred.data.repo_full_name, FAKE_REPOS.private);
  assert.equal(cred.data.repo_url, `https://github.com/${FAKE_REPOS.private}`);
  assert.equal(cred.data.commit_sha, FAKE_SHA_HEAD);
  assert.equal(cred.data.pat_token, FAKE_TOKENS.good);
  const key = cred.data.review_key;
  assert.match(key.key, /^ak_/);
  assert.equal(key.cap_credits, 360);
  assert.match(key.chat_url, /\/api\/chat$/);
  const hours = (Date.parse(key.expires_at) - Date.now()) / 3_600_000;
  assert.ok(hours > 23.9 && hours <= 24, `expires in ${hours}h`);

  const [row] = await sql<any>('SELECT * FROM api_keys WHERE id = $1', [key.key_id]);
  assert.equal(row.purpose, 'qa_review');
  assert.equal(row.user_id, ADMIN);
  assert.equal(row.submission_id, submissionId);
  assert.equal(Number(row.cap_credits), 360);
  assert.equal(row.is_active, true);
  assert.equal(row.api_key_hash, createHash('sha256').update(key.key).digest('hex'));
  assert.equal(row.api_key, null, 'plaintext review key is not stored');
  assert.notEqual(row.server_name, 'default');

  const audit = await sql<any>("SELECT * FROM audit_events WHERE action = 'qa_credentials_get' AND subject_id = $1", [submissionId]);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_user_id, ADMIN);
  assert.equal(audit[0].subject_type, 'submission');
  assert.equal(audit[0].metadata.review_key_id, key.key_id);
  assert.ok(!JSON.stringify(audit).includes(FAKE_TOKENS.good));
  assert.ok(!JSON.stringify(audit).includes(key.key));

  const [sub] = await sql<any>('SELECT status FROM submissions WHERE id = $1', [submissionId]);
  assert.equal(sub.status, 'in_review');

  // a second call issues a new key, revokes the old one and writes another audit row
  const again = await admin('qa_credentials_get', { submission_id: submissionId });
  assert.notEqual(again.data.review_key.key, key.key);
  const [old] = await sql<any>('SELECT is_active, revoked_at FROM api_keys WHERE id = $1', [key.key_id]);
  assert.equal(old.is_active, false);
  assert.ok(old.revoked_at);
  const audits = await sql("SELECT 1 FROM audit_events WHERE action = 'qa_credentials_get' AND subject_id = $1", [submissionId]);
  assert.equal(audits.length, 2);

  // the review key cannot be used to authenticate to the admin MCP
  const viaReviewKey = await rpc(route.POST, URL, 'tools/list', {}, H(again.data.review_key.key));
  assert.equal(viaReviewKey.status, 401);
});

test('a non-admin cannot read credentials, and no audit row is written', async () => {
  await freshSubmission();
  for (const key of [providerKey, customerKey]) {
    const r = await toolCall(route.POST, URL, 'qa_credentials_get', { submission_id: submissionId }, H(key));
    assert.equal(r.body.error.code, -32003);
    assert.ok(!r.text.includes(FAKE_TOKENS.good));
  }
  const audit = await sql("SELECT 1 FROM audit_events WHERE action = 'qa_credentials_get' AND subject_id = $1", [submissionId]);
  assert.equal(audit.length, 0);
});

test('credentials are refused once the PAT has been purged', async () => {
  await freshSubmission();
  await sql('UPDATE submissions SET pat_ciphertext = NULL, pat_iv = NULL, pat_tag = NULL, pat_purged_at = NOW() WHERE id = $1', [submissionId]);
  const r = await admin('qa_credentials_get', { submission_id: submissionId });
  assert.equal(r.body.result.isError, true);
  assert.equal(r.data.error, 'pat_purged');
  const keys = await sql("SELECT 1 FROM api_keys WHERE submission_id = $1", [submissionId]);
  assert.equal(keys.length, 0);
});

test('qa_mark requires a reason for requires_changes and rejected, and a known verdict', async () => {
  await freshSubmission();
  for (const [verdict, reason] of [['requires_changes', undefined], ['rejected', '   ']] as const) {
    const r = await admin('qa_mark', { submission_id: submissionId, verdict, reason });
    assert.equal(r.data.error, 'reason_required');
  }
  const bad = await admin('qa_mark', { submission_id: submissionId, verdict: 'pass', reason: 'x' });
  assert.equal(bad.data.error, 'invalid_request');
  assert.equal(await contractStatus(c.contractId), 'in_qa');
  const reviews = await sql('SELECT 1 FROM qa_reviews WHERE submission_id = $1', [submissionId]);
  assert.equal(reviews.length, 0);
});

test('validated: delivered, delivery unlocked, auto-accept set, key revoked, reserve released, both parties notified', async () => {
  await seedBalance(CUSTOMER, 5);
  await freshSubmission(['code_review']);
  assert.equal(await balance(CUSTOMER), 2);
  const cred = await admin('qa_credentials_get', { submission_id: submissionId });
  const r = await admin('qa_mark', {
    submission_id: submissionId, verdict: 'validated', reason: 'Meets the spec', report_md: '# PASS\nAll criteria met.',
    findings: [{ severity: 'info', title: 'Nice tests' }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.data.submission_status, 'validated');
  assert.equal(r.data.contract_status, 'delivered');
  assert.deepEqual(r.data.credits, { used: 0, platform_charged: 0, customer_charged: 0, customer_released: 300 });
  assert.equal(r.data.review.verdict, 'validated');

  assert.equal(await contractStatus(c.contractId), 'delivered');
  const [job] = await sql<any>('SELECT status FROM jobs WHERE id = $1', [c.jobId]);
  assert.equal(job.status, 'delivered');
  const [sub] = await sql<any>('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  assert.equal(sub.status, 'validated');
  assert.ok(sub.delivery_unlocked_at);
  const days = (Date.parse(sub.auto_accept_at) - Date.now()) / 86_400_000;
  assert.ok(days > 6.9 && days < 7.1);
  const [key] = await sql<any>('SELECT is_active, revoked_at FROM api_keys WHERE id = $1', [cred.data.review_key.key_id]);
  assert.equal(key.is_active, false);
  assert.ok(key.revoked_at);
  const [req] = await sql<any>("SELECT * FROM qa_requests WHERE subject_id = $1", [submissionId]);
  assert.equal(req.status, 'settled');
  assert.equal(Number(req.charged_credits), 0);
  assert.equal(Number(req.released_credits), 300);
  assert.equal(await balance(CUSTOMER), 5);

  const types = notifyState.sent.map((n) => `${n.userId}:${n.type}`).sort();
  assert.deepEqual(types, [`${CUSTOMER}:delivery_ready`, `${CUSTOMER}:qa_verdict`, `${PROVIDER}:qa_verdict`]);
  assert.equal(notifyState.sent.find((n) => n.type === 'qa_verdict')!.payload.verdict, 'pass');
  const actions = (await sql<any>('SELECT action FROM audit_events WHERE subject_id = $1 ORDER BY id', [submissionId])).map((a) => a.action);
  assert.ok(actions.includes('qa_verdict'));
  assert.ok(actions.includes('delivery_unlocked'));

  // both parties can read the report; strangers cannot
  for (const user of [CUSTOMER, PROVIDER]) {
    const rep = await tools.qa_report_get.handler(ctx(user), { review_id: r.data.review.id });
    assert.equal(rep.review.report_md, '# PASS\nAll criteria met.');
    assert.equal(rep.review.verdict, 'validated');
    assert.equal(rep.review.attempt, 1);
    assert.equal(rep.review.commit_sha, FAKE_SHA_HEAD);
    assert.deepEqual(rep.review.findings, [{ severity: 'info', title: 'Nice tests' }]);
  }
  await assert.rejects(tools.qa_report_get.handler(ctx(STRANGER), { review_id: r.data.review.id }), (e: any) => e.code === 'not_found');
  const status = await tools.qa_status.handler(ctx(PROVIDER), { contract_id: c.contractId });
  assert.equal(status.latest_review!.verdict, 'validated');
  assert.equal(status.can_resubmit, false);

  const twice = await admin('qa_mark', { submission_id: submissionId, verdict: 'validated' });
  assert.equal(twice.data.error, 'invalid_state');
});

test('requires_changes: rework, provider sees the reason, resubmission is attempt 2, steering untouched', async () => {
  await freshSubmission();
  const r = await admin('qa_mark', { submission_id: submissionId, verdict: 'requires_changes', reason: 'The importer crashes on empty files' });
  assert.equal(r.data.contract_status, 'rework');
  assert.equal(r.data.submission_status, 'requires_changes');
  assert.equal(await contractStatus(c.contractId), 'rework');
  const [v] = await sql<any>('SELECT steering_allowance FROM contract_versions WHERE id = $1', [c.versionId]);
  assert.equal(v.steering_allowance, 2);
  const [job] = await sql<any>('SELECT status FROM jobs WHERE id = $1', [c.jobId]);
  assert.equal(job.status, 'in_progress');

  const s = await tools.qa_status.handler(ctx(PROVIDER), { contract_id: c.contractId });
  assert.equal(s.latest_review!.verdict, 'requires_changes');
  assert.equal(s.latest_review!.reason, 'The importer crashes on empty files');
  assert.equal(s.can_resubmit, true);
  assert.equal(notifyState.sent.find((n) => n.userId === PROVIDER)!.payload.verdict, 'needs_changes');

  const again = await tools.send_project.handler(ctx(PROVIDER), { contract_id: c.contractId, git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good });
  assert.equal(again.submission.attempt, 2);
  assert.equal(again.contract_status, 'in_qa');
  const d = await admin('qa_submission_get', { submission_id: again.submission.id });
  assert.equal(d.data.previous_reviews.length, 1);
  assert.equal(d.data.previous_reviews[0].reason, 'The importer crashes on empty files');
  assert.equal(d.data.previous_reviews[0].attempt, 1);

  const second = await admin('qa_mark', { submission_id: again.submission.id, verdict: 'validated' });
  const [rev] = await sql<any>('SELECT supersedes_review_id FROM qa_reviews WHERE id = $1', [second.data.review.id]);
  assert.equal(rev.supersedes_review_id, r.data.review.id);
});

test('rejected: disputed with a pending full refund, QA-failure trust mark, no resubmission', async () => {
  await freshSubmission();
  const r = await admin('qa_mark', { submission_id: submissionId, verdict: 'rejected', reason: 'Not the requested software', report_md: 'FAIL' });
  assert.equal(r.data.contract_status, 'disputed');
  assert.equal(await contractStatus(c.contractId), 'disputed');
  const [job] = await sql<any>('SELECT status FROM jobs WHERE id = $1', [c.jobId]);
  assert.equal(job.status, 'disputed');
  const [dispute] = await sql<any>("SELECT * FROM audit_events WHERE action = 'dispute_opened' AND subject_id = $1", [c.contractId]);
  assert.equal(dispute.subject_type, 'contract');
  assert.equal(dispute.metadata.default_resolution, 'full_refund');
  assert.equal(dispute.metadata.resolution_status, 'pending_admin_confirmation');
  assert.equal(dispute.metadata.submission_id, submissionId);
  const [mark] = await sql<any>("SELECT * FROM audit_events WHERE action = 'trust_qa_failure'");
  assert.equal(mark.subject_type, 'principal');
  assert.equal(mark.subject_id, c.providerPrincipalId);
  assert.equal(mark.metadata.contract_id, c.contractId);
  const s = await tools.qa_status.handler(ctx(PROVIDER), { contract_id: c.contractId });
  assert.equal(s.can_resubmit, false);
  await assert.rejects(
    tools.send_project.handler(ctx(PROVIDER), { contract_id: c.contractId, git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good }),
    (e: any) => e.code === 'invalid_state',
  );
  assert.equal(notifyState.sent.find((n) => n.userId === CUSTOMER)!.payload.verdict, 'fail');
});
