import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  installMocks, call, resetDb, sql, seedEnabledProvider, useFakeStripe, stopFakeStripe,
  signedWebhook, stripeEvent, VALID_SPEC,
} from './helpers';
import type { FakeStripe } from '../support/fake-stripe';

installMocks();

let jobs: typeof import('../../app/api/jobs/route');
let draft: typeof import('../../app/api/jobs/[id]/spec/draft/route');
let approve: typeof import('../../app/api/jobs/[id]/spec/approve/route');
let bids: typeof import('../../app/api/jobs/[id]/bids/route');
let accept: typeof import('../../app/api/bids/[id]/accept/route');
let jobRoute: typeof import('../../app/api/jobs/[id]/route');
let webhook: typeof import('../../app/api/billing/webhook/route');
let stripe: FakeStripe;

const CUSTOMER = 'user_bid_customer';
const PROVIDER = 'user_bid_provider';
const PROVIDER2 = 'user_bid_provider2';
const NO_CONNECT = 'user_bid_noconnect';

before(async () => {
  await resetDb();
  stripe = await useFakeStripe();
  jobs = await import('../../app/api/jobs/route');
  draft = await import('../../app/api/jobs/[id]/spec/draft/route');
  approve = await import('../../app/api/jobs/[id]/spec/approve/route');
  bids = await import('../../app/api/jobs/[id]/bids/route');
  accept = await import('../../app/api/bids/[id]/accept/route');
  jobRoute = await import('../../app/api/jobs/[id]/route');
  webhook = await import('../../app/api/billing/webhook/route');
});

after(async () => {
  await stopFakeStripe();
  await resetDb();
});

async function openJob(title = 'Open job for bidding'): Promise<string> {
  const created = await call(jobs.POST, {
    method: 'POST', url: '/api/jobs', user: CUSTOMER,
    body: { title, description: 'A job that providers can bid on.', deadline: '2026-12-24T00:00:00.000Z' },
  });
  const id = created.body.job.id;
  await call(draft.POST, { method: 'POST', url: `/api/jobs/${id}/spec/draft`, params: { id }, user: CUSTOMER, body: { spec: VALID_SPEC } });
  const ok = await call(approve.POST, { method: 'POST', url: `/api/jobs/${id}/spec/approve`, params: { id }, user: CUSTOMER, body: {} });
  assert.equal(ok.body.job.status, 'open');
  return id;
}

function bid(id: string, user: string, body: Record<string, unknown> = {}) {
  return call(bids.POST, {
    method: 'POST', url: `/api/jobs/${id}/bids`, params: { id }, user,
    body: { price_cents: 30000, eta_days: 7, plan: 'Do it well', deliverables: ['repo'], included_steering_credits: 2, assumptions: ['CSV < 1GB'], ...body },
  });
}

async function postWebhook(event: Record<string, unknown>) {
  const { body, headers } = signedWebhook(event);
  return call(webhook.POST, { method: 'POST', url: '/api/billing/webhook', body, headers });
}

test('bid is blocked with 403 connect_required until payouts are enabled', async () => {
  const id = await openJob();
  const res = await bid(id, NO_CONNECT);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'connect_required');
  // a profile that exists but has no payouts yet is still blocked
  await sql(`INSERT INTO principals (kind, user_id) VALUES ('user', $1)`, [NO_CONNECT]);
  await sql(
    `INSERT INTO provider_profiles (user_id, principal_id, stripe_account_id, connect_status)
     SELECT $1, id, 'acct_pending_x', 'pending' FROM principals WHERE user_id = $1`,
    [NO_CONNECT],
  );
  const still = await bid(id, NO_CONNECT);
  assert.equal(still.status, 403);
  assert.equal(still.body.error, 'connect_required');
});

test('a seeded payouts_enabled provider can bid; pricing shows the commission on top', async () => {
  await seedEnabledProvider(PROVIDER);
  const id = await openJob();
  const res = await bid(id, PROVIDER);
  assert.equal(res.status, 201);
  assert.equal(res.body.bid.status, 'active');
  assert.equal(res.body.bid.price_cents, 30000);
  assert.equal(res.body.bid.user_id, PROVIDER);
  assert.deepEqual(res.body.pricing, {
    bid_cents: 30000, fee_cents: 4500, customer_total_cents: 34500, provider_net_cents: 30000, commission_bps: 1500,
  });

  const dup = await bid(id, PROVIDER, { price_cents: 29000 });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'bid_exists');

  const low = await bid(id, PROVIDER, { price_cents: 100 });
  assert.equal(low.status, 422);
  assert.equal(low.body.error, 'price_out_of_bounds');

  const badBody = await bid(id, PROVIDER, { price_cents: 12.5 });
  assert.equal(badBody.status, 400);

  await seedEnabledProvider(CUSTOMER, 'acct_seed_customer');
  const own = await bid(id, CUSTOMER);
  assert.equal(own.status, 403);
  assert.equal(own.body.error, 'own_job');
});

