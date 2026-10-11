import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { installMocks, resetDb, sql, seedBalance, notifyState } from './helpers';
import { seedActiveContract, seedContact, balance, contractStatus, type SeededContract } from './qa-helpers';
import { startFakeGithub, FAKE_TOKENS, FAKE_REPOS, FAKE_SHA_HEAD, FAKE_SHA_OTHER, type FakeGithub } from '../support/fake-github';

installMocks();

process.env.PAT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.ADMIN_USER_IDS = 'user_qa_admin_ids';
process.env.ADMIN_EMAILS = 'qa-admin@test.local';

let tools: typeof import('../../src/lib/jobs/mcp/tools/submission');
let secretBox: typeof import('../../src/lib/crypto/secret-box');
let github: FakeGithub;

const CUSTOMER = 'user_qa_customer';
const PROVIDER = 'user_qa_provider';
const STRANGER = 'user_qa_stranger';

const ctx = (userId: string) => ({ userId, principalId: null, agentIdentityId: null });

async function expectCode(p: Promise<unknown>, code: string): Promise<any> {
  try {
    await p;
  } catch (err) {
    assert.equal((err as { code?: string }).code, code, `expected ${code}, got ${(err as Error).message}`);
    return err;
  }
  assert.fail(`expected error ${code}`);
}

const logs: string[] = [];
const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;

before(async () => {
  await resetDb();
  github = await startFakeGithub();
  process.env.GITHUB_API_BASE = github.url;
  tools = await import('../../src/lib/jobs/mcp/tools/submission');
  secretBox = await import('../../src/lib/crypto/secret-box');
  const capture = (orig: typeof console.log) => (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' '));
    orig(...args);
  };
  console.log = capture(origLog);
  console.error = capture(origErr);
  console.warn = capture(origWarn);
});

after(async () => {
  console.log = origLog;
  console.error = origErr;
  console.warn = origWarn;
  await github.close();
  delete process.env.GITHUB_API_BASE;
  await resetDb();
});

let c: SeededContract;
beforeEach(async () => {
  notifyState.sent.length = 0;
  github.requests.length = 0;
  c = await seedActiveContract({ customer: CUSTOMER, provider: PROVIDER, title: `QA job ${randomBytes(3).toString('hex')}` });
});

function send(args: Record<string, unknown>, user = PROVIDER) {
  return tools.send_project.handler(ctx(user), { contract_id: c.contractId, ...args });
}

async function submissionCount(contractId: string): Promise<number> {
  const [r] = await sql<{ n: string }>('SELECT count(*)::text AS n FROM submissions WHERE contract_id = $1', [contractId]);
  return Number(r.n);
}

test('tool shapes: name, description, JSON schema and handler', () => {
  for (const t of [tools.send_project, tools.qa_status, tools.qa_report_get]) {
    assert.equal(typeof t.name, 'string');
    assert.ok(t.description.length > 40);
    assert.equal(t.inputSchema.type, 'object');
    assert.equal(typeof t.handler, 'function');
  }
  assert.deepEqual(tools.send_project.inputSchema.required, ['contract_id', 'git_repo', 'pat_token']);
  assert.match(tools.send_project.description, /private/i);
  assert.match(tools.send_project.description, /fine-grained/i);
  assert.deepEqual(tools.SUBMISSION_TOOLS.map((t) => t.name), ['send_project', 'qa_status', 'qa_report_get']);
});

test('a public repo is rejected with a clear message; nothing changes', async () => {
  const err = await expectCode(send({ git_repo: FAKE_REPOS.public, pat_token: FAKE_TOKENS.publicRepo }), 'public_repo');
  assert.equal(err.status, 422);
  assert.match(err.message, /private/i);
  assert.match(err.message, /paid/i);
  assert.equal(await contractStatus(c.contractId), 'active');
  assert.equal(await submissionCount(c.contractId), 0);
});

test('a classic PAT is rejected before GitHub is called', async () => {
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.classic }), 'classic_pat');
  assert.equal(github.requests.length, 0);
  assert.equal(await contractStatus(c.contractId), 'active');
});

test('an over-broad PAT (reaches another repo) is rejected', async () => {
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.broad }), 'pat_too_broad');
  assert.ok(github.requests.some((r) => r.path === '/user/repos'));
  assert.equal(await submissionCount(c.contractId), 0);
});

