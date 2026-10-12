import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installMocks, call, useFakeStripe, stopFakeStripe } from './helpers';
import { formToObject, type FakeStripe } from '../support/fake-stripe';
import { Client } from 'pg';

/**
 * POST /api/billing/checkout: a credit top-up. One line item for the credits, no separate
 * processing fee (the 1.3x usage markup covers it), $5 minimum, back to hub /credits.
 * Stripe is the in-memory fake (tests/support/fake-stripe.ts). The buyer must waive the 14-day
 * withdrawal right (`withdrawal_consent: true`); the consent is stored in purchase_consents.
 */
installMocks();

let route: typeof import('../../app/api/billing/checkout/route');
let stripe: FakeStripe;
const URL = '/api/billing/checkout';
const USER = 'user_checkout_buyer';

before(async () => {
  stripe = await useFakeStripe();
  route = await import('../../app/api/billing/checkout/route');
});

after(async () => {
  await stopFakeStripe();
});

beforeEach(() => {
  stripe.requests.length = 0;
});

const sessions = () => stripe.requests.filter((r) => r.method === 'POST' && r.path === '/v1/checkout/sessions');

test('signed out → 401, no Stripe call', async () => {
  const r = await call(route.POST, { method: 'POST', url: URL, body: { amount: 10 }, user: null });
  assert.equal(r.status, 401);
  assert.equal(sessions().length, 0);
});

test('a $10 top-up is one $10 line item for 1,000 credits, with no processing fee', async () => {
  const r = await call(route.POST, { method: 'POST', url: URL, body: { amount: 10, withdrawal_consent: true }, user: USER });
  assert.equal(r.status, 200);
  assert.match(r.body.url, /^https:\/\/checkout\.stripe\.com\//);
  const [s] = sessions();
  const params = formToObject(s.form) as Record<string, any>;
  const items = Object.values(params.line_items as Record<string, any>);
  assert.equal(items.length, 1, 'exactly one line item');
  assert.equal(items[0].price_data.unit_amount, '1000');
  assert.equal(items[0].quantity, '1');
  assert.match(items[0].price_data.product_data.name, /1,000 credits/);
  assert.doesNotMatch(JSON.stringify(params), /[Pp]rocessing [Ff]ee/);
  assert.equal(params.mode, 'payment');
  assert.equal(params.metadata.clerkUserId, USER);
  assert.equal(params.metadata.rawDepositAmount, '10.00');
  assert.equal(params.metadata.credits, '1000');
});

test('success and cancel URLs come back to hub /credits', async () => {
  await call(route.POST, { method: 'POST', url: URL, body: { amount: 5, withdrawal_consent: true }, user: USER });
  const params = formToObject(sessions()[0].form) as Record<string, any>;
  assert.equal(params.success_url, 'http://localhost:3000/credits?topup=success');
  assert.equal(params.cancel_url, 'http://localhost:3000/credits?topup=canceled');
});

for (const [amount, why] of [
  [4, 'below the $5 minimum'],
  [501, 'above $500'],
  [7.5, 'not whole dollars'],
  ['10', 'a string'],
  [null, 'missing'],
] as const) {
  test(`amount ${JSON.stringify(amount)} (${why}) → 400, no Stripe call`, async () => {
    const r = await call(route.POST, { method: 'POST', url: URL, body: { amount, withdrawal_consent: true }, user: USER });
    assert.equal(r.status, 400);
    assert.equal(typeof r.body.error, 'string');
    assert.equal(sessions().length, 0);
  });
}

test('a body that is not JSON → 400', async () => {
  const r = await call(route.POST, { method: 'POST', url: URL, body: 'nope{', user: USER });
  assert.equal(r.status, 400);
});

test('Stripe failing → 502-ish error JSON, not a crash', async () => {
  stripe.failNext('/v1/checkout/sessions');
  const r = await call(route.POST, { method: 'POST', url: URL, body: { amount: 25, withdrawal_consent: true }, user: USER });
  assert.ok(r.status >= 500);
  assert.equal(r.body.error, 'Failed to create checkout session');
});

async function consents(userId: string): Promise<Array<Record<string, any>>> {
  const c = new Client({ connectionString: process.env.GIGS_TEST_PG_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT * FROM ${process.env.GIGS_TEST_SCHEMA}.purchase_consents WHERE user_id = $1 ORDER BY consented_at`, [userId]);
    return r.rows;
  } finally {
    await c.end();
  }
}

for (const [body, why] of [
  [{ amount: 10 }, 'missing'],
  [{ amount: 10, withdrawal_consent: false }, 'false'],
  [{ amount: 10, withdrawal_consent: 'true' }, 'the string "true"'],
] as const) {
  test(`withdrawal consent ${why} → 400 consent_required, no Stripe call, nothing recorded`, async () => {
    const user = `user_no_consent_${why.length}`;
    const r = await call(route.POST, { method: 'POST', url: URL, body, user });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'consent_required');
    assert.equal(sessions().length, 0);
    assert.equal((await consents(user)).length, 0);
  });
}

test('the consent is recorded (user, terms version, what was bought) and sent as session metadata', async () => {
  const user = 'user_consent_recorded';
  const r = await call(route.POST, { method: 'POST', url: URL, body: { amount: 25, withdrawal_consent: true }, user });
  assert.equal(r.status, 200);
  const [row] = await consents(user);
  assert.ok(row, 'a consent row');
  assert.equal(row.purchase, 'credits');
  assert.equal(row.terms_version, '1.0');
  assert.equal(row.amount_cents, 2500);
  assert.equal(row.currency, 'usd');
  assert.match(row.consent_text, /lose my 14-day right of withdrawal/);
  const params = formToObject(sessions()[0].form) as Record<string, any>;
  assert.equal(params.metadata.withdrawal_consent, 'true');
  assert.equal(params.metadata.terms_version, '1.0');
  assert.equal(params.metadata.consent_id, row.id);
});

test('Checkout says the credits are non-refundable, above the pay button and on the line item', async () => {
  await call(route.POST, { method: 'POST', url: URL, body: { amount: 5, withdrawal_consent: true }, user: USER });
  const params = formToObject(sessions()[0].form) as Record<string, any>;
  assert.match(params.custom_text.submit.message, /non-refundable and have no cash value/);
  assert.match(params.custom_text.submit.message, /\/legal\/payments/);
  const item = Object.values(params.line_items as Record<string, any>)[0];
  assert.match(item.price_data.product_data.description, /Non-refundable/);
});
