/**
 * Phase 5 delivery and acceptance against the throwaway DB, a fake Stripe and a fake GitHub:
 * the delivery view, the tarball download, push-to-repo, accept → transfer, PAT purge, and
 * the auto-accept cron (reminder, auto-accept, payout retry).
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { installMocks, resetDb, sql, call, useFakeStripe, stopFakeStripe, notifyState } from './helpers';
import { seedContact } from './qa-helpers';
import { seedDelivered, one } from './delivery-helpers';
import { startFakeGithub, FAKE_SHA_HEAD, FAKE_TOKENS, DEFAULT_REPO_FILES, type FakeGithub } from '../support/fake-github';
import type { FakeStripe } from '../support/fake-stripe';
import { readTar, stripTopDir } from '../../src/lib/delivery/tar';
import { filesHash } from '../../src/lib/delivery/snapshot-hash';
import { readFileSync } from 'node:fs';
import path from 'node:path';

installMocks();
process.env.PAT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.CRON_SECRET = 'cron-secret-for-integration-tests';

type Route = typeof import('../../app/api/contracts/[id]/delivery/route');
let viewRoute: Route;
let downloadRoute: typeof import('../../app/api/contracts/[id]/delivery/download/route');
let pushRoute: typeof import('../../app/api/contracts/[id]/delivery/push/route');
let acceptRoute: typeof import('../../app/api/contracts/[id]/accept/route');
let cronRoute: typeof import('../../app/api/cron/auto-accept/route');
let payout: typeof import('../../src/lib/delivery/payout');
let github: FakeGithub;
let stripe: FakeStripe;

const CUSTOMER = 'user_dl_customer';
const PROVIDER = 'user_dl_provider';
const STRANGER = 'user_dl_stranger';
const TARGET_TOKEN = `github_pat_11TARGET000000000000_${'t'.padEnd(59, '0')}`;
const NONEMPTY_TOKEN = `github_pat_11NONEMPTY0000000000_${'n'.padEnd(59, '0')}`;
const PUBLIC_TOKEN = `github_pat_11PUBTARGET000000000_${'p'.padEnd(59, '0')}`;
const READONLY_TOKEN = `github_pat_11READONLY0000000000_${'r'.padEnd(59, '0')}`;
const KEPT_TOKEN = `github_pat_11KEPTTARGET00000000_${'k'.padEnd(59, '0')}`;

const p = (id: string) => ({ id });
const cronHeaders = { authorization: `Bearer ${process.env.CRON_SECRET}` };

before(async () => {
  await resetDb();
  stripe = await useFakeStripe();
  github = await startFakeGithub();
  process.env.GITHUB_API_BASE = github.url;
  const target = (full_name: string, opts: { private?: boolean; empty?: boolean; push?: boolean } = {}) => ({
    full_name, private: opts.private ?? true, permissions: { admin: false, push: opts.push ?? true, pull: true },
    default_branch: 'main', head_sha: '9'.repeat(40), empty: opts.empty ?? true,
  });
  github.setToken(TARGET_TOKEN, { repos: [target('cust/target')], expires_in_days: 10 });
  github.setToken(NONEMPTY_TOKEN, { repos: [target('cust/busy', { empty: false })], expires_in_days: 10 });
  github.setToken(PUBLIC_TOKEN, { repos: [target('cust/open', { private: false })], expires_in_days: 10 });
  github.setToken(READONLY_TOKEN, { repos: [target('cust/readonly', { push: false })], expires_in_days: 10 });
  github.setToken(KEPT_TOKEN, { repos: [target('cust/kept')], expires_in_days: 10 });
  viewRoute = await import('../../app/api/contracts/[id]/delivery/route');
  downloadRoute = await import('../../app/api/contracts/[id]/delivery/download/route');
  pushRoute = await import('../../app/api/contracts/[id]/delivery/push/route');
  acceptRoute = await import('../../app/api/contracts/[id]/accept/route');
  cronRoute = await import('../../app/api/cron/auto-accept/route');
  payout = await import('../../src/lib/delivery/payout');
  await seedContact(CUSTOMER, 'Cara Customer', 'cara@test.local');
  await seedContact(PROVIDER, 'Pat Provider', 'pat@test.local');
});

after(async () => {
  await github.close();
  delete process.env.GITHUB_API_BASE;
  await stopFakeStripe();
  await resetDb();
});

beforeEach(() => {
  notifyState.sent.length = 0;
  stripe.requests.length = 0;
});

const delivered = (over: Partial<Parameters<typeof seedDelivered>[0]> = {}) => seedDelivered({ customer: CUSTOMER, provider: PROVIDER, stripe, ...over });

/** Download through the route handler and return the raw bytes. */
async function download(contractId: string, user: string) {
  const { NextRequest } = await import('next/server');
  const { authState } = await import('./helpers');
  authState.userId = user;
  const res = await downloadRoute.GET(new NextRequest(new URL(`/api/contracts/${contractId}/delivery/download`, 'http://localhost:3000')), { params: p(contractId) });
  return { res, bytes: Buffer.from(await res.arrayBuffer()) };
}