test('admin, long-lived, revoked and unknown-repo tokens are rejected', async () => {
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.admin }), 'pat_admin');
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.longExpiry }), 'pat_expiry_too_long');
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.revoked }), 'invalid_pat');
  await expectCode(send({ git_repo: 'acme/nope', pat_token: FAKE_TOKENS.good }), 'repo_not_accessible');
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good, commit_sha: 'f'.repeat(40) }), 'commit_not_found');
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good, commit_sha: 'main' }), 'invalid_commit_sha');
  await expectCode(send({ git_repo: 'not a repo', pat_token: FAKE_TOKENS.good }), 'invalid_repo');
  await expectCode(send({ git_repo: FAKE_REPOS.private }), 'invalid_request');
  assert.equal(await contractStatus(c.contractId), 'active');
});

test('a token whose repo list cannot be read is rejected as unverifiable', async () => {
  const token = `github_pat_11NOLIST000000000000000_${'n'.repeat(59)}`;
  github.setToken(token, {
    repos: [{ full_name: FAKE_REPOS.private, private: true, permissions: { admin: false, push: false, pull: true }, default_branch: 'main', head_sha: FAKE_SHA_HEAD }],
    expires_in_days: 5,
    user_repos_status: 403,
  });
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: token }), 'scope_unverifiable');
});

test('only the provider may submit; strangers do not learn the contract exists', async () => {
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good }, CUSTOMER), 'forbidden');
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good }, STRANGER), 'not_found');
  await expectCode(
    tools.send_project.handler(ctx(PROVIDER), { contract_id: '00000000-0000-4000-8000-000000000000', git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good }),
    'not_found',
  );
  assert.equal(github.requests.length, 0);
});

test('only an active or rework contract accepts a submission', async () => {
  for (const status of ['pending_payment', 'delivered', 'disputed', 'completed']) {
    await sql('UPDATE contracts SET status = $2 WHERE id = $1', [c.contractId, status]);
    await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good }), 'invalid_state');
  }
});

test('a good private repo is accepted: PAT encrypted, SHA pinned, contract in_qa, parties notified, PAT never echoed or logged', async () => {
  await seedContact(CUSTOMER, 'Cara Customer', 'cara@test.local');
  await seedContact('user_qa_admin_email', 'Ada Admin', 'qa-admin@test.local');
  logs.length = 0;
  const out = await send({ git_repo: `https://github.com/${FAKE_REPOS.private}.git`, pat_token: FAKE_TOKENS.good });
  const text = JSON.stringify(out);
  assert.ok(!text.includes(FAKE_TOKENS.good), 'PAT echoed');
  assert.ok(!logs.join('\n').includes(FAKE_TOKENS.good), 'PAT logged');
  assert.equal(out.submission.attempt, 1);
  assert.equal(out.submission.status, 'awaiting_qa');
  assert.equal(out.submission.repo_full_name, FAKE_REPOS.private);
  assert.equal(out.submission.commit_sha, FAKE_SHA_HEAD);
  assert.equal(out.contract_status, 'in_qa');
  assert.deepEqual(out.qa, { checks: ['basic'], reserved_credits: 0, platform_credits: 60 });
  const days = (Date.parse(out.submission.pat_expires_at!) - Date.now()) / 86_400_000;
  assert.ok(days > 9 && days < 11, `expires in ${days} days`);

  const [row] = await sql<any>('SELECT * FROM submissions WHERE id = $1', [out.submission.id]);
  assert.equal(row.user_id, PROVIDER);
  assert.equal(row.customer_user_id, CUSTOMER);
  assert.equal(row.contract_version_id, c.versionId);
  assert.ok(row.pat_ciphertext && row.pat_iv && row.pat_tag);
  assert.ok(!JSON.stringify(row).includes(FAKE_TOKENS.good), 'PAT stored in clear');
  assert.equal(
    secretBox.open({ ciphertext: row.pat_ciphertext, iv: row.pat_iv, tag: row.pat_tag }, { aad: `submission:${row.id}` }),
    FAKE_TOKENS.good,
  );
  assert.equal(await contractStatus(c.contractId), 'in_qa');

  const [req] = await sql<any>("SELECT * FROM qa_requests WHERE subject_type = 'contract_submission' AND subject_id = $1", [row.id]);
  assert.equal(req.requester_user_id, CUSTOMER);
  assert.deepEqual(req.checks, ['basic']);
  assert.equal(Number(req.platform_credits), 60);
  assert.equal(Number(req.reserved_credits), 0);
  assert.equal(req.status, 'reserved');

  const toCustomer = notifyState.sent.find((n) => n.userId === CUSTOMER && n.type === 'submission_received');
  assert.ok(toCustomer, 'customer notified');
  assert.equal(toCustomer!.payload.contractId, c.contractId);
  const adminIds = notifyState.sent.filter((n) => n.type === 'submission_received' && n.userId !== CUSTOMER).map((n) => n.userId).sort();
  assert.deepEqual(adminIds, ['user_qa_admin_email', 'user_qa_admin_ids']);
  assert.ok(!JSON.stringify(notifyState.sent).includes(FAKE_TOKENS.good));

  const audit = await sql<any>("SELECT * FROM audit_events WHERE action = 'submission_created' AND subject_id = $1", [row.id]);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_user_id, PROVIDER);
});