test('the job owner sees the bids comparison; others get 403', async () => {
  await seedEnabledProvider(PROVIDER2);
  const id = await openJob('Comparison job');
  await bid(id, PROVIDER, { price_cents: 30000 });
  await bid(id, PROVIDER2, { price_cents: 20000, eta_days: 3 });
  const res = await call(bids.GET, { url: `/api/jobs/${id}/bids`, params: { id }, user: CUSTOMER });
  assert.equal(res.status, 200);
  assert.equal(res.body.bids.length, 2);
  const cheap = res.body.bids.find((b: { price_cents: number }) => b.price_cents === 20000);
  assert.equal(cheap.pricing.customer_total_cents, 23000);
  assert.equal(cheap.provider.headline, 'Seeded provider');
  assert.deepEqual(cheap.provider.skills, ['typescript']);
  const other = await call(bids.GET, { url: `/api/jobs/${id}/bids`, params: { id }, user: PROVIDER });
  assert.equal(other.status, 403);
  assert.equal(other.body.error, 'forbidden');
  const listed = await call(jobs.GET, { url: '/api/jobs?q=Comparison', user: PROVIDER });
  assert.equal(listed.body.jobs[0].bid_count, 2);
});

test('accept: contract + version v1 + Checkout Session for the customer total; webhook activates it once', async () => {
  const id = await openJob('Accept me job');
  const placed = await bid(id, PROVIDER);
  const bidId = placed.body.bid.id;

  const stranger = await call(accept.POST, { method: 'POST', url: `/api/bids/${bidId}/accept`, params: { id: bidId }, user: PROVIDER });
  assert.equal(stranger.status, 404);

  const before = stripe.requests.length;
  const res = await call(accept.POST, { method: 'POST', url: `/api/bids/${bidId}/accept`, params: { id: bidId }, user: CUSTOMER });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const contractId = res.body.contract.id;
  assert.equal(res.body.contract.status, 'pending_payment');
  assert.equal(res.body.contract.customer_user_id, CUSTOMER);
  assert.equal(res.body.contract.provider_user_id, PROVIDER);
  assert.equal(res.body.version.version, 1);
  assert.equal(res.body.version.price_cents, 30000);
  assert.equal(res.body.version.commission_bps, 1500);
  assert.equal(res.body.version.fee_cents, 4500);
  assert.equal(res.body.version.customer_total_cents, 34500);
  assert.match(res.body.checkout_url, /^https:\/\/checkout\.stripe\.com\//);

  const sent = stripe.requests.slice(before).filter((q) => q.path === '/v1/checkout/sessions');
  assert.equal(sent.length, 1);
  const form = sent[0].form;
  assert.equal(form.mode, 'payment');
  assert.equal(form['line_items[0][price_data][unit_amount]'], '34500');
  assert.equal(form['line_items[0][price_data][currency]'], 'eur');
  assert.equal(form['line_items[0][quantity]'], '1');
  assert.equal(form['payment_intent_data[transfer_group]'], `contract_${contractId}`);
  assert.equal(form['metadata[kind]'], 'contract');
  assert.equal(form['metadata[contract_id]'], contractId);

  const [row] = await sql<{ status: string; transfer_group: string; current_version_id: string; stripe_checkout_session_id: string }>(
    `SELECT status, transfer_group, current_version_id, stripe_checkout_session_id FROM contracts WHERE id = $1`, [contractId]);
  assert.equal(row.status, 'pending_payment');
  assert.equal(row.transfer_group, `contract_${contractId}`);
  assert.ok(row.stripe_checkout_session_id.startsWith('cs_test_'));
  const [version] = await sql<{ commission_bps: number; customer_total_cents: number; steering_allowance: number }>(
    `SELECT commission_bps, customer_total_cents, steering_allowance FROM contract_versions WHERE id = $1`, [row.current_version_id]);
  assert.deepEqual(version, { commission_bps: 1500, customer_total_cents: 34500, steering_allowance: 2 });
  const [jobRow] = await sql<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [id]);
  assert.equal(jobRow.status, 'awarded');
  const [bidRow] = await sql<{ status: string }>(`SELECT status FROM bids WHERE id = $1`, [bidId]);
  assert.equal(bidRow.status, 'accepted');

  const again = await call(accept.POST, { method: 'POST', url: `/api/bids/${bidId}/accept`, params: { id: bidId }, user: CUSTOMER });
  assert.equal(again.status, 409);

  // unsigned / badly signed webhooks are rejected
  const unsigned = await call(webhook.POST, { method: 'POST', url: '/api/billing/webhook', body: '{}' });
  assert.equal(unsigned.status, 400);
  const forged = await call(webhook.POST, { method: 'POST', url: '/api/billing/webhook', body: '{}', headers: { 'stripe-signature': 't=1,v1=deadbeef' } });
  assert.equal(forged.status, 400);

  const event = stripeEvent('checkout.session.completed', {
    id: row.stripe_checkout_session_id, object: 'checkout.session', mode: 'payment', status: 'complete',
    payment_status: 'paid', amount_total: 34500, currency: 'eur', payment_intent: 'pi_test_accept_1',
    metadata: { kind: 'contract', contract_id: contractId },
  });
  const first = await postWebhook(event);
  assert.equal(first.status, 200);
  assert.equal(first.body.received, true);
  assert.notEqual(first.body.duplicate, true);

  const [active] = await sql<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [contractId]);
  assert.equal(active.status, 'active');
  const job = await call(jobRoute.GET, { url: `/api/jobs/${id}`, params: { id }, user: CUSTOMER });
  assert.equal(job.body.job.status, 'in_progress');
  const payments = await sql<{ amount_cents: number; status: string; user_id: string; stripe_payment_intent_id: string }>(
    `SELECT amount_cents, status, user_id, stripe_payment_intent_id FROM payments WHERE contract_id = $1`, [contractId]);
  assert.deepEqual(payments, [{ amount_cents: 34500, status: 'succeeded', user_id: CUSTOMER, stripe_payment_intent_id: 'pi_test_accept_1' }]);

  const second = await postWebhook(event);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  const paymentsAfter = await sql(`SELECT id FROM payments WHERE contract_id = $1`, [contractId]);
  assert.equal(paymentsAfter.length, 1);
  const events = await sql<{ status: string }>(`SELECT status FROM stripe_events WHERE id = $1`, [event.id]);
  assert.deepEqual(events, [{ status: 'processed' }]);

  // a different event id for the same session still only produces one payment
  const replay = await postWebhook({ ...event, id: `${String(event.id)}_retry` });
  assert.equal(replay.status, 200);
  assert.equal((await sql(`SELECT id FROM payments WHERE contract_id = $1`, [contractId])).length, 1);

  // refund then dispute bookkeeping
  const refund = await postWebhook(stripeEvent('charge.refunded', {
    id: 'ch_test_1', object: 'charge', payment_intent: 'pi_test_accept_1', amount: 34500, amount_refunded: 34500, currency: 'eur',
    refunds: { object: 'list', data: [{ id: 're_test_1', object: 'refund', amount: 34500, currency: 'eur', status: 'succeeded', reason: 'requested_by_customer' }] },
  }));
  assert.equal(refund.status, 200);
  const [refunded] = await sql<{ status: string; amount_refunded_cents: number }>(
    `SELECT status, amount_refunded_cents FROM payments WHERE contract_id = $1`, [contractId]);
  assert.deepEqual(refunded, { status: 'refunded', amount_refunded_cents: 34500 });
  const refundRows = await sql<{ amount_cents: number; user_id: string }>(`SELECT amount_cents, user_id FROM refunds WHERE contract_id = $1`, [contractId]);
  assert.deepEqual(refundRows, [{ amount_cents: 34500, user_id: CUSTOMER }]);
  const [c2] = await sql<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [contractId]);
  assert.equal(c2.status, 'refunded');
  const [j2] = await sql<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [id]);
  assert.equal(j2.status, 'cancelled');
});

