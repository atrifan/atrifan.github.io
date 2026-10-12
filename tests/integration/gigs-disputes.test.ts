/**
 * Phase 5 disputes against the throwaway DB and a fake Stripe: opening (before acceptance and
 * as a claim after), admin resolution (refund before the payout, reversal + refund after it,
 * partial refunds), retry safety, chargeback linking and the QA-rejection dispute.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { installMocks, resetDb, sql, call, useFakeStripe, stopFakeStripe, notifyState, signedWebhook, stripeEvent } from './helpers';
import { seedContact } from './qa-helpers';
import { seedDelivered, one } from './delivery-helpers';
import { startFakeGithub, type FakeGithub } from '../support/fake-github';
import type { FakeStripe } from '../support/fake-stripe';

installMocks();
process.env.PAT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.CRON_SECRET = 'cron-secret-for-integration-tests';
const ADMIN = 'user_dsp_admin';
process.env.ADMIN_USER_IDS = ADMIN;
process.env.ADMIN_EMAILS = '';

let disputeRoute: typeof import('../../app/api/contracts/[id]/dispute/route');
let acceptRoute: typeof import('../../app/api/contracts/[id]/accept/route');
let viewRoute: typeof import('../../app/api/contracts/[id]/delivery/route');
let listRoute: typeof import('../../app/api/admin/disputes/route');
let detailRoute: typeof import('../../app/api/admin/disputes/[id]/route');
let resolveRoute: typeof import('../../app/api/admin/disputes/[id]/resolve/route');
let cronRoute: typeof import('../../app/api/cron/auto-accept/route');
let webhook: typeof import('../../app/api/billing/webhook/route');
let qaReview: typeof import('../../src/lib/qa/qa-review-service');
let stripe: FakeStripe;
let github: FakeGithub;

const CUSTOMER = 'user_dsp_customer';
const PROVIDER = 'user_dsp_provider';
const p = (id: string) => ({ id });
const REASON = { category: 'quality', reason: 'The importer drops every row with a quoted comma.', evidence: 'See sample.csv line 12' };

before(async () => {
  await resetDb();
  stripe = await useFakeStripe();
  github = await startFakeGithub();
  process.env.GITHUB_API_BASE = github.url;
  disputeRoute = await import('../../app/api/contracts/[id]/dispute/route');
  acceptRoute = await import('../../app/api/contracts/[id]/accept/route');
  viewRoute = await import('../../app/api/contracts/[id]/delivery/route');
  listRoute = await import('../../app/api/admin/disputes/route');
  detailRoute = await import('../../app/api/admin/disputes/[id]/route');
  resolveRoute = await import('../../app/api/admin/disputes/[id]/resolve/route');
  cronRoute = await import('../../app/api/cron/auto-accept/route');
  webhook = await import('../../app/api/billing/webhook/route');
  qaReview = await import('../../src/lib/qa/qa-review-service');
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
const open = (contractId: string, body: unknown = REASON, user = CUSTOMER) => call(disputeRoute.POST, { method: 'POST', url: '/x', params: p(contractId), user, body });
const resolve = (disputeId: string, body: unknown, user = ADMIN) => call(resolveRoute.POST, { method: 'POST', url: '/x', params: p(disputeId), user, body });
const accept = (contractId: string) => call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(contractId), user: CUSTOMER });
const posts = (path: string) => stripe.requests.filter((r) => r.method === 'POST' && r.path.startsWith(path));

test('opening: the customer’s structured dispute pauses acceptance and auto-accept, and tells the provider and admins', async () => {
  const c = await delivered({ autoAcceptAt: new Date(Date.now() - 60_000).toISOString() });
  const r = await open(c.contractId);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.dispute.status, 'open');
  assert.equal(r.body.dispute.phase, 'pre_accept');
  assert.equal(r.body.dispute.category, 'quality');
  assert.equal(r.body.dispute.evidence, 'See sample.csv line 12');
  assert.equal((await one<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [c.contractId])).status, 'disputed');
  assert.equal((await one<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [c.jobId])).status, 'disputed');
  const to = notifyState.sent.filter((n) => n.type === 'dispute_opened').map((n) => n.userId).sort();
  assert.deepEqual(to, [ADMIN, PROVIDER].sort());

  const view = await call(viewRoute.GET, { url: '/x', params: p(c.contractId), user: CUSTOMER });
  assert.equal(view.body.actions.can_accept, false);
  assert.equal(view.body.delivery.auto_accept_paused, true);
  assert.equal(view.body.dispute.reason, REASON.reason);
  assert.equal((await accept(c.contractId)).status, 409);
  const cron = await call(cronRoute.POST, { method: 'POST', url: '/x', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  assert.ok(!cron.body.accepted.includes(c.contractId));
  assert.equal(posts('/v1/transfers').length, 0, 'no payout while disputed');

  const twice = await open(c.contractId);
  assert.equal(twice.status, 409);
  assert.equal(twice.body.error, 'dispute_open');
});

test('opening: validation, only the customer, only paid contracts', async () => {
  const c = await delivered();
  assert.equal((await open(c.contractId, { category: 'quality', reason: 'short' })).status, 400);
  assert.equal((await open(c.contractId, { category: 'nonsense', reason: 'A long enough reason here' })).status, 400);
  assert.equal((await open(c.contractId, REASON, PROVIDER)).status, 403);
  const unpaid = await delivered({ paymentStatus: 'pending' });
  assert.equal((await open(unpaid.contractId)).body.error, 'not_disputable');
});

test('admin: lists and shows disputes; non-admins get 403', async () => {
  const c = await delivered();
  const d = (await open(c.contractId)).body.dispute;
  assert.equal((await call(listRoute.GET, { url: '/api/admin/disputes', user: CUSTOMER })).status, 403);
  const list = await call(listRoute.GET, { url: '/api/admin/disputes?status=open', user: ADMIN });
  assert.equal(list.status, 200);
  const item = list.body.items.find((i: { id: string }) => i.id === d.id);
  assert.ok(item);
  assert.equal(item.customer.name, 'Cara Customer');
  assert.equal(item.provider.name, 'Pat Provider');
  assert.equal(item.price_cents, 30000);
  const detail = await call(detailRoute.GET, { url: '/x', params: p(d.id), user: ADMIN });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.money, { paid_cents: 34500, refunded_cents: 0, bid_cents: 30000, fee_cents: 4500, transferred_cents: 0, reversed_cents: 0, refundable_cents: 34500 });
  assert.equal(detail.body.previews.full_refund.refundCents, 34500);
  assert.equal(detail.body.previews.release.transferCents, 30000);
});

test('full refund before the payout: the customer gets everything back, no transfer, contract refunded', async () => {
  const c = await delivered();
  const d = (await open(c.contractId)).body.dispute;
  const r = await resolve(d.id, { outcome: 'full_refund', note: 'The importer does not meet the acceptance criteria.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.dispute.status, 'resolved');
  assert.equal(r.body.dispute.resolution, 'full_refund');
  assert.equal(r.body.contract_status, 'refunded');
  assert.equal(r.body.refunded_cents, 34500);
  const refunds = posts('/v1/refunds');
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].form.payment_intent, c.paymentIntentId);
  assert.equal(refunds[0].form.amount, '34500');
  assert.equal(refunds[0].idempotencyKey, `dispute_${d.id}_refund_${c.paymentId}_34500`);
  assert.equal(posts('/v1/transfers').length, 0);
  const pay = await one<{ amount_refunded_cents: number; status: string }>(`SELECT amount_refunded_cents, status FROM payments WHERE id = $1`, [c.paymentId]);
  assert.deepEqual(pay, { amount_refunded_cents: 34500, status: 'refunded' });
  assert.equal((await one<{ dispute_id: string }>(`SELECT dispute_id FROM refunds WHERE payment_id = $1`, [c.paymentId])).dispute_id, d.id);
  assert.equal((await one<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [c.jobId])).status, 'cancelled');
  const sub = await one<{ pat_ciphertext: string | null }>(`SELECT pat_ciphertext FROM submissions WHERE id = $1`, [c.submissionId]);
  assert.equal(sub.pat_ciphertext, null, 'PATs purged when the contract ends');
  assert.deepEqual(notifyState.sent.filter((n) => n.type === 'dispute_resolved').map((n) => n.userId).sort(), [CUSTOMER, PROVIDER].sort());
  const again = await resolve(d.id, { outcome: 'release', note: 'Second try' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'invalid_state');
  assert.equal(posts('/v1/refunds').length, 1);
});

test('release before the payout: the contract completes and the provider is paid the bid', async () => {
  const c = await delivered();
  const d = (await open(c.contractId)).body.dispute;
  const r = await resolve(d.id, { outcome: 'release', note: 'The work meets the spec.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.contract_status, 'completed');
  assert.equal(r.body.transferred_cents, 30000);
  assert.equal(r.body.payout_status, 'paid');
  const t = posts('/v1/transfers');
  assert.equal(t.length, 1);
  assert.equal(t[0].form.amount, '30000');
  assert.equal(posts('/v1/refunds').length, 0);
  const contract = await one<{ status: string; acceptance: string }>(`SELECT status, acceptance FROM contracts WHERE id = $1`, [c.contractId]);
  assert.deepEqual(contract, { status: 'completed', acceptance: 'resolution' });
});

test('partial refund before the payout: refund and transfer split pro rata', async () => {
  const c = await delivered();
  const d = (await open(c.contractId)).body.dispute;
  assert.equal((await resolve(d.id, { outcome: 'partial_refund', note: 'Half done' })).body.error, 'invalid_amount');
  assert.equal((await resolve(d.id, { outcome: 'partial_refund', refund_cents: 34500, note: 'Too much' })).body.error, 'invalid_amount');
  const r = await resolve(d.id, { outcome: 'partial_refund', refund_cents: 6900, note: 'Two of ten criteria are missing.' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.refunded_cents, 6900);
  assert.equal(r.body.transferred_cents, 24000);
  assert.equal(posts('/v1/refunds')[0].form.amount, '6900');
  assert.equal(posts('/v1/transfers')[0].form.amount, '24000');
  const pay = await one<{ amount_refunded_cents: number; status: string }>(`SELECT amount_refunded_cents, status FROM payments WHERE id = $1`, [c.paymentId]);
  assert.deepEqual(pay, { amount_refunded_cents: 6900, status: 'partially_refunded' });
});

test('claim after acceptance: full refund reverses the transfer and refunds; the window closes after 14 days', async () => {
  const c = await delivered();
  assert.equal((await accept(c.contractId)).status, 200);
  stripe.requests.length = 0;
  const r = await open(c.contractId, { ...REASON, category: 'not_as_described' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.dispute.phase, 'post_accept');
  assert.equal((await one<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [c.contractId])).status, 'completed');
  const transfer = await one<{ id: string; stripe_transfer_id: string }>(`SELECT id, stripe_transfer_id FROM transfers WHERE contract_id = $1`, [c.contractId]);

  const res = await resolve(r.body.dispute.id, { outcome: 'full_refund', note: 'Claim upheld.' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.reversed_cents, 30000);
  assert.equal(res.body.refunded_cents, 34500);
  const rev = posts(`/v1/transfers/${transfer.stripe_transfer_id}/reversals`);
  assert.equal(rev.length, 1);
  assert.equal(rev[0].form.amount, '30000');
  assert.equal(rev[0].idempotencyKey, `dispute_${r.body.dispute.id}_reversal_${transfer.id}_30000`);
  assert.equal(posts('/v1/refunds')[0].form.amount, '34500');
  const t = await one<{ amount_reversed_cents: number; status: string }>(`SELECT amount_reversed_cents, status FROM transfers WHERE id = $1`, [transfer.id]);
  assert.deepEqual(t, { amount_reversed_cents: 30000, status: 'reversed' });
  assert.equal((await one<{ amount_cents: number }>(`SELECT amount_cents FROM transfer_reversals WHERE transfer_id = $1`, [transfer.id])).amount_cents, 30000);

  const late = await delivered();
  assert.equal((await accept(late.contractId)).status, 200);
  await sql(`UPDATE contracts SET accepted_at = NOW() - INTERVAL '15 days' WHERE id = $1`, [late.contractId]);
  const closed = await open(late.contractId);
  assert.equal(closed.status, 409);
  assert.equal(closed.body.error, 'claim_window_closed');
});

test('a resolution that fails half-way can be retried without moving money twice', async () => {
  const c = await delivered();
  assert.equal((await accept(c.contractId)).status, 200);
  const d = (await open(c.contractId)).body.dispute;
  stripe.requests.length = 0;
  stripe.failNext('/v1/refunds', 1);
  const failed = await resolve(d.id, { outcome: 'partial_refund', refund_cents: 6900, note: 'Partly upheld.' });
  assert.equal(failed.status, 502);
  assert.equal((await one<{ status: string }>(`SELECT status FROM disputes WHERE id = $1`, [d.id])).status, 'resolving');
  // the refund runs first, so nothing was reversed yet
  assert.equal(posts('/v1/transfers/').filter((r) => r.path.endsWith('/reversals')).length, 0);
  const ok = await resolve(d.id, { outcome: 'full_refund', note: 'Retry (the stored plan wins)' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.dispute.resolution, 'partial_refund', 'a retry carries out the stored plan');
  const refunds = await sql<{ amount_cents: number }>(`SELECT amount_cents FROM refunds WHERE dispute_id = $1`, [d.id]);
  assert.deepEqual(refunds.map((x) => x.amount_cents), [6900]);
  const reversals = await sql<{ amount_cents: number }>(`SELECT amount_cents FROM transfer_reversals WHERE dispute_id = $1`, [d.id]);
  assert.deepEqual(reversals.map((x) => x.amount_cents), [6000]);
});

test('chargebacks: charge.dispute.created links to the contract, closed updates it; admins can’t resolve them', async () => {
  const c = await delivered();
  const dp = { id: `dp_${randomBytes(6).toString('hex')}`, object: 'dispute', amount: 34500, currency: 'eur', reason: 'fraudulent', status: 'needs_response', payment_intent: c.paymentIntentId, charge: c.chargeId, created: Math.floor(Date.now() / 1000) };
  const created = signedWebhook(stripeEvent('charge.dispute.created', dp));
  const r = await call(webhook.POST, { method: 'POST', url: '/api/billing/webhook', body: created.body, headers: created.headers });
  assert.equal(r.status, 200);
  const row = await one<{ id: string; source: string; status: string; stripe_dispute_status: string; phase: string; stripe_amount_cents: number }>(
    `SELECT id, source, status, stripe_dispute_status, phase, stripe_amount_cents FROM disputes WHERE stripe_dispute_id = $1`, [dp.id]);
  assert.deepEqual({ ...row, id: undefined }, { id: undefined, source: 'chargeback', status: 'open', stripe_dispute_status: 'needs_response', phase: 'pre_accept', stripe_amount_cents: 34500 });
  assert.equal((await one<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [c.contractId])).status, 'disputed');
  assert.ok(notifyState.sent.some((n) => n.type === 'dispute_opened' && n.userId === ADMIN));
  assert.equal((await accept(c.contractId)).status, 409);
  const admin = await resolve(row.id, { outcome: 'release', note: 'Nope' });
  assert.equal(admin.status, 409);

  const closed = signedWebhook(stripeEvent('charge.dispute.closed', { ...dp, status: 'lost' }));
  assert.equal((await call(webhook.POST, { method: 'POST', url: '/api/billing/webhook', body: closed.body, headers: closed.headers })).status, 200);
  const after = await one<{ status: string; stripe_dispute_status: string }>(`SELECT status, stripe_dispute_status FROM disputes WHERE stripe_dispute_id = $1`, [dp.id]);
  assert.deepEqual(after, { status: 'resolved', stripe_dispute_status: 'lost' });
  // replaying the same event id is a no-op
  assert.equal((await call(webhook.POST, { method: 'POST', url: '/api/billing/webhook', body: closed.body, headers: closed.headers })).body.duplicate, true);
});

test('a rejected QA verdict opens a dispute with a full refund as the default', async () => {
  const c = await delivered({ status: 'in_qa', validated: false });
  const out = await qaReview.markSubmission(ADMIN, { submission_id: c.submissionId, verdict: 'rejected', reason: 'Nothing works.' });
  assert.equal(out.contract_status, 'disputed');
  const d = await one<{ source: string; status: string; default_resolution: string; category: string; reason: string }>(
    `SELECT source, status, default_resolution, category, reason FROM disputes WHERE contract_id = $1`, [c.contractId]);
  assert.deepEqual(d, { source: 'qa_rejected', status: 'open', default_resolution: 'full_refund', category: 'qa_rejected', reason: 'Nothing works.' });
  const trust = await sql(`SELECT score FROM trust_scores WHERE principal_id = $1`, [c.providerPrincipalId]);
  assert.equal(trust.length, 1, 'the QA failure recomputes the provider’s trust score');
});
