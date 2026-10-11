import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installMocks, call, useFakeStripe, stopFakeStripe } from './helpers';
import { formToObject, type FakeStripe } from '../support/fake-stripe';

/**
 * POST /api/billing/checkout: a credit top-up. One line item for the credits, no separate
 * processing fee (the 1.3x usage markup covers it), $5 minimum, back to hub /credits.
 * Stripe is the in-memory fake (tests/support/fake-stripe.ts).
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
  const r = await call(route.POST, { method: 'POST', url: URL, body: { amount: 10 }, user: USER });
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
  await call(route.POST, { method: 'POST', url: URL, body: { amount: 5 }, user: USER });
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
    const r = await call(route.POST, { method: 'POST', url: URL, body: { amount }, user: USER });
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
  const r = await call(route.POST, { method: 'POST', url: URL, body: { amount: 25 }, user: USER });
  assert.ok(r.status >= 500);
  assert.equal(r.body.error, 'Failed to create checkout session');
});