test('delivery view: the customer sees the QA report, history, versions and what they can do; no PAT', async () => {
  const c = await delivered();
  const r = await call(viewRoute.GET, { url: `/api/contracts/${c.contractId}/delivery`, params: p(c.contractId), user: CUSTOMER });
  assert.equal(r.status, 200);
  assert.equal(r.body.contract.role, 'customer');
  assert.equal(r.body.delivery.unlocked, true);
  assert.equal(r.body.delivery.commit_sha, FAKE_SHA_HEAD);
  assert.equal(r.body.qa.verdict, 'validated');
  assert.match(r.body.qa.report_md, /All acceptance criteria pass/);
  assert.deepEqual(r.body.qa.warnings.map((w: { title: string }) => w.title), ['Add a README section on CSV encoding', 'Consider streaming large files']);
  assert.equal(r.body.qa.warnings[0].severity, 'low');
  assert.deepEqual(r.body.history.map((h: { attempt: number; verdict: string }) => [h.attempt, h.verdict]), [[1, 'validated']]);
  assert.deepEqual(r.body.contract_versions.map((v: { version: number; price_cents: number; current: boolean }) => [v.version, v.price_cents, v.current]), [[1, 30000, true]]);
  assert.deepEqual(r.body.actions, {
    can_download: true, can_push: true, can_accept: true, can_dispute: true, dispute_phase: 'pre_accept', claim_window_ends_at: null, can_review: false,
  });
  assert.ok(r.body.delivery.auto_accept_at);
  assert.ok(!JSON.stringify(r.body).includes(FAKE_TOKENS.good), 'the PAT never appears');
  assert.ok(!JSON.stringify(r.body).includes('pat_ciphertext'));

  const prov = await call(viewRoute.GET, { url: `/api/contracts/${c.contractId}/delivery`, params: p(c.contractId), user: PROVIDER });
  assert.equal(prov.status, 200);
  assert.equal(prov.body.contract.role, 'provider');
  assert.equal(prov.body.actions.can_download, false);
  assert.equal(prov.body.actions.can_accept, false);
  assert.equal(prov.body.actions.can_dispute, false);

  assert.equal((await call(viewRoute.GET, { url: `/api/contracts/${c.contractId}/delivery`, params: p(c.contractId), user: STRANGER })).status, 404);
  assert.equal((await call(viewRoute.GET, { url: `/api/contracts/${c.contractId}/delivery`, params: p(c.contractId), user: null })).status, 401);
  assert.equal((await call(viewRoute.GET, { url: '/api/contracts/x/delivery', params: p('not-a-uuid'), user: CUSTOMER })).status, 400);
});

