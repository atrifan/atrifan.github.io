import { test, expect, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { apiPath, expectNoAdSlots, fulfillJson, guardPage, recordRequests, sectionByH2 } from './hub-helpers';
import { NOTIFICATION_TYPES } from '../../src/lib/notify/types';

/** Hub profile page `/profile`: account, Stripe Connect payouts, email notifications, reviews, trust. */

type ConnectStatus = 'none' | 'pending' | 'restricted' | 'enabled' | 'disabled';

const COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH',
];

const PREFS = [
  { type: 'bid_received', label: 'New bids', emailEnabled: true },
  { type: 'qa_verdict', label: 'QA verdicts', emailEnabled: false },
];

function connectStatus(s: ConnectStatus, country: string | null = s === 'none' ? null : 'FR') {
  return {
    connected: s !== 'none',
    account_id: s === 'none' ? null : 'acct_test',
    connect_status: s,
    payouts_enabled: s === 'enabled',
    charges_enabled: s === 'enabled',
    details_submitted: s === 'enabled' || s === 'restricted',
    country,
  };
}

async function mockStatus(page: Page, s: ConnectStatus) {
  await page.route(apiPath('/api/connect/status'), (route) => fulfillJson(route, connectStatus(s)));
}

async function mockPrefs(page: Page, put?: (body: unknown) => { status: number; body: unknown }) {
  await page.route(apiPath('/api/notifications/preferences'), async (route) => {
    const req = route.request();
    if (req.method() === 'PUT' && put) {
      const r = put(req.postDataJSON());
      return fulfillJson(route, r.body, r.status);
    }
    return fulfillJson(route, { preferences: PREFS });
  });
}

async function mockOnboard(page: Page, body: { url: string; account_id: string; kind: string }) {
  await page.route(apiPath('/api/connect/onboard'), (route) => fulfillJson(route, body));
}

const stripe = (page: Page) => sectionByH2(page, 'Stripe payouts');

test.describe('hub profile, signed out', () => {
  test('redirects to sign-in', async ({ page }) => {
    await guardPage(page);
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
  });
});

