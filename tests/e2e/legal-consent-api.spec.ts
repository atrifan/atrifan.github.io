import { test, expect, type APIRequestContext } from '@playwright/test';
import { auth, linkStripe, placeBid, publishJob, uid, uniqueWord } from '../support/gigs-ui';
import {
  LEGAL_ENV_MISSING,
  acceptBidWithConsent,
  checkoutSessionBodies,
  sessionIdFromUrl,
  stripeSession,
  type Json,
} from '../support/legal-gigs';

/**
 * Right-of-withdrawal consent on every paid checkout, from the behaviour contract:
 *   POST /api/billing/checkout { amount, withdrawal_consent }      credit top-ups
 *   POST /api/legal/consent    { purchase: 'subscription', ... }   before the plan checkout
 *   POST /api/bids/{id}/accept { ..., withdrawal_consent }         gigs
 * Runs under the gigs runner (throwaway DB, fake Stripe at STRIPE_FAKE_URL, x-e2e-user identity).
 */
test.skip(LEGAL_ENV_MISSING, 'needs the gigs runner (RESEND_FAKE_URL, JOBS_E2E_AUTH_SECRET)');

const TERMS_VERSION = '1.0';

/** An amount no other spec tops up with, so its Checkout sessions can be told apart. */
const ODD_AMOUNT = 37;

/** Checkout session requests whose line item is ODD_AMOUNT dollars. */
async function oddAmountSessions(request: APIRequestContext): Promise<number> {
  return (await checkoutSessionBodies(request)).filter((b: Json) =>
    Object.values((b.line_items ?? {}) as Record<string, Json>).some((i) => String(i?.price_data?.unit_amount) === String(ODD_AMOUNT * 100)),
  ).length;
}

// ---------------------------------------------------------------------------
// credit top-ups

test.describe('POST /api/billing/checkout: withdrawal consent', () => {
  for (const [label, data] of [
    ['no withdrawal_consent', { amount: ODD_AMOUNT }],
    ['withdrawal_consent: false', { amount: ODD_AMOUNT, withdrawal_consent: false }],
    ['withdrawal_consent: "true" (a string)', { amount: ODD_AMOUNT, withdrawal_consent: 'true' }],
  ] as const) {
    test(`${label} → 400 consent_required and no Stripe call`, async ({ request }) => {
      const before = await oddAmountSessions(request);
      const res = await request.post('/api/billing/checkout', { headers: auth(uid('topupnoconsent')), data });
      expect(res.status(), await res.text()).toBe(400);
      expect(await res.json()).toEqual({ error: 'consent_required' });
      await new Promise((r) => setTimeout(r, 500));
      expect(await oddAmountSessions(request)).toBe(before);
    });
  }

  test('with consent → 200 { url }; the session carries the consent metadata and the non-refundable notice', async ({ request }) => {
    const user = uid('topupconsent');
    const res = await request.post('/api/billing/checkout', { headers: auth(user), data: { amount: 10, withdrawal_consent: true } });
    expect(res.status(), await res.text()).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    const session = await stripeSession(request, sessionIdFromUrl(url));
    expect(session.metadata.withdrawal_consent).toBe('true');
    expect(session.metadata.terms_version).toBe(TERMS_VERSION);
    expect(typeof session.metadata.consent_id).toBe('string');
    expect(session.metadata.consent_id.length).toBeGreaterThan(0);

    const created = (await checkoutSessionBodies(request)).find((b: Json) => b.metadata?.consent_id === session.metadata.consent_id);
    expect(created, 'the recorded Checkout session request').toBeTruthy();
    expect(String(created.custom_text?.submit?.message ?? '')).toMatch(/non-refundable/i);
  });

  test('two consented top-ups get two different consent ids', async ({ request }) => {
    const user = uid('topuptwice');
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await request.post('/api/billing/checkout', { headers: auth(user), data: { amount: 5, withdrawal_consent: true } });
      expect(res.status(), await res.text()).toBe(200);
      const session = await stripeSession(request, sessionIdFromUrl(((await res.json()) as { url: string }).url));
      ids.push(session.metadata.consent_id);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });
});

