/**
 * Phase 5 reviews, trust scores and monthly plan credits against the throwaway DB:
 * one review per party per contract, trust recompute (principal + agent version, self-dealing
 * excluded), the profile/badge reads, and credit grants (idempotent per period, the unused
 * remainder expiring, bought credits kept) through the Clerk webhook and the cron.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Webhook } from 'svix';
import { installMocks, resetDb, sql, call, useFakeStripe, stopFakeStripe, notifyState, seedBalance, clerkState } from './helpers';
import { balance, seedContact } from './qa-helpers';
import { seedDelivered, one } from './delivery-helpers';
import type { FakeStripe } from '../support/fake-stripe';

installMocks();
process.env.PAT_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.CRON_SECRET = 'cron-secret-for-integration-tests';
const CLERK_SECRET = `whsec_${randomBytes(24).toString('base64')}`;
process.env.CLERK_WEBHOOK_SECRET = CLERK_SECRET;

let reviewsRoute: typeof import('../../app/api/contracts/[id]/reviews/route');
let acceptRoute: typeof import('../../app/api/contracts/[id]/accept/route');
let reputationRoute: typeof import('../../app/api/profile/reputation/route');
let trustRoute: typeof import('../../app/api/trust/route');
let grantsRoute: typeof import('../../app/api/credits/grants/route');
let creditCron: typeof import('../../app/api/cron/credit-grants/route');
let trustCron: typeof import('../../app/api/cron/trust-decay/route');
let clerkWebhook: typeof import('../../app/api/webhooks/clerk/route');
let grants: typeof import('../../src/lib/credits/grant-service');
let stripe: FakeStripe;

const CUSTOMER = 'user_rv_customer';
const PROVIDER = 'user_rv_provider';
const p = (id: string) => ({ id });
const FIVE = { overall: 5, quality: 5, communication: 4, timeliness: 5, body: 'Clean code, fast replies.' };
const cron = { authorization: `Bearer ${process.env.CRON_SECRET}` };

before(async () => {
  await resetDb();
  stripe = await useFakeStripe();
  reviewsRoute = await import('../../app/api/contracts/[id]/reviews/route');
  acceptRoute = await import('../../app/api/contracts/[id]/accept/route');
  reputationRoute = await import('../../app/api/profile/reputation/route');
  trustRoute = await import('../../app/api/trust/route');
  grantsRoute = await import('../../app/api/credits/grants/route');
  creditCron = await import('../../app/api/cron/credit-grants/route');
  trustCron = await import('../../app/api/cron/trust-decay/route');
  clerkWebhook = await import('../../app/api/webhooks/clerk/route');
  grants = await import('../../src/lib/credits/grant-service');
  await seedContact(CUSTOMER, 'Cara Customer', 'cara@test.local');
  await seedContact(PROVIDER, 'Pat Provider', 'pat@test.local');
});

after(async () => {
  await stopFakeStripe();
  await resetDb();
});

beforeEach(() => {
  notifyState.sent.length = 0;
});

const delivered = (over: Partial<Parameters<typeof seedDelivered>[0]> = {}) => seedDelivered({ customer: CUSTOMER, provider: PROVIDER, stripe, ...over });
const review = (contractId: string, user: string, body: unknown = FIVE) => call(reviewsRoute.POST, { method: 'POST', url: '/x', params: p(contractId), user, body });

async function agentFor(contractId: string, version: string): Promise<string> {
  const [principal] = await sql<{ id: string }>(`SELECT id FROM principals WHERE user_id = $1 AND kind = 'user'`, [PROVIDER]);
  const [agent] = await sql<{ id: string }>(
    `INSERT INTO agent_identities (user_id, owner_principal_id, name, version) VALUES ($1, $2, 'Builder bot', $3) RETURNING id`,
    [PROVIDER, principal.id, version],
  );
  await sql(`UPDATE submissions SET agent_identity_id = $2 WHERE contract_id = $1`, [contractId, agent.id]);
  return agent.id;
}

test('reviews: only after acceptance, once per party, scores 1–5; both sides; the subject is notified', async () => {
  const c = await delivered();
  const agentId = await agentFor(c.contractId, '2.1.0');
  const early = await review(c.contractId, CUSTOMER);
  assert.equal(early.status, 409);
  assert.equal(early.body.error, 'review_not_allowed');
  assert.equal((await call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(c.contractId), user: CUSTOMER })).status, 200);

  assert.equal((await review(c.contractId, CUSTOMER, { ...FIVE, overall: 6 })).status, 400);
  assert.equal((await review(c.contractId, CUSTOMER, { ...FIVE, quality: 0 })).status, 400);
  assert.equal((await review(c.contractId, CUSTOMER, { overall: 5 })).status, 400);
  const r = await review(c.contractId, CUSTOMER);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.review.reviewer_role, 'customer');
  assert.equal(r.body.review.subject_user_id, PROVIDER);
  assert.equal(r.body.review.subject_principal_id, c.providerPrincipalId);
  assert.equal(r.body.review.subject_agent_identity_id, agentId);
  assert.equal(r.body.review.subject_agent_version, '2.1.0');
  const dup = await review(c.contractId, CUSTOMER, { ...FIVE, overall: 1 });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'already_reviewed');
  const prov = await review(c.contractId, PROVIDER, { overall: 4, quality: 4, communication: 5, timeliness: 4 });
  assert.equal(prov.status, 201);
  assert.equal(prov.body.review.subject_user_id, CUSTOMER);
  assert.equal(prov.body.review.subject_agent_identity_id, null);
  assert.equal((await review(c.contractId, 'user_rv_stranger')).status, 404);
  const notes = notifyState.sent.filter((n) => n.type === 'review_received');
  assert.deepEqual(notes.map((n) => [n.userId, n.payload.rating, n.payload.reviewerName]), [[PROVIDER, 5, 'Cara Customer'], [CUSTOMER, 4, 'Pat Provider']]);
  const list = await call(reviewsRoute.GET, { url: '/x', params: p(c.contractId), user: PROVIDER });
  assert.equal(list.body.reviews.length, 2);
  const rows = await sql(`SELECT 1 FROM reviews WHERE contract_id = $1`, [c.contractId]);
  assert.equal(rows.length, 2, 'unique per contract and reviewer');
});

test('trust: recomputed on the review, per principal and per agent version; shown on the profile and badges', async () => {
  const principal = await one<{ score: number; level: string; review_count: number; counted: number; breakdown: { components: Array<{ key: string }> } }>(
    `SELECT score, level, review_count, counted, breakdown FROM trust_scores WHERE subject_type = 'principal' AND user_id = $1`, [PROVIDER]);
  assert.equal(principal.counted, 1);
  assert.equal(principal.review_count, 1);
  assert.equal(principal.level, 'building');
  assert.ok(principal.score > 74, `a clean contract with a 5-star review beats the prior (got ${principal.score})`);
  assert.deepEqual(principal.breakdown.components.map((x) => x.key), ['qa_first_pass', 'qa_severity', 'disputes', 'deadline', 'price_accuracy', 'reviews']);
  const agent = await one<{ agent_version: string; counted: number; subject_key: string }>(
    `SELECT agent_version, counted, subject_key FROM trust_scores WHERE subject_type = 'agent_version' AND user_id = $1`, [PROVIDER]);
  assert.equal(agent.agent_version, '2.1.0');
  assert.equal(agent.counted, 1);
  assert.match(agent.subject_key, /^agent:[0-9a-f-]+:2\.1\.0$/);

  const rep = await call(reputationRoute.GET, { url: '/api/profile/reputation', user: PROVIDER });
  assert.equal(rep.status, 200);
  assert.equal(rep.body.summary.count, 1);
  assert.equal(rep.body.summary.average, 5);
  assert.equal(rep.body.reviews[0].reviewer_name, 'Cara Customer');
  assert.equal(rep.body.reviews[0].reviewer_role, 'customer');
  assert.equal(rep.body.reviews[0].agent_version, '2.1.0');
  assert.equal(rep.body.trust.provider.score, principal.score);
  assert.equal(rep.body.trust.agents.length, 1);
  assert.equal((await call(reputationRoute.GET, { url: '/x', user: null })).status, 401);

  const [{ id: pid }] = await sql<{ id: string }>(`SELECT id FROM principals WHERE user_id = $1 AND kind = 'user'`, [PROVIDER]);
  const [{ id: cid }] = await sql<{ id: string }>(`SELECT id FROM principals WHERE user_id = $1 AND kind = 'user'`, [CUSTOMER]);
  const badges = await call(trustRoute.GET, { url: `/api/trust?principal_ids=${pid},${cid},00000000-0000-4000-8000-000000000000` });
  assert.equal(badges.status, 200);
  assert.equal(badges.body.badges[pid].score, principal.score);
  assert.equal(badges.body.badges[pid].review_count, 1);
  assert.deepEqual(badges.body.badges[cid], { score: null, level: 'new', review_count: 1, average_rating: 4 }, 'the poster badge: reviews from providers');
  assert.equal(Object.keys(badges.body.badges).length, 2);
  assert.equal((await call(trustRoute.GET, { url: '/api/trust?principal_ids=nope' })).status, 400);
});

test('trust: self-dealing (shared Stripe fingerprint) is excluded; the nightly cron recomputes everyone', async () => {
  const SELF_C = 'user_rv_alt_customer';
  const SELF_P = 'user_rv_alt_provider';
  const c = await seedDelivered({ customer: SELF_C, provider: SELF_P, stripe, cardFingerprint: 'shared_card' });
  await sql(`UPDATE provider_profiles SET payout_fingerprints = ARRAY['card:shared_card'] WHERE user_id = $1`, [SELF_P]);
  assert.equal((await call(acceptRoute.POST, { method: 'POST', url: '/x', params: p(c.contractId), user: SELF_C })).status, 200);
  // the payout re-reads fingerprints from Stripe; keep the shared one for the check
  await sql(`UPDATE provider_profiles SET payout_fingerprints = ARRAY['card:shared_card'] WHERE user_id = $1`, [SELF_P]);
  assert.equal((await call(trustCron.GET, { url: '/x' })).status, 401);
  const r = await call(trustCron.GET, { url: '/x', headers: cron });
  assert.equal(r.status, 200);
  assert.ok(r.body.recomputed >= 2);
  const row = await one<{ counted: number; breakdown: { excluded: { self_dealing: number } }; level: string }>(
    `SELECT counted, breakdown, level FROM trust_scores WHERE subject_type = 'principal' AND user_id = $1`, [SELF_P]);
  assert.equal(row.counted, 0);
  assert.equal(row.breakdown.excluded.self_dealing, 1);
  assert.equal(row.level, 'new');
});

// ── monthly plan credits ─────────────────────────────────────────────────────

const ANCHOR = new Date('2026-09-15T08:00:00.000Z');
const OCT = new Date('2026-10-20T00:00:00.000Z');
const NOV = new Date('2026-11-20T00:00:00.000Z');

test('grants: once per user per period, via increment_user_balance with a plan_grant ledger row', async () => {
  const U = 'user_grant_pro';
  await seedBalance(U, 5); // 500 bought credits
  const first = await grants.onSubscriptionEvent({ userId: U, plan: 'pro', status: 'active', anchor: ANCHOR, subscriptionId: 'sub_1', now: OCT });
  assert.equal(first?.status, 'granted');
  assert.equal(await balance(U), 15);
  const again = await grants.onSubscriptionEvent({ userId: U, plan: 'pro', status: 'active', anchor: ANCHOR, subscriptionId: 'sub_1', now: OCT });
  assert.equal(again?.status, 'duplicate');
  assert.equal(await balance(U), 15);
  // concurrent deliveries of the same webhook still grant once
  const U2 = 'user_grant_race';
  const results = await Promise.all([0, 1, 2].map(() => grants.grantForPeriod({ userId: U2, plan: 'plus', anchor: ANCHOR, now: OCT, source: 'webhook' }).catch((e) => e)));
  assert.equal(results.filter((x) => x?.status === 'granted').length, 1);
  assert.equal(await balance(U2), 28);
  const g = await one<{ period: string; plan: string; credits: string; transaction_id: string; balance_after_usd: string }>(
    `SELECT period, plan, credits, transaction_id, balance_after_usd FROM credit_grants WHERE user_id = $1`, [U]);
  assert.equal(g.period, '2026-10-15');
  assert.equal(Number(g.credits), 1000);
  assert.equal(Number(g.balance_after_usd), 15);
  const tx = await one<{ type: string; amount: string }>(`SELECT type, amount FROM balance_transactions WHERE id = $1`, [g.transaction_id]);
  assert.deepEqual([tx.type, Number(tx.amount)], ['plan_grant', 10]);
  assert.equal((await grants.onSubscriptionEvent({ userId: 'user_grant_free', plan: 'free', status: 'active', anchor: ANCHOR, subscriptionId: null, now: OCT })), null);
});

test('grants: the next period expires last month’s unused credits, never bought ones', async () => {
  const U = 'user_grant_pro';
  // spend 300 credits ($3), then buy 200 more ($2) as a top-up
  await sql(`UPDATE user_budgets SET remaining_balance = remaining_balance - 3 WHERE user_id = $1`, [U]);
  await sql(`UPDATE user_budgets SET remaining_balance = remaining_balance + 2 WHERE user_id = $1`, [U]);
  await sql(`INSERT INTO balance_transactions (user_id, type, amount, description, created_at) VALUES ($1, 'deposit', 2, 'Credit top-up ($2)', NOW() + INTERVAL '1 second')`, [U]);
  assert.equal(await balance(U), 14); // 700 left of the grant + 500 + 200 bought
  const view = await call(grantsRoute.GET, { url: '/api/credits/grants', user: U });
  assert.equal(view.status, 200);
  assert.equal(view.body.current.period, '2026-10-15');
  assert.equal(view.body.current.credits, 1000);
  assert.equal(view.body.current.remaining_credits, 700, 'spent from the monthly credits first; the top-up is not counted');

  const nov = await grants.grantForPeriod({ userId: U, plan: 'pro', anchor: ANCHOR, now: NOV, source: 'cron' });
  assert.equal(nov.status, 'granted');
  assert.equal(nov.status === 'granted' && nov.expired_usd, 7);
  assert.equal(await balance(U), 17); // 700 bought + 1,000 new
  const oct = await one<{ expired_credits: string; expired_at: string; expire_transaction_id: string }>(
    `SELECT expired_credits, expired_at, expire_transaction_id FROM credit_grants WHERE user_id = $1 AND period = '2026-10-15'`, [U]);
  assert.equal(Number(oct.expired_credits), 700);
  const exp = await one<{ type: string; amount: string }>(`SELECT type, amount FROM balance_transactions WHERE id = $1`, [oct.expire_transaction_id]);
  assert.deepEqual([exp.type, Number(exp.amount)], ['plan_expiry', 7]);
});

test('grants: the cron grants missed periods for active subscriptions and expires ended ones', async () => {
  const U = 'user_grant_cron';
  await grants.recordSubscription({ userId: U, plan: 'super', status: 'active', anchor: new Date(Date.now() - 40 * 86_400_000), subscriptionId: 'sub_c' });
  assert.equal((await call(creditCron.GET, { url: '/x' })).status, 401);
  const r = await call(creditCron.GET, { url: '/x', headers: cron });
  assert.equal(r.status, 200);
  assert.ok(r.body.granted >= 1);
  assert.equal(await balance(U), 70);
  const again = await call(creditCron.GET, { url: '/x', headers: cron });
  assert.equal(again.body.granted, 0);
  assert.equal(await balance(U), 70);

  const view = await call(grantsRoute.GET, { url: '/api/credits/grants', user: U });
  assert.equal(view.body.plan, 'super');
  assert.equal(view.body.monthly_credits, 7000);
  assert.equal(view.body.current.credits, 7000);
  assert.equal(view.body.current.remaining_credits, 7000);

  // a cancelled subscription: its last grant expires when the period ends
  const C = 'user_grant_cancel';
  await seedBalance(C, 1);
  await grants.grantForPeriod({ userId: C, plan: 'pro', anchor: new Date(Date.now() - 45 * 86_400_000), now: new Date(Date.now() - 40 * 86_400_000), source: 'webhook' });
  assert.equal(await balance(C), 11);
  const ended = await grants.expireEndedGrants(new Date());
  assert.ok(ended >= 1);
  assert.equal(await balance(C), 1, 'only the bought credit is left');
});

test('grants: the cron also grants paid users per Clerk (publicMetadata.plan, else Clerk Billing) that have no subscription row', async () => {
  const day = 86_400_000;
  const META = 'user_clerk_meta_plus';
  const BILL = 'user_clerk_billing_pro';
  const FREE = 'user_clerk_free';
  const KNOWN = 'user_clerk_known_cancelled';
  const LIVE = 'user_clerk_live_grant';
  const user = (meta: Record<string, unknown>, createdAt: number) => ({ emailAddresses: [], publicMetadata: meta, createdAt });
  clerkState.users.set(META, user({ plan: 'plus' }, Date.now() - 40 * day));
  clerkState.users.set(BILL, user({}, Date.now() - 90 * day));
  clerkState.users.set(FREE, user({ plan: 'free_user' }, Date.now() - 5 * day));
  clerkState.users.set(KNOWN, user({ plan: 'pro' }, Date.now() - 50 * day));
  clerkState.users.set(LIVE, user({ plan: 'pro' }, Date.now() - 60 * day));
  clerkState.billing.set(BILL, {
    status: 'active',
    activeAt: Date.now() - 70 * day,
    subscriptionItems: [{ status: 'active', periodStart: Date.now() - 10 * day, plan: { slug: 'pro' } }],
  });
  // the webhook told us KNOWN cancelled: Clerk's metadata doesn't override it
  await grants.recordSubscription({ userId: KNOWN, plan: 'pro', status: 'canceled', anchor: null, subscriptionId: 'sub_known' });
  // LIVE already has this period's grant
  await grants.grantForPeriod({ userId: LIVE, plan: 'pro', anchor: new Date(Date.now() - 3 * day), source: 'webhook' });
  const liveBefore = await balance(LIVE);
  clerkState.billingLookups.length = 0;

  const r = await call(creditCron.GET, { url: '/x', headers: cron });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.clerk.granted, 2);
  assert.equal(r.body.clerk.errors, 0);
  assert.equal(await balance(META), 28, 'plus: 2800 credits');
  assert.equal(await balance(BILL), 10, 'pro via Clerk Billing: 1000 credits');
  assert.equal((await balance(FREE)) ?? 0, 0);
  assert.equal((await balance(KNOWN)) ?? 0, 0);
  assert.equal(await balance(LIVE), liveBefore);
  assert.deepEqual(clerkState.billingLookups, [BILL], 'only users without a plan in metadata are looked up');
  const billGrant = await one<{ plan: string; period_start: string; source: string }>(`SELECT plan, period_start, source FROM credit_grants WHERE user_id = $1`, [BILL]);
  assert.equal(billGrant.plan, 'pro');
  assert.equal(billGrant.source, 'cron');
  assert.ok(Math.abs(Date.parse(billGrant.period_start) - (Date.now() - 10 * day)) < 60_000, 'anchored on the Clerk Billing period start');

  const again = await call(creditCron.GET, { url: '/x', headers: cron });
  assert.equal(again.body.clerk.granted, 0);
  assert.equal(await balance(META), 28);
  assert.equal(await balance(BILL), 10);
  for (const id of [META, BILL, FREE, KNOWN, LIVE]) clerkState.users.delete(id);
  clerkState.billing.clear();
});

test('Clerk webhook: subscription.updated (active) grants the plan credits once', async () => {
  const U = 'user_grant_webhook';
  const wh = new Webhook(CLERK_SECRET);
  const send = async (id: string, payload: Record<string, unknown>) => {
    const body = JSON.stringify(payload);
    const ts = new Date();
    const signature = wh.sign(id, ts, body);
    return call(clerkWebhook.POST, {
      method: 'POST',
      url: '/api/webhooks/clerk',
      body,
      headers: { 'svix-id': id, 'svix-timestamp': String(Math.floor(ts.getTime() / 1000)), 'svix-signature': signature },
    });
  };
  const event = {
    type: 'subscription.updated',
    data: { id: 'csub_1', user_id: U, status: 'active', items: [{ status: 'active', plan: { slug: 'plus' }, period_start: Date.now() - 86_400_000 }] },
  };
  const r = await send('msg_1', event);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await balance(U), 28);
  assert.equal((await send('msg_2', event)).status, 200);
  assert.equal(await balance(U), 28, 'a redelivered or repeated event grants nothing more');
  const sub = await one<{ plan: string; status: string }>(`SELECT plan, status FROM plan_subscriptions WHERE user_id = $1`, [U]);
  assert.deepEqual(sub, { plan: 'plus', status: 'active' });
});
