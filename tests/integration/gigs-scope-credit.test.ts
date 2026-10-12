/**
 * Scope-change credits at payout, against the throwaway DB: a price decrease whose refund
 * failed on approval (`refund_status = 'credit_pending'`) is settled when the provider is paid,
 * by refunding the customer, or by taking it off the transfer when Stripe refuses again. A
 * retried payout never settles twice.
 *
 * The contract: bid 30000 + 15% = 34500 paid; a scope change lowered it to 20000 (23000), so the
 * customer is owed 11500.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { installMocks, resetDb, sql, call, useFakeStripe, stopFakeStripe, notifyState } from './helpers';
import { seedContact } from './qa-helpers';
import { seedDelivered, one, type DeliveredContract } from './delivery-helpers';
import type { FakeStripe } from '../support/fake-stripe';

installMocks();
process.env.PAT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.CRON_SECRET = 'cron-secret-for-integration-tests';

let acceptRoute: typeof import('../../app/api/contracts/[id]/accept/route');
let cronRoute: typeof import('../../app/api/cron/auto-accept/route');
let stripe: FakeStripe;

const CUSTOMER = 'user_sc_customer';
const PROVIDER = 'user_sc_provider';
const p = (id: string) => ({ id });

before(async () => {
  await resetDb();
  stripe = await useFakeStripe();
  acceptRoute = await import('../../app/api/contracts/[id]/accept/route');
  cronRoute = await import('../../app/api/cron/auto-accept/route');
  await seedContact(CUSTOMER, 'Cara Customer', 'cara-sc@test.local');
  await seedContact(PROVIDER, 'Pat Provider', 'pat-sc@test.local');
});

after(async () => {
  await stopFakeStripe();
  await resetDb();
});

beforeEach(() => {
  notifyState.sent.length = 0;
  stripe.requests.length = 0;
});

/** A delivered contract whose current version was lowered to 20000, with 11500 owed as a credit. */
async function withCredit(): Promise<DeliveredContract & { steeringId: string }> {
  const c = await seedDelivered({ customer: CUSTOMER, provider: PROVIDER, stripe });
  await sql(`UPDATE contract_versions SET price_cents = 20000, fee_cents = 3000, customer_total_cents = 23000 WHERE id = $1`, [c.versionId]);
  const [s] = await sql<{ id: string }>(
    `INSERT INTO steering_requests (contract_id, user_id, requested_by_principal_id, message, kind, status,
       base_contract_version_id, refund_amount_cents, refund_status, refund_credit_cents)
     VALUES ($1, $2, $3, 'Drop the CSV export', 'scope_change', 'approved', $4, 11500, 'credit_pending', 11500) RETURNING id`,
    [c.contractId, CUSTOMER, c.customerPrincipalId, c.versionId],
  );
  return { ...c, steeringId: s.id };
}

const accept = (contractId: string) => call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(contractId), user: CUSTOMER });
const posts = (path: string) => stripe.requests.filter((q) => q.method === 'POST' && q.path === path);

test('credit at payout: the 11500 owed is refunded to the customer and the lower bid is paid in full', async () => {
  const c = await withCredit();
  const r = await accept(c.contractId);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.payout.status, 'paid');
  assert.equal(r.body.payout.amount_cents, 20000);

  const refunds = posts('/v1/refunds');
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0].form.payment_intent, c.paymentIntentId);
  assert.equal(refunds[0].form.amount, '11500');
  assert.equal(refunds[0].form['metadata[kind]'], 'contract_scope_credit');
  assert.equal(posts('/v1/transfers')[0].form.amount, '20000');

  const s = await one(`SELECT refund_status, refund_credit_cents, credit_refunded_cents, credit_deducted_cents, credit_settled_at IS NOT NULL AS settled
    FROM steering_requests WHERE id = $1`, [c.steeringId]);
  assert.deepEqual(s, { refund_status: 'credit_settled', refund_credit_cents: 0, credit_refunded_cents: 11500, credit_deducted_cents: 0, settled: true });
  assert.deepEqual(await one(`SELECT amount_refunded_cents, status FROM payments WHERE id = $1`, [c.paymentId]), { amount_refunded_cents: 11500, status: 'partially_refunded' });
  assert.deepEqual(await sql(`SELECT amount_cents, reason FROM refunds WHERE contract_id = $1`, [c.contractId]), [{ amount_cents: 11500, reason: 'scope_change_credit_at_payout' }]);
  assert.deepEqual(await one(`SELECT amount_cents, credit_deducted_cents FROM transfers WHERE contract_id = $1`, [c.contractId]), { amount_cents: 20000, credit_deducted_cents: 0 });
  const activity = await one<{ summary: string }>(`SELECT summary FROM activity_events WHERE contract_id = $1 AND type = 'credit_settled'`, [c.contractId]);
  assert.match(activity.summary, /refunded to the customer/);
  assert.ok(await one(`SELECT id FROM audit_events WHERE action = 'scope_credit_settled' AND subject_id = $1`, [c.contractId]));
});

test('credit at payout: when Stripe refuses the refund again, it comes off the provider transfer', async () => {
  const c = await withCredit();
  stripe.failNext('/v1/refunds');
  const r = await accept(c.contractId);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.payout.amount_cents, 8500);
  assert.equal(posts('/v1/transfers')[0].form.amount, '8500');
  const s = await one(`SELECT refund_status, refund_credit_cents, credit_refunded_cents, credit_deducted_cents FROM steering_requests WHERE id = $1`, [c.steeringId]);
  assert.deepEqual(s, { refund_status: 'credit_settled', refund_credit_cents: 0, credit_refunded_cents: 0, credit_deducted_cents: 11500 });
  assert.deepEqual(await one(`SELECT amount_cents, credit_deducted_cents FROM transfers WHERE contract_id = $1`, [c.contractId]), { amount_cents: 8500, credit_deducted_cents: 11500 });
  assert.equal((await one<{ amount_refunded_cents: number }>(`SELECT amount_refunded_cents FROM payments WHERE id = $1`, [c.paymentId])).amount_refunded_cents, 0);
  assert.equal(notifyState.sent.find((n) => n.type === 'payout_sent')!.payload.amountCents, 8500);
});

test('credit at payout: a payout retried by the cron after a refused transfer settles nothing twice', async () => {
  const c = await withCredit();
  stripe.failNext('/v1/refunds');
  stripe.failNext('/v1/transfers');
  const r = await accept(c.contractId);
  assert.equal(r.body.payout.status, 'failed');
  const cron = await call(cronRoute.POST, { method: 'POST', url: '/api/cron/auto-accept', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  assert.equal(cron.status, 200);
  const rows = await sql<{ status: string; amount_cents: number; credit_deducted_cents: number }>(
    `SELECT status, amount_cents, credit_deducted_cents FROM transfers WHERE contract_id = $1 ORDER BY created_at`, [c.contractId]);
  assert.deepEqual(rows, [
    { status: 'failed', amount_cents: 8500, credit_deducted_cents: 11500 },
    { status: 'paid', amount_cents: 8500, credit_deducted_cents: 11500 },
  ]);
  assert.equal((await one<{ credit_deducted_cents: number }>(`SELECT credit_deducted_cents FROM steering_requests WHERE id = $1`, [c.steeringId])).credit_deducted_cents, 11500);
});

test('no credit owed: the payout is the bid and nothing is refunded', async () => {
  const c = await seedDelivered({ customer: CUSTOMER, provider: PROVIDER, stripe });
  const r = await accept(c.contractId);
  assert.equal(r.body.payout.amount_cents, 30000);
  assert.equal(posts('/v1/refunds').length, 0);
});
