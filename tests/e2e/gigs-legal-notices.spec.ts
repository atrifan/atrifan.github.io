import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import {
  GIGS_ENV_MISSING,
  linkStripe,
  mockStripeCheckout,
  openGigs,
  placeBid,
  publishJob,
  signIn,
  uid,
  uniqueWord,
} from '../support/gigs-ui';
import { contractAt, deliveryUrl, PHASE5_ENV_MISSING } from '../support/gigs-delivery';
import { DISPUTE_CLAIM_LINE, GIGS_CONSENT_LABEL } from '../support/legal';
import { LEGAL_ENV_MISSING, acceptBidWithConsent } from '../support/legal-gigs';

/**
 * Legal notices in the gigs flow, from the behaviour contract: the withdrawal consent in the
 * "Accept this bid" dialog, and the dispute / claim windows (JOBS_AUTO_ACCEPT_DAYS and
 * JOBS_POST_ACCEPT_CLAIM_DAYS at their defaults, 7 and 14) with a link to the payments policy on
 * the dialog, the contract page and the delivery page. Runs under `npm run test:e2e:gigs`.
 */
test.skip(GIGS_ENV_MISSING || LEGAL_ENV_MISSING, 'needs the gigs runner');

async function seedBid(request: APIRequestContext, word: string): Promise<{ owner: string; jobId: string; bidId: string; plan: string }> {
  const owner = uid(`${word}owner`);
  const provider = uid(`${word}prov`);
  await linkStripe(request, provider);
  const job = await publishJob(request, owner, {
    title: `Legal notices job ${word}`,
    budget_min_cents: 20000,
    budget_max_cents: 40000,
  });
  const plan = `Plan ${word}: stream, validate, test.`;
  const bid = await placeBid(request, provider, job.id, { price_cents: 30000, eta_days: 5, plan, included_steering_credits: 1 });
  return { owner, jobId: job.id, bidId: bid.id, plan };
}

async function openAcceptDialog(page: Page, plan: string): Promise<Locator> {
  const item = page
    .getByRole('list', { name: 'Bids' })
    .getByRole('listitem')
    .filter({ hasText: plan });
  await item.getByRole('button', { name: 'Accept bid' }).click();
  const dialog = page.getByRole('dialog', { name: 'Accept this bid' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectDisputeLine(scope: Locator, page: Page): Promise<void> {
  await expect(scope).toContainText(DISPUTE_CLAIM_LINE);
  const link = scope.getByRole('link', { name: 'Payments, credits and refunds', exact: true }).first();
  await expect(link).toBeVisible();
  expect(new URL((await link.getAttribute('href'))!, page.url()).pathname).toBe('/legal/payments');
}

test.describe('accept dialog: withdrawal consent', () => {
  test('an unticked consent checkbox and the dispute / claim line', async ({ page, context, request }) => {
    const { owner, jobId, plan } = await seedBid(request, uniqueWord('lnotice'));
    await signIn(context, owner);
    await openGigs(page, `/gigs/jobs/${jobId}`, { signedIn: true });
    const dialog = await openAcceptDialog(page, plan);
    const box = dialog.getByRole('checkbox', { name: GIGS_CONSENT_LABEL, exact: true });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    await expectDisputeLine(dialog, page);
  });

  test('unticked: "Continue to payment" sends nothing and asks to tick the box', async ({ page, context, request }) => {
    const { owner, jobId, bidId, plan } = await seedBid(request, uniqueWord('lunticked'));
    await signIn(context, owner);
    await mockStripeCheckout(page);
    const accepts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === `/api/bids/${bidId}/accept`) accepts.push(r.url());
    });
    await openGigs(page, `/gigs/jobs/${jobId}`, { signedIn: true });
    const dialog = await openAcceptDialog(page, plan);
    await dialog.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Tick the box to confirm before you pay.' })).toBeVisible();
    await page.waitForTimeout(500);
    expect(accepts).toHaveLength(0);
    await expect(dialog).toBeVisible();
    expect(page.url()).not.toContain('checkout.stripe.com');
  });

  test('ticked: the accept request carries withdrawal_consent: true and goes to Checkout', async ({ page, context, request }) => {
    const { owner, jobId, bidId, plan } = await seedBid(request, uniqueWord('lticked'));
    await signIn(context, owner);
    await mockStripeCheckout(page);
    await openGigs(page, `/gigs/jobs/${jobId}`, { signedIn: true });
    const dialog = await openAcceptDialog(page, plan);
    await dialog.getByRole('checkbox', { name: GIGS_CONSENT_LABEL, exact: true }).check();
    const statuses: number[] = [];
    await page.route(`**/api/bids/${bidId}/accept`, async (route) => {
      const upstream = await route.fetch();
      statuses.push(upstream.status());
      await route.fulfill({ response: upstream });
    });
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === `/api/bids/${bidId}/accept`),
      dialog.getByRole('button', { name: 'Continue to payment' }).click(),
    ]);
    expect((req.postDataJSON() as { withdrawal_consent?: unknown }).withdrawal_consent).toBe(true);
    await expect.poll(() => statuses[0]).toBe(201);
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//);
  });
});

test.describe('contract and delivery pages: dispute / claim line', () => {
  test('the contract page shows the dispute / claim line with the payments link', async ({ page, context, request }) => {
    const { owner, bidId } = await seedBid(request, uniqueWord('lcontract'));
    const accepted = await acceptBidWithConsent(request, owner, bidId);
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
    await signIn(context, owner);
    await openGigs(page, `/gigs/contracts/${accepted.body.contract.id}`, { signedIn: true });
    await expect(page.getByRole('heading', { level: 1, name: /^Contract/ })).toBeVisible();
    await expectDisputeLine(page.locator('#main'), page);
  });

  test('the delivery page shows the dispute / claim line with the payments link', async ({ page, context, request }) => {
    test.skip(PHASE5_ENV_MISSING, 'gigs QA e2e env not set');
    test.setTimeout(120_000);
    const word = uniqueWord('ldelivery');
    const c = await contractAt(request, {
      customer: uid(`${word}cust`),
      provider: uid(`${word}prov`),
      title: `Legal delivery ${word}`,
      stage: 'delivered',
    });
    await signIn(context, c.customer);
    await openGigs(page, deliveryUrl(c.contractId), { signedIn: true });
    await expect(page.getByRole('heading', { name: 'Delivered commit' }).first()).toBeVisible();
    await expectDisputeLine(page.locator('#main'), page);
  });
});