test('download: streams the exact QA’d commit as a tarball, audited; the PAT stays server-side', async () => {
  const c = await delivered();
  const { res, bytes } = await download(c.contractId, CUSTOMER);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/gzip');
  assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="private-repo-111111111111\.tar\.gz"/);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  const files = stripTopDir(readTar(gunzipSync(bytes)));
  assert.deepEqual(Object.fromEntries(files.map((f) => [f.path, f.data.toString()])), DEFAULT_REPO_FILES);
  // GitHub saw the tarball request for the pinned SHA with the token; the codeload URL without it.
  const tarballReq = github.requests.find((r) => r.path === `/repos/acme/private-repo/tarball/${FAKE_SHA_HEAD}`);
  assert.ok(tarballReq?.authorized);
  const codeload = github.requests.filter((r) => r.path.startsWith('/__codeload/'));
  assert.ok(codeload.length > 0 && codeload.every((r) => !r.authorized), 'the signed download URL never gets the token');
  const audit = await one<{ actor_user_id: string; metadata: Record<string, unknown> }>(
    `SELECT actor_user_id, metadata FROM audit_events WHERE action = 'delivery_download' AND subject_id = $1`, [c.contractId]);
  assert.equal(audit.actor_user_id, CUSTOMER);
  assert.equal(audit.metadata.commit_sha, FAKE_SHA_HEAD);
  const row = await one<{ kind: string; status: string; commit_sha: string }>(`SELECT kind, status, commit_sha FROM deliveries WHERE contract_id = $1`, [c.contractId]);
  assert.deepEqual(row, { kind: 'download', status: 'succeeded', commit_sha: FAKE_SHA_HEAD });
});

test('download: provider 403, before QA or unpaid 409 delivery_locked', async () => {
  const c = await delivered();
  const prov = await download(c.contractId, PROVIDER);
  assert.equal(prov.res.status, 403);
  const locked = await delivered({ status: 'in_qa', validated: false });
  const l = await download(locked.contractId, CUSTOMER);
  assert.equal(l.res.status, 409);
  assert.equal(JSON.parse(l.bytes.toString()).error, 'delivery_locked');
  const unpaid = await delivered({ paymentStatus: 'pending' });
  assert.equal(JSON.parse((await download(unpaid.contractId, CUSTOMER)).bytes.toString()).error, 'delivery_locked');
  const view = await call(viewRoute.GET, { url: '/x', params: p(unpaid.contractId), user: CUSTOMER });
  assert.equal(view.body.delivery.unlocked, false);
  assert.equal(view.body.actions.can_accept, false);
});