test('checkout amount mismatch does not activate the contract', async () => {
  const id = await openJob('Mismatch job');
  const placed = await bid(id, PROVIDER);
  const res = await call(accept.POST, { method: 'POST', url: `/api/bids/${placed.body.bid.id}/accept`, params: { id: placed.body.bid.id }, user: CUSTOMER });
  const contractId = res.body.contract.id;
  const event = stripeEvent('checkout.session.completed', {
    id: 'cs_test_mismatch', object: 'checkout.session', mode: 'payment', payment_status: 'paid', status: 'complete',
    amount_total: 100, currency: 'eur', payment_intent: 'pi_test_mismatch', metadata: { kind: 'contract', contract_id: contractId },
  });
  const out = await postWebhook(event);
  assert.equal(out.status, 200);
  const [c] = await sql<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [contractId]);
  assert.equal(c.status, 'pending_payment');
  const [e] = await sql<{ status: string }>(`SELECT status FROM stripe_events WHERE id = $1`, [event.id]);
  assert.equal(e.status, 'failed');
});

test('dispute marks payment, contract and job disputed', async () => {
  const id = await openJob('Dispute job');
  const placed = await bid(id, PROVIDER);
  const res = await call(accept.POST, { method: 'POST', url: `/api/bids/${placed.body.bid.id}/accept`, params: { id: placed.body.bid.id }, user: CUSTOMER });
  const contractId = res.body.contract.id;
  await postWebhook(stripeEvent('checkout.session.completed', {
    id: 'cs_test_dispute', object: 'checkout.session', mode: 'payment', payment_status: 'paid', status: 'complete',
    amount_total: 34500, currency: 'eur', payment_intent: 'pi_test_dispute', metadata: { kind: 'contract', contract_id: contractId },
  }));
  const out = await postWebhook(stripeEvent('charge.dispute.created', {
    id: 'dp_test_1', object: 'dispute', charge: 'ch_test_d', payment_intent: 'pi_test_dispute', amount: 34500, currency: 'eur', reason: 'fraudulent', status: 'needs_response',
  }));
  assert.equal(out.status, 200);
  const [p] = await sql<{ status: string }>(`SELECT status FROM payments WHERE contract_id = $1`, [contractId]);
  assert.equal(p.status, 'disputed');
  const [c] = await sql<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [contractId]);
  assert.equal(c.status, 'disputed');
  const [j] = await sql<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [id]);
  assert.equal(j.status, 'disputed');
});