test.describe('hub profile, signed in (customer)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
    await mockPrefs(page);
  });

  test('h1 "Profile" and the Account section', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profile');
    const account = sectionByH2(page, 'Account');
    await expect(account).toContainText('Cara Customer');
    await expect(account).toContainText('tulzo-e2e-customer+clerk_test@example.com');
    await expect(account.getByRole('link', { name: 'Manage account', exact: true })).toHaveAttribute(
      'href',
      '/profile/account',
    );
  });

  test('Stripe payouts explains why and the commission', async ({ page }) => {
    await page.goto('/profile');
    const s = stripe(page);
    await expect(s).toContainText('You need a linked Stripe account to bid on gigs and get paid.');
    await expect(s).toContainText('commission is added on top');
  });

  test.describe('connect state none', () => {
    test.beforeEach(async ({ page }) => mockStatus(page, 'none'));

    test('"Not linked", a Country select with the 32 countries, and "Link Stripe account"', async ({ page }) => {
      await page.goto('/profile');
      const s = stripe(page);
      await expect(s).toContainText('Not linked');
      const country = s.getByRole('combobox', { name: 'Country' });
      await expect(country).toBeVisible();
      const values = await country.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
      expect(values.filter((v) => v === '').length).toBeLessThanOrEqual(1);
      expect(values.filter((v) => v !== '').sort()).toEqual([...COUNTRIES].sort());
      await expect(s.getByRole('button', { name: 'Link Stripe account', exact: true })).toBeVisible();
    });

    test('Link without a country asks for one and sends nothing', async ({ page }) => {
      const onboard = recordRequests(page, '/api/connect/onboard');
      await page.goto('/profile');
      await stripe(page).getByRole('button', { name: 'Link Stripe account', exact: true }).click();
      await expect(page.getByText('Choose your country first.')).toBeVisible();
      await page.waitForTimeout(300);
      expect(onboard).toHaveLength(0);
    });

    test('Link with DE posts { country: "DE" } and goes to Stripe', async ({ page }) => {
      const url = 'https://connect.stripe.com/setup/e/acct_test/abc';
      await mockOnboard(page, { url, account_id: 'acct_test', kind: 'onboarding' });
      await page.goto('/profile');
      const s = stripe(page);
      await s.getByRole('combobox', { name: 'Country' }).selectOption('DE');
      const [req] = await Promise.all([
        page.waitForRequest((r) => new URL(r.url()).pathname === '/api/connect/onboard'),
        s.getByRole('button', { name: 'Link Stripe account', exact: true }).click(),
      ]);
      expect(req.method()).toBe('POST');
      expect(req.postDataJSON()).toEqual({ country: 'DE' });
      await page.waitForURL(url);
    });
  });

  test('pending: "Onboarding not finished"; Continue posts the stored country', async ({ page }) => {
    await mockStatus(page, 'pending');
    await mockOnboard(page, { url: 'https://connect.stripe.com/setup/e/acct_test/again', account_id: 'acct_test', kind: 'onboarding' });
    await page.goto('/profile');
    const s = stripe(page);
    await expect(s).toContainText('Onboarding not finished');
    const [req] = await Promise.all([
      page.waitForRequest((r) => new URL(r.url()).pathname === '/api/connect/onboard'),
      s.getByRole('button', { name: 'Continue on Stripe', exact: true }).click(),
    ]);
    expect(req.method()).toBe('POST');
    expect(req.postDataJSON()).toEqual({ country: 'FR' });
  });

  test('restricted: "Action needed" with "Continue on Stripe"', async ({ page }) => {
    await mockStatus(page, 'restricted');
    await page.goto('/profile');
    const s = stripe(page);
    await expect(s).toContainText('Action needed');
    await expect(s.getByRole('button', { name: 'Continue on Stripe', exact: true })).toBeVisible();
  });

  test('enabled: "Payouts enabled"; dashboard button opens the Stripe login link', async ({ page }) => {
    const url = 'https://connect.stripe.com/express/acct_test/login';
    await mockStatus(page, 'enabled');
    await mockOnboard(page, { url, kind: 'login', account_id: 'acct_test' });
    await page.goto('/profile');
    const s = stripe(page);
    await expect(s).toContainText('Payouts enabled');
    await expect(s.getByRole('button', { name: 'Link Stripe account', exact: true })).toHaveCount(0);
    const [req] = await Promise.all([
      page.waitForRequest((r) => new URL(r.url()).pathname === '/api/connect/onboard'),
      s.getByRole('button', { name: 'Open Stripe dashboard', exact: true }).click(),
    ]);
    expect(req.method()).toBe('POST');
    await page.waitForURL(url);
  });

  test('disabled: "Disabled by Stripe"', async ({ page }) => {
    await mockStatus(page, 'disabled');
    await page.goto('/profile');
    await expect(stripe(page)).toContainText('Disabled by Stripe');
  });

  test('?connect=return refreshes the status and thanks the user', async ({ page }) => {
    await mockStatus(page, 'pending');
    const status = recordRequests(page, '/api/connect/status');
    await page.goto('/profile?connect=return');
    await expect(page.getByText(/Thanks for finishing with Stripe/)).toBeVisible();
    await expect
      .poll(() => status.some((r) => new URL(r.url()).searchParams.get('refresh') === '1'))
      .toBe(true);
  });

  test('?connect=refresh says the link expired and offers "Continue on Stripe"', async ({ page }) => {
    await mockStatus(page, 'pending');
    await page.goto('/profile?connect=refresh');
    await expect(page.getByText(/Your Stripe link expired/)).toBeVisible();
    await expect(stripe(page).getByRole('button', { name: 'Continue on Stripe', exact: true })).toBeVisible();
  });

  test.describe('email notifications', () => {
    test('every notification type has a switch, grouped Gigs / Payments / QA / Account / Marketplace / Admin, checked by emailEnabled', async ({ page }) => {
      await page.goto('/profile');
      const s = sectionByH2(page, 'Email notifications');
      await expect(s.getByRole('switch')).toHaveCount(NOTIFICATION_TYPES.length);
      await expect(s.getByRole('heading', { level: 3 })).toHaveText(['Gigs', 'Payments', 'QA', 'Account', 'Marketplace', 'Admin']);
      const gigs = s.getByRole('group', { name: 'Gigs' });
      await expect(gigs.getByRole('switch', { name: 'New bids on your jobs', exact: true })).toBeChecked();
      await expect(s.getByRole('group', { name: 'QA' }).getByRole('switch', { name: 'QA verdicts', exact: true })).not.toBeChecked();
      // types the server didn't send default to on
      await expect(s.getByRole('group', { name: 'Payments' }).getByRole('switch', { name: 'Payout sent to you', exact: true })).toBeChecked();
      await expect(s.getByRole('group', { name: 'Account' }).getByRole('switch', { name: 'Reminders to leave a review', exact: true })).toBeChecked();
    });

    test('toggling "New bids on your jobs" PUTs { bid_received: false } and shows "Saved"', async ({ page }) => {
      const bodies: unknown[] = [];
      await mockPrefs(page, (body) => {
        bodies.push(body);
        return {
          status: 200,
          body: { preferences: PREFS.map((p) => (p.type === 'bid_received' ? { ...p, emailEnabled: false } : p)) },
        };
      });
      await page.goto('/profile');
      const sw = sectionByH2(page, 'Email notifications').getByRole('switch', { name: 'New bids on your jobs', exact: true });
      await expect(sw).toBeChecked();
      await sw.click();
      await expect(page.getByText('Saved', { exact: true })).toBeVisible();
      await expect(sw).not.toBeChecked();
      expect(bodies).toEqual([{ preferences: { bid_received: false } }]);
    });

    test('In-app notifications: one switch per group, on by default; switching Gigs off PUTs { inApp: { gigs: false } }', async ({ page }) => {
      const bodies: unknown[] = [];
      await mockPrefs(page, (body) => {
        bodies.push(body);
        return { status: 200, body: { preferences: PREFS } };
      });
      await page.goto('/profile');
      const s = sectionByH2(page, 'In-app notifications');
      await expect(s.getByRole('switch')).toHaveCount(6);
      const gigs = s.getByRole('switch', { name: 'Gigs', exact: true });
      await expect(gigs).toBeChecked();
      await gigs.click();
      await expect.poll(() => bodies).toEqual([{ inApp: { gigs: false } }]);
    });

    test('a 500 shows "Couldn\'t save. Try again." and reverts the switch', async ({ page }) => {
      await mockPrefs(page, () => ({ status: 500, body: { error: 'boom' } }));
      await page.goto('/profile');
      const sw = sectionByH2(page, 'Email notifications').getByRole('switch', { name: 'New bids on your jobs', exact: true });
      await expect(sw).toBeChecked();
      await sw.click();
      await expect(page.getByText(/Couldn.t save\. Try again\./)).toBeVisible();
      await expect(sw).toBeChecked();
    });
  });

  test('Reviews and Trust score sections show their empty states', async ({ page }) => {
    await page.route(apiPath('/api/profile/reputation'), (route) =>
      fulfillJson(route, { reviews: [], summary: { count: 0, average: null, as_provider: 0, as_customer: 0 }, trust: { provider: null, agents: [] } }),
    );
    await page.goto('/profile');
    await expect(sectionByH2(page, 'Reviews about you')).toContainText('No reviews yet');
    await expect(sectionByH2(page, 'Trust score')).toContainText('No trust score yet');
  });

  test('no ad slots', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Profile');
    await expectNoAdSlots(page);
  });
});