test('push: the QA’d files land as one commit in the customer’s empty private repo; their PAT is purged', async () => {
  const c = await delivered();
  const r = await call(pushRoute.POST, { method: 'POST', url: '/x', params: p(c.contractId), user: CUSTOMER, body: { repo: 'https://github.com/cust/target', token: TARGET_TOKEN } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'succeeded');
  assert.equal(r.body.target_repo, 'cust/target');
  assert.equal(r.body.source_commit_sha, FAKE_SHA_HEAD);
  assert.equal(r.body.file_count, 3);
  const repo = github.repo('cust/target');
  const files = repo.filesAt('main');
  assert.deepEqual(Object.keys(files).sort(), Object.keys(DEFAULT_REPO_FILES).sort());
  for (const [path, content] of Object.entries(DEFAULT_REPO_FILES)) assert.equal(files[path].content, content);
  assert.equal(files['bin/run.sh'].mode, '100755');
  assert.equal(files['README.md'].mode, '100644');
  const head = repo.commits.get(repo.refs.main)!;
  assert.equal(r.body.pushed_commit_sha, repo.refs.main);
  assert.deepEqual(head.parents, []);
  assert.match(head.message, new RegExp(FAKE_SHA_HEAD));
  const row = await one<{ status: string; pat_ciphertext: string | null; pat_purged_at: string | null; file_count: number }>(
    `SELECT status, pat_ciphertext, pat_purged_at, file_count FROM deliveries WHERE contract_id = $1 AND kind = 'push'`, [c.contractId]);
  assert.equal(row.status, 'succeeded');
  assert.equal(row.pat_ciphertext, null);
  assert.ok(row.pat_purged_at);
  assert.ok(!JSON.stringify(r.body).includes(TARGET_TOKEN));
  const audit = await sql(`SELECT 1 FROM audit_events WHERE action = 'delivery_push' AND subject_id = $1`, [c.contractId]);
  assert.equal(audit.length, 1);
});

test('push: rejects public, non-empty and read-only targets, classic tokens, and the provider', async () => {
  const c = await delivered();
  const push = (repo: string, token: string, user = CUSTOMER) => call(pushRoute.POST, { method: 'POST', url: '/x', params: p(c.contractId), user, body: { repo, token } });
  assert.equal((await push('cust/open', PUBLIC_TOKEN)).body.error, 'public_repo');
  assert.equal((await push('cust/busy', NONEMPTY_TOKEN)).body.error, 'repo_not_empty');
  assert.equal((await push('cust/readonly', READONLY_TOKEN)).body.error, 'push_not_allowed');
  const classic = await push('cust/target', `ghp_${'C'.repeat(36)}`);
  assert.equal(classic.status, 422);
  assert.equal(classic.body.error, 'classic_pat');
  assert.equal((await push('cust/target', TARGET_TOKEN, PROVIDER)).status, 403);
  assert.equal((await push('', TARGET_TOKEN)).status, 400);
});

test('accept: completes the contract, transfers the bid with source_transaction and an idempotency key, purges PATs, notifies', async () => {
  const c = await delivered();
  const r = await call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(c.contractId), user: CUSTOMER });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'completed');
  assert.equal(r.body.acceptance, 'customer');
  assert.equal(r.body.payout.status, 'paid');
  assert.equal(r.body.payout.amount_cents, 30000);

  const transferReq = stripe.requests.find((q) => q.method === 'POST' && q.path === '/v1/transfers');
  assert.ok(transferReq, 'a transfer was created');
  assert.equal(transferReq.form.amount, '30000');
  assert.equal(transferReq.form.currency, 'eur');
  assert.equal(transferReq.form.destination, c.accountId);
  assert.equal(transferReq.form.transfer_group, `contract_${c.contractId}`);
  assert.equal(transferReq.form.source_transaction, c.chargeId);
  const row = await one<{ id: string; status: string; stripe_transfer_id: string; amount_cents: number }>(
    `SELECT id, status, stripe_transfer_id, amount_cents FROM transfers WHERE contract_id = $1`, [c.contractId]);
  assert.equal(transferReq.idempotencyKey, `payout_${row.id}`);
  assert.equal(row.status, 'paid');
  assert.equal(r.body.payout.transfer_id, row.stripe_transfer_id);

  const contract = await one<{ status: string; accepted_at: string; accepted_by: string; acceptance: string }>(`SELECT status, accepted_at, accepted_by, acceptance FROM contracts WHERE id = $1`, [c.contractId]);
  assert.equal(contract.status, 'completed');
  assert.equal(contract.accepted_by, CUSTOMER);
  assert.equal((await one<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [c.jobId])).status, 'completed');
  const sub = await one<{ pat_ciphertext: string | null; pat_iv: string | null; pat_tag: string | null; pat_purged_at: string | null }>(
    `SELECT pat_ciphertext, pat_iv, pat_tag, pat_purged_at FROM submissions WHERE id = $1`, [c.submissionId]);
  assert.deepEqual([sub.pat_ciphertext, sub.pat_iv, sub.pat_tag], [null, null, null]);
  assert.ok(sub.pat_purged_at);
  // payer fingerprints recorded for the self-dealing check
  const pay = await one<{ stripe_charge_id: string; payer_fingerprints: string[] }>(`SELECT stripe_charge_id, payer_fingerprints FROM payments WHERE id = $1`, [c.paymentId]);
  assert.equal(pay.stripe_charge_id, c.chargeId);
  assert.ok(pay.payer_fingerprints.includes(`card:fp_${CUSTOMER}`));

  const types = notifyState.sent.map((n) => `${n.type}:${n.userId}`).sort();
  assert.deepEqual(types, [`payout_sent:${PROVIDER}`, `review_requested:${CUSTOMER}`, `review_requested:${PROVIDER}`].sort());
  assert.equal(notifyState.sent.find((n) => n.type === 'payout_sent')!.payload.amountCents, 30000);

  const again = await call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(c.contractId), user: CUSTOMER });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'not_acceptable');
  assert.equal(stripe.requests.filter((q) => q.path === '/v1/transfers').length, 1, 'no second transfer');
  // The QA'd commit was kept before the PAT was purged: the download still works, from storage.
  github.requests.length = 0;
  const kept = await download(c.contractId, CUSTOMER);
  assert.equal(kept.res.status, 200);
  assert.deepEqual(Object.fromEntries(stripTopDir(readTar(gunzipSync(kept.bytes))).map((f) => [f.path, f.data.toString()])), DEFAULT_REPO_FILES);
  assert.equal(github.requests.length, 0, 'no GitHub call (and no PAT) after acceptance');
});