// ---------------------------------------------------------------------------
// subscription consent

test.describe('POST /api/legal/consent', () => {
  test('subscription with consent → 201 { ok, id, terms_version: "1.0" }', async ({ request }) => {
    const res = await request.post('/api/legal/consent', {
      headers: auth(uid('subconsent')),
      data: { purchase: 'subscription', withdrawal_consent: true },
    });
    expect(res.status(), await res.text()).toBe(201);
    const body = (await res.json()) as { ok: boolean; id: string; terms_version: string };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.terms_version).toBe(TERMS_VERSION);
  });

  for (const [label, data] of [
    ['missing withdrawal_consent', { purchase: 'subscription' }],
    ['withdrawal_consent: false', { purchase: 'subscription', withdrawal_consent: false }],
  ] as const) {
    test(`${label} → 400 consent_required`, async ({ request }) => {
      const res = await request.post('/api/legal/consent', { headers: auth(uid('subnoconsent')), data });
      expect(res.status(), await res.text()).toBe(400);
      expect(await res.json()).toEqual({ error: 'consent_required' });
    });
  }

  for (const [label, data] of [
    ['unknown purchase', { purchase: 'yacht', withdrawal_consent: true }],
    ['missing purchase', { withdrawal_consent: true }],
  ] as const) {
    test(`${label} → 400 invalid_request`, async ({ request }) => {
      const res = await request.post('/api/legal/consent', { headers: auth(uid('subbad')), data });
      expect(res.status(), await res.text()).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_request' });
    });
  }

  test('signed out → 401', async ({ request }) => {
    const res = await request.post('/api/legal/consent', { data: { purchase: 'subscription', withdrawal_consent: true } });
    expect(res.status()).toBe(401);
  });

  test('two consents get two ids', async ({ request }) => {
    const user = uid('subtwice');
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await request.post('/api/legal/consent', { headers: auth(user), data: { purchase: 'subscription', withdrawal_consent: true } });
      expect(res.status()).toBe(201);
      ids.push(((await res.json()) as { id: string }).id);
    }
    expect(ids[0]).not.toBe(ids[1]);
  });
});

// ---------------------------------------------------------------------------
// gigs bid acceptance

test.describe('POST /api/bids/{id}/accept: withdrawal consent', () => {
  async function seedBid(request: APIRequestContext): Promise<{ customer: string; bidId: string }> {
    const customer = uid('consentcust');
    const provider = uid('consentprov');
    await linkStripe(request, provider);
    const job = await publishJob(request, customer, {
      title: `Consent job ${uniqueWord('consent')}`,
      budget_min_cents: 20000,
      budget_max_cents: 40000,
    });
    const bid = await placeBid(request, provider, job.id, { price_cents: 30000, eta_days: 5, plan: 'Build the importer and a README.' });
    return { customer, bidId: bid.id };
  }

  test('without consent → 400 consent_required and the bid can still be accepted', async ({ request }) => {
    const { customer, bidId } = await seedBid(request);
    for (const data of [{}, { withdrawal_consent: false }, { qa_checks: ['basic'] }]) {
      const res = await request.post(`/api/bids/${bidId}/accept`, { headers: auth(customer), data });
      expect(res.status(), await res.text()).toBe(400);
      expect(await res.json()).toEqual({ error: 'consent_required' });
    }
    // The bid stayed active: accepting it with consent still works.
    const ok = await acceptBidWithConsent(request, customer, bidId);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
  });

  test('with consent → 201; the Checkout session metadata records the consent', async ({ request }) => {
    const { customer, bidId } = await seedBid(request);
    const { status, body } = await acceptBidWithConsent(request, customer, bidId, { qa_checks: ['basic'] });
    expect(status, JSON.stringify(body)).toBe(201);
    expect(body.contract?.id).toBeTruthy();
    expect(body.checkout_url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const session = await stripeSession(request, sessionIdFromUrl(body.checkout_url));
    expect(session.metadata.withdrawal_consent).toBe('true');
    expect(session.metadata.terms_version).toBe(TERMS_VERSION);
  });
});
