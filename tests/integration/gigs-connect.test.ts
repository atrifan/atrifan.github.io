import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installMocks, call, resetDb, sql, useFakeStripe, stopFakeStripe, signedWebhook, stripeEvent } from './helpers';
import { formToObject, type FakeStripe } from '../support/fake-stripe';

installMocks();

let onboard: typeof import('../../app/api/connect/onboard/route');
let status: typeof import('../../app/api/connect/status/route');
let webhook: typeof import('../../app/api/billing/webhook/route');
let stripe: FakeStripe;

const USER = 'user_connect_1';

before(async () => {
  await resetDb();
  stripe = await useFakeStripe();
  onboard = await import('../../app/api/connect/onboard/route');
  status = await import('../../app/api/connect/status/route');
  webhook = await import('../../app/api/billing/webhook/route');
});

after(async () => {
  await stopFakeStripe();
  await resetDb();
});

test('401 without a user', async () => {
  assert.equal((await call(onboard.POST, { method: 'POST', url: '/api/connect/onboard', body: { country: 'DE' }, user: null })).status, 401);
  assert.equal((await call(status.GET, { url: '/api/connect/status', user: null })).status, 401);
});

test('a fresh user is not connected', async () => {
  const res = await call(status.GET, { url: '/api/connect/status', user: USER });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    connected: false, account_id: null, connect_status: 'none', payouts_enabled: false,
    charges_enabled: false, details_submitted: false, country: null,
  });
});

test('onboarding outside EEA/UK/CH is refused', async () => {
  const res = await call(onboard.POST, { method: 'POST', url: '/api/connect/onboard', body: { country: 'US' }, user: USER });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'unsupported_country');
  assert.equal(stripe.requests.filter((r) => r.path === '/v1/accounts').length, 0);
});

test('onboarding creates one Express account and returns an account link', async () => {
  const res = await call(onboard.POST, { method: 'POST', url: '/api/connect/onboard', body: { country: 'de' }, user: USER });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.kind, 'onboarding');
  assert.match(res.body.account_id, /^acct_/);
  assert.match(res.body.url, /^https:\/\//);
  const created = stripe.requests.filter((r) => r.path === '/v1/accounts');
  assert.equal(created.length, 1);
  const params = formToObject(created[0].form) as Record<string, any>;
  assert.equal(params.type, 'express');
  assert.equal(params.country, 'DE');
  assert.equal(params.capabilities.transfers.requested, 'true');
  assert.equal(params.metadata.clerk_user_id, USER);
  const link = stripe.requests.filter((r) => r.path === '/v1/account_links').at(-1)!;
  assert.equal(link.form.type, 'account_onboarding');
  assert.equal(link.form.account, res.body.account_id);

  const again = await call(onboard.POST, { method: 'POST', url: '/api/connect/onboard', body: { country: 'DE' }, user: USER });
  assert.equal(again.body.account_id, res.body.account_id);
  assert.equal(stripe.requests.filter((r) => r.path === '/v1/accounts').length, 1);

  const st = await call(status.GET, { url: '/api/connect/status', user: USER });
  assert.equal(st.body.connected, true);
  assert.equal(st.body.connect_status, 'pending');
  assert.equal(st.body.payouts_enabled, false);
  assert.equal(st.body.country, 'DE');
});

test('account.updated syncs the profile; then onboarding returns a login link', async () => {
  const [{ stripe_account_id: acct }] = await sql<{ stripe_account_id: string }>(
    `SELECT stripe_account_id FROM provider_profiles WHERE user_id = $1`, [USER]);
  const event = stripeEvent('account.updated', {
    id: acct, object: 'account', country: 'DE', payouts_enabled: true, charges_enabled: true, details_submitted: true,
    requirements: { disabled_reason: null, currently_due: [] },
  });
  const { body, headers } = signedWebhook(event);
  const res = await call(webhook.POST, { method: 'POST', url: '/api/billing/webhook', body, headers });
  assert.equal(res.status, 200);
  const st = await call(status.GET, { url: '/api/connect/status', user: USER });
  assert.equal(st.body.payouts_enabled, true);
  assert.equal(st.body.connect_status, 'enabled');
  assert.equal(st.body.details_submitted, true);

  const login = await call(onboard.POST, { method: 'POST', url: '/api/connect/onboard', body: { country: 'DE' }, user: USER });
  assert.equal(login.status, 200);
  assert.equal(login.body.kind, 'login');
  assert.match(login.body.url, /^https:\/\/connect\.stripe\.com\/express\//);
});

test('status?refresh=1 pulls the account from Stripe', async () => {
  const [{ stripe_account_id: acct }] = await sql<{ stripe_account_id: string }>(
    `SELECT stripe_account_id FROM provider_profiles WHERE user_id = $1`, [USER]);
  stripe.accounts.set(acct, {
    id: acct, object: 'account', country: 'DE', payouts_enabled: false, charges_enabled: false, details_submitted: true,
    requirements: { disabled_reason: 'requirements.past_due', currently_due: ['individual.verification.document'] },
  });
  const st = await call(status.GET, { url: '/api/connect/status?refresh=1', user: USER });
  assert.equal(st.status, 200);
  assert.equal(st.body.payouts_enabled, false);
  assert.equal(st.body.connect_status, 'restricted');
});

test('account.updated for an unknown account is acknowledged and ignored', async () => {
  const { body, headers } = signedWebhook(stripeEvent('account.updated', { id: 'acct_unknown', object: 'account', payouts_enabled: true }));
  const res = await call(webhook.POST, { method: 'POST', url: '/api/billing/webhook', body, headers });
  assert.equal(res.status, 200);
});