test('snapshot: the first use keeps the QA’d commit in private storage with its files hash; later downloads never use the PAT', async () => {
  const c = await delivered();
  github.requests.length = 0;
  const first = await download(c.contractId, CUSTOMER);
  assert.equal(first.res.status, 200);
  const sub = await one<{ snapshot_path: string; files_hash: string; snapshot_bytes: number; snapshot_at: string | null }>(
    `SELECT snapshot_path, files_hash, snapshot_bytes, snapshot_at FROM submissions WHERE id = $1`, [c.submissionId]);
  assert.match(sub.snapshot_path, new RegExp(`^deliveries/${c.contractId}/${c.submissionId}-[0-9a-f]{64}\\.tar\\.gz$`));
  assert.equal(sub.files_hash, filesHash(stripTopDir(readTar(gunzipSync(first.bytes)))));
  assert.equal(Number(sub.snapshot_bytes), first.bytes.length);
  assert.ok(sub.snapshot_at);
  assert.deepEqual(readFileSync(path.join(process.env.DELIVERY_SNAPSHOT_FAKE_DIR!, ...sub.snapshot_path.split('/'))), first.bytes);
  assert.ok(await one(`SELECT id FROM audit_events WHERE action = 'delivery_snapshot' AND subject_id = $1`, [c.submissionId]));

  github.requests.length = 0;
  const second = await download(c.contractId, CUSTOMER);
  assert.equal(second.res.status, 200);
  assert.deepEqual(second.bytes, first.bytes);
  assert.equal(github.requests.length, 0, 'served from the snapshot');
  const view = await call(viewRoute.GET, { url: '/x', params: p(c.contractId), user: CUSTOMER });
  assert.equal(view.body.delivery.snapshot_available, true);
  assert.equal(view.body.delivery.files_hash, sub.files_hash);
  assert.ok(!JSON.stringify(view.body).includes(sub.snapshot_path), 'the storage path is never shown');
});

test('snapshot: with the PAT purged, a kept snapshot still downloads and pushes; without one it is 410 snapshot_missing', async () => {
  const c = await delivered();
  assert.equal((await download(c.contractId, CUSTOMER)).res.status, 200);
  await sql(`UPDATE submissions SET pat_ciphertext = NULL, pat_iv = NULL, pat_tag = NULL, pat_purged_at = NOW() WHERE id = $1`, [c.submissionId]);
  github.requests.length = 0;
  assert.equal((await download(c.contractId, CUSTOMER)).res.status, 200);
  const pushed = await call(pushRoute.POST, { method: 'POST', url: '/x', params: p(c.contractId), user: CUSTOMER, body: { repo: 'cust/kept', token: KEPT_TOKEN } });
  assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
  assert.ok(!github.requests.some((r) => r.path.includes('/tarball/')), 'the push reads the snapshot, not the provider repo');

  const lost = await delivered();
  await sql(`UPDATE submissions SET pat_ciphertext = NULL, pat_iv = NULL, pat_tag = NULL, pat_purged_at = NOW() WHERE id = $1`, [lost.submissionId]);
  const gone = await download(lost.contractId, CUSTOMER);
  assert.equal(gone.res.status, 410);
  assert.equal(JSON.parse(gone.bytes.toString()).error, 'snapshot_missing');
  const view = await call(viewRoute.GET, { url: '/x', params: p(lost.contractId), user: CUSTOMER });
  assert.equal(view.body.actions.can_download, false);
});

test('accept: only the customer, only a delivered and paid contract', async () => {
  const c = await delivered();
  assert.equal((await call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(c.contractId), user: PROVIDER })).status, 403);
  assert.equal((await call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(c.contractId), user: STRANGER })).status, 404);
  const inQa = await delivered({ status: 'in_qa', validated: false });
  assert.equal((await call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(inQa.contractId), user: CUSTOMER })).body.error, 'not_acceptable');
  const unpaid = await delivered({ paymentStatus: 'pending' });
  assert.equal((await call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(unpaid.contractId), user: CUSTOMER })).body.error, 'not_acceptable');
  assert.equal(stripe.requests.filter((q) => q.path === '/v1/transfers').length, 0);
});