test('an explicit commit_sha (short form) is pinned to the full SHA', async () => {
  const out = await send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good, commit_sha: FAKE_SHA_OTHER.slice(0, 7) });
  assert.equal(out.submission.commit_sha, FAKE_SHA_OTHER);
});

test('a contract already in QA refuses a second submission', async () => {
  await send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good });
  await expectCode(send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good }), 'invalid_state');
  assert.equal(await submissionCount(c.contractId), 1);
});

test('deeper checks reserve the customer credits; basic stays on the platform', async () => {
  const deep = await seedActiveContract({ customer: CUSTOMER, provider: PROVIDER, qaChecks: ['code_review', 'security', 'bogus'] });
  await seedBalance(CUSTOMER, 10);
  const out = await tools.send_project.handler(ctx(PROVIDER), { contract_id: deep.contractId, git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good });
  assert.deepEqual(out.qa, { checks: ['basic', 'code_review', 'security'], reserved_credits: 750, platform_credits: 60 });
  assert.equal(await balance(CUSTOMER), 2.5);
});

test('a customer who cannot cover the chosen checks blocks the submission without side effects', async () => {
  const deep = await seedActiveContract({ customer: CUSTOMER, provider: PROVIDER, qaChecks: ['adversarial'] });
  await seedBalance(CUSTOMER, 1);
  await expectCode(
    tools.send_project.handler(ctx(PROVIDER), { contract_id: deep.contractId, git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good }),
    'insufficient_balance',
  );
  assert.equal(await balance(CUSTOMER), 1);
  assert.equal(await contractStatus(deep.contractId), 'active');
  assert.equal(await submissionCount(deep.contractId), 0);
});

test('qa_status and qa_report_get are for the contract parties only', async () => {
  const before = await tools.qa_status.handler(ctx(CUSTOMER), { contract_id: c.contractId });
  assert.equal(before.contract_status, 'active');
  assert.deepEqual(before.submissions, []);
  assert.equal(before.latest_submission, null);
  assert.equal(before.latest_review, null);
  assert.equal(before.can_resubmit, true);

  await send({ git_repo: FAKE_REPOS.private, pat_token: FAKE_TOKENS.good });
  for (const user of [CUSTOMER, PROVIDER]) {
    const s = await tools.qa_status.handler(ctx(user), { contract_id: c.contractId });
    assert.equal(s.contract_status, 'in_qa');
    assert.equal(s.submissions.length, 1);
    assert.equal(s.latest_submission.attempt, 1);
    assert.equal(s.can_resubmit, false);
    assert.ok(!JSON.stringify(s).includes(FAKE_TOKENS.good));
  }
  await expectCode(tools.qa_status.handler(ctx(STRANGER), { contract_id: c.contractId }), 'not_found');
  await expectCode(tools.qa_report_get.handler(ctx(CUSTOMER), { review_id: '00000000-0000-4000-8000-000000000000' }), 'not_found');
  await expectCode(tools.qa_status.handler(ctx(CUSTOMER), {}), 'invalid_request');
});
