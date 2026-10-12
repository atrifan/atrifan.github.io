import { test, expect, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { apiPath, expectNoAdSlots, fulfillJson, guardPage, recordRequests } from './hub-helpers';

/** Hub credits page `/credits`: balance, history, plan, top-ups through Stripe Checkout (mocked). */

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

async function mockStats(page: Page, stats: unknown = STATS) {
  await page.route(apiPath('/api/dashboard/paid-stats'), (route) => fulfillJson(route, stats));
}

async function mockCheckout(page: Page) {
  await page.route(apiPath('/api/billing/checkout'), (route) => fulfillJson(route, { url: CHECKOUT_URL }));
}

const isCheckout = (u: string) => new URL(u).pathname === '/api/billing/checkout';

test.describe('hub credits, signed out', () => {
  test('redirects to sign-in', async ({ page }) => {
    await guardPage(page);
    await page.goto('/credits');
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
  });
});

test.describe('hub credits, signed in (customer)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
    await mockStats(page);
  });

  test('h1 "Credits" with the balance in credits and dollars', async ({ page }) => {
    await page.goto('/credits');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Credits');
    await expect(page.getByText('1,234 credits').first()).toBeVisible();
    await expect(page.getByText('$12.34').first()).toBeVisible();
  });

  test('"Transaction history" table lists the top-up', async ({ page }) => {
    await page.goto('/credits');
    const table = page.getByRole('table', { name: 'Transaction history' });
    await expect(table).toBeVisible();
    for (const h of ['Date', 'Description', 'Credits', 'Amount']) {
      await expect(table.getByRole('columnheader', { name: h, exact: true })).toBeVisible();
    }
    const row = table.getByRole('row').filter({ hasText: 'Top-up' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('+1,500');
    await expect(row).toContainText('$15.00');
  });

  test('empty history says "No transactions yet"', async ({ page }) => {
    await mockStats(page, { ...STATS, purchaseHistory: [] });
    await page.goto('/credits');
    await expect(page.getByText('No transactions yet')).toBeVisible();
  });

  test('shows the Free plan and its monthly credits', async ({ page }) => {
    await page.goto('/credits');
    await expect(page.locator('main')).toContainText('Free plan');
    await expect(page.locator('main')).toContainText('0 credits a month');
  });

  // Credits per button follow 1 credit = $0.01 with no processing fee (inferred from the pricing contract).
  for (const [amount, credits] of [
    [5, '500 credits'],
    [10, '1,000 credits'],
    [25, '2,500 credits'],
  ] as const) {
    test(`"Buy $${amount}" button mentions ${credits}`, async ({ page }) => {
      await page.goto('/credits');
      const button = page.getByRole('button', { name: new RegExp(`^Buy \\$${amount}(?!\\d)`) });
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAccessibleName(new RegExp(credits));
    });
  }

  test('"Buy $10" posts { amount: 10, withdrawal_consent: true } and goes to Stripe Checkout', async ({ page }) => {
    await mockCheckout(page);
    await page.goto('/credits');
    await page.getByRole('checkbox', { name: /lose my 14-day right of withdrawal/ }).check();
    const [req] = await Promise.all([
      page.waitForRequest((r) => isCheckout(r.url())),
      page.getByRole('button', { name: /^Buy \$10(?!\d)/ }).click(),
    ]);
    expect(req.method()).toBe('POST');
    expect(req.postDataJSON()).toEqual({ amount: 10, withdrawal_consent: true });
    await page.waitForURL(CHECKOUT_URL);
  });

  test('custom amount below $5 is refused without a request', async ({ page }) => {
    const checkout = recordRequests(page, '/api/billing/checkout');
    await page.goto('/credits');
    await page.getByRole('spinbutton', { name: 'Custom amount (USD)' }).fill('4');
    await page.getByRole('checkbox', { name: /lose my 14-day right of withdrawal/ }).check();
    await page.getByRole('button', { name: 'Buy credits', exact: true }).click();
    await expect(page.getByText('The minimum top-up is $5.')).toBeVisible();
    await page.waitForTimeout(300);
    expect(checkout).toHaveLength(0);
  });

  test('custom amount 7 posts { amount: 7, withdrawal_consent: true }', async ({ page }) => {
    await mockCheckout(page);
    await page.goto('/credits');
    await page.getByRole('checkbox', { name: /lose my 14-day right of withdrawal/ }).check();
    await page.getByRole('spinbutton', { name: 'Custom amount (USD)' }).fill('7');
    const [req] = await Promise.all([
      page.waitForRequest((r) => isCheckout(r.url())),
      page.getByRole('button', { name: 'Buy credits', exact: true }).click(),
    ]);
    expect(req.postDataJSON()).toEqual({ amount: 7, withdrawal_consent: true });
    await page.waitForURL(CHECKOUT_URL);
  });

  test('says "No processing fee"', async ({ page }) => {
    await page.goto('/credits');
    await expect(page.getByText(/No processing fee/i).first()).toBeVisible();
  });

  test('?topup=success shows "Payment received"', async ({ page }) => {
    await page.goto('/credits?topup=success');
    await expect(page.getByText(/Payment received/).first()).toBeVisible();
  });

  test('?topup=canceled shows "Checkout canceled"', async ({ page }) => {
    await page.goto('/credits?topup=canceled');
    await expect(page.getByText(/Checkout canceled/).first()).toBeVisible();
  });

  test('no ad slots', async ({ page }) => {
    await page.goto('/credits');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Credits');
    await expectNoAdSlots(page);
  });
});