test('payout is idempotent: a repeated call replays, a refused transfer is marked failed and retried by the cron', async () => {
  const c = await delivered();
  const contract = await one<import('../../src/lib/jobs/types').ContractRow>(`SELECT * FROM contracts WHERE id = $1`, [c.contractId]);
  const first = await payout.payoutContract(contract, 30000);
  const second = await payout.payoutContract(contract, 30000);
  assert.equal(first.status, 'paid');
  assert.equal(second.status, 'paid');
  assert.equal(second.status === 'paid' && second.created, false);
  assert.equal(stripe.requests.filter((q) => q.path === '/v1/transfers').length, 1);

  // a refused transfer on acceptance; the cron retries it
  const d = await delivered();
  stripe.failNext('/v1/transfers', 1);
  const r = await call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(d.contractId), user: CUSTOMER });
  assert.equal(r.status, 200);
  assert.equal(r.body.payout.status, 'failed');
  assert.equal((await one<{ status: string }>(`SELECT status FROM transfers WHERE contract_id = $1`, [d.contractId])).status, 'failed');
  const cron = await call(cronRoute.POST, { method: 'POST', url: '/api/cron/auto-accept', headers: cronHeaders });
  assert.equal(cron.status, 200);
  assert.ok(cron.body.payouts_retried >= 1);
  const rows = await sql<{ status: string }>(`SELECT status FROM transfers WHERE contract_id = $1 ORDER BY created_at`, [d.contractId]);
  assert.deepEqual(rows.map((x) => x.status), ['failed', 'paid']);
  assert.ok(notifyState.sent.some((n) => n.type === 'payout_sent' && n.payload.contractId === d.contractId));
});

test('auto-accept cron: needs CRON_SECRET; reminds 48h before (once), accepts when due, skips disputes', async () => {
  assert.equal((await call(cronRoute.GET, { url: '/api/cron/auto-accept' })).status, 401);
  assert.equal((await call(cronRoute.GET, { url: '/api/cron/auto-accept', headers: { authorization: 'Bearer nope' } })).status, 401);

  const due = await delivered({ autoAcceptAt: new Date(Date.now() - 60_000).toISOString() });
  const soon = await delivered({ autoAcceptAt: new Date(Date.now() + 30 * 3600_000).toISOString() });
  const later = await delivered({ autoAcceptAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });
  const disputed = await delivered({ autoAcceptAt: new Date(Date.now() - 60_000).toISOString() });
  await sql(
    `INSERT INTO disputes (contract_id, user_id, provider_user_id, opened_by_user_id, source, phase, category, reason)
     VALUES ($1, $2, $3, $2, 'customer', 'pre_accept', 'quality', 'The importer drops rows')`,
    [disputed.contractId, CUSTOMER, PROVIDER],
  );
  await sql(`UPDATE contracts SET status = 'disputed' WHERE id = $1`, [disputed.contractId]);

  const r = await call(cronRoute.GET, { url: '/api/cron/auto-accept', headers: cronHeaders });
  assert.equal(r.status, 200);
  assert.ok(r.body.accepted.includes(due.contractId));
  assert.ok(!r.body.accepted.includes(disputed.contractId));
  assert.ok(r.body.reminded.includes(soon.contractId));
  assert.ok(!r.body.reminded.includes(later.contractId));
  const acc = await one<{ status: string; acceptance: string; accepted_by: string | null }>(`SELECT status, acceptance, accepted_by FROM contracts WHERE id = $1`, [due.contractId]);
  assert.deepEqual(acc, { status: 'completed', acceptance: 'auto', accepted_by: null });
  assert.equal((await one<{ status: string }>(`SELECT status FROM transfers WHERE contract_id = $1`, [due.contractId])).status, 'paid');
  assert.equal((await one<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [disputed.contractId])).status, 'disputed');
  const reminder = notifyState.sent.filter((n) => n.type === 'auto_accept_reminder' && n.payload.contractId === soon.contractId);
  assert.equal(reminder.length, 1);
  assert.equal(reminder[0].userId, CUSTOMER);

  const again = await call(cronRoute.GET, { url: '/api/cron/auto-accept', headers: cronHeaders });
  assert.ok(!again.body.reminded.includes(soon.contractId), 'the reminder goes out once');
  assert.ok(!again.body.accepted.includes(due.contractId));
});