test('an expired checkout releases the job back to open', async () => {
  const id = await openJob('Expiring job');
  const placed = await bid(id, PROVIDER);
  const res = await call(accept.POST, { method: 'POST', url: `/api/bids/${placed.body.bid.id}/accept`, params: { id: placed.body.bid.id }, user: CUSTOMER });
  const contractId = res.body.contract.id;
  const stale = await postWebhook(stripeEvent('checkout.session.expired', {
    id: 'cs_test_some_older_session', object: 'checkout.session', status: 'expired', metadata: { kind: 'contract', contract_id: contractId },
  }));
  assert.equal(stale.status, 200);
  const [pending] = await sql<{ status: string; stripe_checkout_session_id: string }>(
    `SELECT status, stripe_checkout_session_id FROM contracts WHERE id = $1`, [contractId]);
  assert.equal(pending.status, 'pending_payment');
  const out = await postWebhook(stripeEvent('checkout.session.expired', {
    id: pending.stripe_checkout_session_id, object: 'checkout.session', mode: 'payment', status: 'expired', payment_status: 'unpaid',
    metadata: { kind: 'contract', contract_id: contractId },
  }));
  assert.equal(out.status, 200);
  const [c] = await sql<{ status: string }>(`SELECT status FROM contracts WHERE id = $1`, [contractId]);
  assert.equal(c.status, 'cancelled');
  const [j] = await sql<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [id]);
  assert.equal(j.status, 'open');
  const [b] = await sql<{ status: string }>(`SELECT status FROM bids WHERE id = $1`, [placed.body.bid.id]);
  assert.equal(b.status, 'active');
  // and the bid can be accepted again
  const again = await call(accept.POST, { method: 'POST', url: `/api/bids/${placed.body.bid.id}/accept`, params: { id: placed.body.bid.id }, user: CUSTOMER });
  assert.equal(again.status, 201);
});

test('a Stripe failure during accept rolls the bid and job back', async () => {
  const id = await openJob('Stripe down job');
  const placed = await bid(id, PROVIDER);
  stripe.failNext('/v1/checkout/sessions');
  const res = await call(accept.POST, { method: 'POST', url: `/api/bids/${placed.body.bid.id}/accept`, params: { id: placed.body.bid.id }, user: CUSTOMER });
  assert.equal(res.status, 502);
  assert.equal(res.body.error, 'stripe_error');
  const [j] = await sql<{ status: string }>(`SELECT status FROM jobs WHERE id = $1`, [id]);
  assert.equal(j.status, 'open');
  const [b] = await sql<{ status: string }>(`SELECT status FROM bids WHERE id = $1`, [placed.body.bid.id]);
  assert.equal(b.status, 'active');
  const live = await sql(`SELECT id FROM contracts WHERE job_id = $1 AND status NOT IN ('cancelled','refunded')`, [id]);
  assert.equal(live.length, 0);
});

test('credit top-up checkout still increments the balance (existing behaviour)', async () => {
  const event = stripeEvent('checkout.session.completed', {
    id: 'cs_test_topup', object: 'checkout.session', mode: 'payment', payment_status: 'paid',
    metadata: { clerkUserId: 'user_topup', rawDepositAmount: '5.00' },
  });
  const out = await postWebhook(event);
  assert.equal(out.status, 200);
  const [b] = await sql<{ remaining_balance: string }>(`SELECT remaining_balance FROM user_budgets WHERE user_id = 'user_topup'`);
  assert.equal(Number(b.remaining_balance), 5);
  const missing = await postWebhook(stripeEvent('checkout.session.completed', { id: 'cs_test_nometa', object: 'checkout.session', metadata: {} }));
  assert.equal(missing.status, 400);
});
