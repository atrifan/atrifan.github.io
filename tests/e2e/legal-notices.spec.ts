import { test, expect, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { apiPath, fulfillJson, guardPage, recordRequests, userButton } from './hub-helpers';
import { CREDITS_CONSENT_LABEL, SUBSCRIPTION_CONSENT_LABEL } from '../support/legal';

/**
 * Legal notices on the hub's money pages: the /credits non-refundable notice and the
 * right-of-withdrawal consent before a top-up, the /pricing refund FAQ, and the consent gate
 * in front of the signed-in plan checkout. APIs are mocked with page.route; behaviour only.
 */

const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_fake';

const STATS = {
  remainingBalance: 12.34,
  totalSpent: 1.5,
  totalDeposited: 15,
  purchaseHistory: [{ id: 1, amount: 15, type: 'deposit', description: 'Top-up', createdAt: '2026-10-01T10:00:00Z' }],
  modelSummaries: [],
  deviceSummaries: [],
  dailySpending: [],
  rawDeviceLogs: [],
};

const isCheckout = (u: string) => new URL(u).pathname === '/api/billing/checkout';
const isConsent = (u: string) => new URL(u).pathname === '/api/legal/consent';

async function mockCreditsApis(page: Page): Promise<void> {
  await page.route(apiPath('/api/dashboard/paid-stats'), (route) => fulfillJson(route, STATS));
  await page.route(apiPath('/api/credits/grants'), (route) =>
    fulfillJson(route, { plan: null, monthly_credits: 0, current: null, history: [] }),
  );
}

async function mockCheckout(page: Page): Promise<void> {
  await page.route(apiPath('/api/billing/checkout'), (route) => fulfillJson(route, { url: CHECKOUT_URL }));
}

async function openCredits(page: Page): Promise<void> {
  await page.goto('/credits');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Credits', { timeout: 30_000 });
}

const main = (page: Page) => page.locator('#main');

// ---------------------------------------------------------------------------
// /credits

test.describe('/credits legal notice and withdrawal consent (customer)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
    await mockCreditsApis(page);
  });

  test('says credits are non-refundable and links the payments policy', async ({ page }) => {
    await openCredits(page);
    await expect(main(page).getByText('Credits are non-refundable and have no cash value.')).toBeVisible();
    const link = main(page).getByRole('link', { name: 'Payments, credits and refunds', exact: true });
    await expect(link).toBeVisible();
    expect(new URL((await link.getAttribute('href'))!, page.url()).pathname).toBe('/legal/payments');
  });

  test('an unticked withdrawal checkbox with a "terms" link to #withdrawal', async ({ page }) => {
    await openCredits(page);
    const box = main(page).getByRole('checkbox', { name: CREDITS_CONSENT_LABEL, exact: true });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    const terms = main(page).getByRole('link', { name: 'terms', exact: true });
    await expect(terms).toBeVisible();
    const href = new URL((await terms.getAttribute('href'))!, page.url());
    expect(href.pathname + href.hash).toBe('/legal/terms#withdrawal');
  });

  for (const button of [/^Buy \$5(?!\d)/, /^Buy \$10(?!\d)/, /^Buy \$25(?!\d)/]) {
    test(`unticked: "${button.source}" sends nothing and asks to tick the box`, async ({ page }) => {
      const checkout = recordRequests(page, '/api/billing/checkout');
      await openCredits(page);
      await main(page).getByRole('button', { name: button }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Tick the box to confirm before you buy.' })).toBeVisible();
      await page.waitForTimeout(300);
      expect(checkout).toHaveLength(0);
      expect(page.url()).not.toContain('checkout.stripe.com');
    });
  }

  test('unticked: "Buy credits" with a custom amount sends nothing and asks to tick the box', async ({ page }) => {
    const checkout = recordRequests(page, '/api/billing/checkout');
    await openCredits(page);
    await page.getByRole('spinbutton', { name: 'Custom amount (USD)' }).fill('7');
    await page.getByRole('button', { name: 'Buy credits', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Tick the box to confirm before you buy.' })).toBeVisible();
    await page.waitForTimeout(300);
    expect(checkout).toHaveLength(0);
  });

  test('ticked: "Buy $10" posts { amount: 10, withdrawal_consent: true } and goes to Checkout', async ({ page }) => {
    await mockCheckout(page);
    await openCredits(page);
    await main(page).getByRole('checkbox', { name: CREDITS_CONSENT_LABEL, exact: true }).check();
    const [req] = await Promise.all([
      page.waitForRequest((r) => isCheckout(r.url())),
      main(page).getByRole('button', { name: /^Buy \$10(?!\d)/ }).click(),
    ]);
    expect(req.method()).toBe('POST');
    expect(req.postDataJSON()).toEqual({ amount: 10, withdrawal_consent: true });
    await page.waitForURL(CHECKOUT_URL);
  });

  test('ticked: custom amount 7 posts { amount: 7, withdrawal_consent: true }', async ({ page }) => {
    await mockCheckout(page);
    await openCredits(page);
    await main(page).getByRole('checkbox', { name: CREDITS_CONSENT_LABEL, exact: true }).check();
    await page.getByRole('spinbutton', { name: 'Custom amount (USD)' }).fill('7');
    const [req] = await Promise.all([
      page.waitForRequest((r) => isCheckout(r.url())),
      page.getByRole('button', { name: 'Buy credits', exact: true }).click(),
    ]);
    expect(req.postDataJSON()).toEqual({ amount: 7, withdrawal_consent: true });
  });

  test('after the alert, ticking the box lets the same button send the request', async ({ page }) => {
    await openCredits(page);
    await main(page).getByRole('button', { name: /^Buy \$5(?!\d)/ }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Tick the box to confirm before you buy.' });
    await expect(alert).toBeVisible();
    await main(page).getByRole('checkbox', { name: CREDITS_CONSENT_LABEL, exact: true }).check();
    await mockCheckout(page);
    await Promise.all([
      page.waitForRequest((r) => isCheckout(r.url())),
      main(page).getByRole('button', { name: /^Buy \$5(?!\d)/ }).click(),
    ]);
  });
});

// ---------------------------------------------------------------------------
// /pricing FAQ (public)

test.describe('/pricing refund FAQ', () => {
  test('"Can I get a refund?" says credits are non-refundable and links the payments policy', async ({ page }) => {
    await guardPage(page);
    await page.goto('/pricing');
    const summary = page.locator('summary', { hasText: 'Can I get a refund?' });
    await expect(summary).toHaveCount(1);
    await summary.click();
    const details = page.locator('details', { has: summary });
    await expect(details).toHaveAttribute('open', '');
    await expect(details).toContainText(/non-refundable/i);
    const link = details.getByRole('link', { name: 'Payments, credits and refunds', exact: true });
    await expect(link).toBeVisible();
    expect(new URL((await link.getAttribute('href'))!, page.url()).pathname).toBe('/legal/payments');
  });
});

// ---------------------------------------------------------------------------
// /pricing signed in: consent before the plan checkout

test.describe('/pricing withdrawal consent before choosing a plan (customer)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
  });

  async function openPricing(page: Page): Promise<void> {
    await page.goto('/pricing');
    await expect(userButton(page.getByRole('banner'))).toBeVisible({ timeout: 30_000 });
  }

  const checkoutRegion = (page: Page) => page.getByRole('region', { name: 'Subscription checkout', exact: true });

  test('unticked: the checkbox, the hint, and no checkout region', async ({ page }) => {
    const consent = recordRequests(page, '/api/legal/consent');
    await openPricing(page);
    const box = main(page).getByRole('checkbox', { name: SUBSCRIPTION_CONSENT_LABEL, exact: true });
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    await expect(main(page).getByText('Tick the box above to choose a plan.')).toBeVisible();
    await expect(checkoutRegion(page)).toHaveCount(0);
    expect(consent).toHaveLength(0);
  });

  test('ticking posts the consent; on 201 the checkout region appears', async ({ page }) => {
    await page.route(apiPath('/api/legal/consent'), (route) =>
      fulfillJson(route, { ok: true, id: '11111111-1111-4111-8111-111111111111', terms_version: '1.0' }, 201),
    );
    await openPricing(page);
    const [req] = await Promise.all([
      page.waitForRequest((r) => isConsent(r.url())),
      main(page).getByRole('checkbox', { name: SUBSCRIPTION_CONSENT_LABEL, exact: true }).check(),
    ]);
    expect(req.method()).toBe('POST');
    expect(req.postDataJSON()).toEqual({ purchase: 'subscription', withdrawal_consent: true });
    await expect(checkoutRegion(page)).toBeVisible({ timeout: 30_000 });
    await expect(main(page).getByText('Tick the box above to choose a plan.')).toHaveCount(0);
  });

  test('when the consent request fails an alert shows and the checkout region stays absent', async ({ page }) => {
    await page.route(apiPath('/api/legal/consent'), (route) => fulfillJson(route, { error: 'server_error' }, 500));
    await openPricing(page);
    await Promise.all([
      page.waitForRequest((r) => isConsent(r.url())),
      main(page).getByRole('checkbox', { name: SUBSCRIPTION_CONSENT_LABEL, exact: true }).check(),
    ]);
    await expect(page.getByRole('alert').filter({ hasText: /\S/ }).first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(checkoutRegion(page)).toHaveCount(0);
  });
});
