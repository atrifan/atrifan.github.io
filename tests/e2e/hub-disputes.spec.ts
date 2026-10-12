import { test, expect, type Page, type Request } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { expectNoAdSlots, fulfillJson, guardPage } from './hub-helpers';
import { DISPUTE_IDS, OPEN_ITEMS, disputeItem, mockDisputesApi } from '../support/hub-phase5';

/** Hub admin disputes page `/admin/disputes` (APIs mocked). Behaviour only. */

interface Seen {
  lists: URL[];
  details: string[];
  resolves: Array<{ id: string; body: unknown }>;
}

function track(page: Page): Seen {
  const seen: Seen = { lists: [], details: [], resolves: [] };
  page.on('request', (req: Request) => {
    const url = new URL(req.url());
    if (url.pathname === '/api/admin/disputes' && req.method() === 'GET') seen.lists.push(url);
    const detail = url.pathname.match(/^\/api\/admin\/disputes\/([^/]+)$/);
    if (detail && req.method() === 'GET') seen.details.push(detail[1]);
    const resolve = url.pathname.match(/^\/api\/admin\/disputes\/([^/]+)\/resolve$/);
    if (resolve && req.method() === 'POST') seen.resolves.push({ id: resolve[1], body: req.postDataJSON() });
  });
  return seen;
}

/** Answer POST /resolve with `status`/`body` (registered after mockDisputesApi, so it wins). */
async function mockResolve(page: Page, status = 200, body: unknown = null): Promise<void> {
  await page.route(
    (url) => /^\/api\/admin\/disputes\/[^/]+\/resolve$/.test(url.pathname),
    (route) =>
      fulfillJson(
        route,
        body ?? {
          dispute: { id: DISPUTE_IDS.customer, status: 'resolved', resolution: 'release' },
          contract_status: 'completed',
          refunded_cents: 0,
          reversed_cents: 0,
          transferred_cents: 30000,
        },
        status,
      ),
  );
}

const filter = (page: Page, name: 'Open' | 'Resolved') => page.getByRole('button', { name, exact: true });
const item = (page: Page, jobTitle: string) => page.getByRole('button', { name: new RegExp(jobTitle) });
const decision = (page: Page) => page.getByRole('group', { name: 'Decision' });

async function openDetail(page: Page, jobTitle = 'CSV importer for the shop') {
  await page.goto('/admin/disputes');
  await item(page, jobTitle).click();
  await expect(page.getByRole('heading', { level: 2, name: jobTitle })).toBeVisible();
}

test.describe('admin disputes page, signed out', () => {
  test('redirects to sign-in', async ({ page }) => {
    await guardPage(page);
    await page.goto('/admin/disputes');
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
  });
});

test.describe('admin disputes page, customer', () => {
  test.use({ storageState: storageStatePath('customer') });
  test('is a 404 "Page not found"', async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
    await mockDisputesApi(page);
    await page.goto('/admin/disputes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
  });
});

test.describe('admin disputes page, admin', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
  });

  test('h1 "Disputes"; Open is pressed by default and requests status=open', async ({ page }) => {
    await mockDisputesApi(page);
    const seen = track(page);
    await page.goto('/admin/disputes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Disputes');
    await expect(filter(page, 'Open')).toHaveAttribute('aria-pressed', 'true');
    await expect(filter(page, 'Resolved')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => seen.lists.some((u) => u.searchParams.get('status') === 'open')).toBe(true);
  });

  test('Resolved requests status=resolved and flips aria-pressed; empty → "No resolved disputes."', async ({ page }) => {
    await mockDisputesApi(page, { resolved: [] });
    const seen = track(page);
    await page.goto('/admin/disputes');
    await expect(item(page, 'CSV importer for the shop')).toBeVisible();
    await filter(page, 'Resolved').click();
    await expect(filter(page, 'Resolved')).toHaveAttribute('aria-pressed', 'true');
    await expect(filter(page, 'Open')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => seen.lists.some((u) => u.searchParams.get('status') === 'resolved')).toBe(true);
    await expect(page.getByText('No resolved disputes.')).toBeVisible();
  });

  test('empty open list → "No open disputes."', async ({ page }) => {
    await mockDisputesApi(page, { open: [] });
    await page.goto('/admin/disputes');
    await expect(page.getByText('No open disputes.')).toBeVisible();
  });

  test('each item is a button named by its job title with category and source labels', async ({ page }) => {
    await mockDisputesApi(page);
    await page.goto('/admin/disputes');
    const expected: Array<[string, string, string]> = [
      ['CSV importer for the shop', 'Incomplete', 'Customer'],
      ['Nightly backups for the shop', 'QA rejected', 'QA rejected'],
      ['Logo refresh for the shop', 'Chargeback', 'Chargeback'],
    ];
    for (const [title, category, source] of expected) {
      const b = item(page, title);
      await expect(b).toHaveCount(1);
      await expect(b).toContainText(category);
      await expect(b).toContainText(source);
    }
  });

  const CATEGORY_LABELS: Array<[string, string]> = [
    ['not_as_described', 'Not as described'],
    ['incomplete', 'Incomplete'],
    ['quality', 'Quality problems'],
    ['late', 'Late delivery'],
    ['not_delivered', 'Not delivered'],
    ['other', 'Something else'],
  ];

  test('customer categories are shown with their labels', async ({ page }) => {
    const items = CATEGORY_LABELS.map(([category], i) =>
      disputeItem({ id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`, category, job_title: `Category job ${category}` }),
    );
    await mockDisputesApi(page, { open: items });
    await page.goto('/admin/disputes');
    for (const [category, label] of CATEGORY_LABELS) {
      await expect(item(page, `Category job ${category}`)).toContainText(label);
    }
  });

  test('selecting an item loads the detail: h2 job title and the facts list in EUR', async ({ page }) => {
    await mockDisputesApi(page);
    const seen = track(page);
    await openDetail(page);
    expect(seen.details).toContain(DISPUTE_IDS.customer);
    const facts = page.locator('dl').filter({ hasText: 'Reason' });
    for (const term of ['Reason', 'Evidence', 'Category', 'Paid', 'Bid', 'Already refunded', 'Paid out']) {
      await expect(facts.locator('dt').filter({ hasText: new RegExp(`^\\s*${term}\\s*$`) })).toHaveCount(1);
    }
    await expect(facts).toContainText('Files with a quoted comma lose every field after the comma.');
    await expect(facts).toContainText('Sample file orders-quoted.csv imports with shifted columns.');
    await expect(facts).toContainText('Incomplete');
    await expect(facts).toContainText('€345.00');
    await expect(facts).toContainText('€300.00');
    await expect(facts).toContainText('€0.00');
  });

  test('decision form: three outcomes; Partial refund reveals the amount input', async ({ page }) => {
    await mockDisputesApi(page);
    await openDetail(page);
    for (const r of ['Release payment to the provider', 'Partial refund', 'Full refund']) {
      await expect(decision(page).getByRole('radio', { name: r, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('spinbutton', { name: 'Refund amount (EUR)' })).toHaveCount(0);
    await decision(page).getByRole('radio', { name: 'Partial refund', exact: true }).check();
    await expect(page.getByRole('spinbutton', { name: 'Refund amount (EUR)' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Note to both parties' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolve dispute', exact: true })).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`decision radios use the theme accent, not the browser default (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await mockDisputesApi(page);
      await openDetail(page);
      const radio = decision(page).getByRole('radio', { name: 'Partial refund', exact: true });
      await radio.check();
      const { accent, radioAccent, browserDefault } = await radio.evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-accent)';
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.style.color = 'AccentColor';
        const system = getComputedStyle(probe).color;
        probe.remove();
        return { accent: resolved, radioAccent: getComputedStyle(el).accentColor, browserDefault: system };
      });
      expect(accent).not.toBe(browserDefault);
      expect(radioAccent).toBe(accent);
    });
  }

  test('default_resolution preselects the outcome (QA rejected → Full refund)', async ({ page }) => {
    await mockDisputesApi(page);
    await openDetail(page, 'Nightly backups for the shop');
    await expect(decision(page).getByRole('radio', { name: 'Full refund', exact: true })).toBeChecked();
  });

  test('a note under 3 characters is refused without a request', async ({ page }) => {
    await mockDisputesApi(page);
    await mockResolve(page);
    const seen = track(page);
    await openDetail(page);
    await decision(page).getByRole('radio', { name: 'Release payment to the provider', exact: true }).check();
    await page.getByRole('textbox', { name: 'Note to both parties' }).fill('ok');
    await page.getByRole('button', { name: 'Resolve dispute', exact: true }).click();
    await expect(page.getByText('Add a short note for both parties.')).toBeVisible();
    await page.waitForTimeout(300);
    expect(seen.resolves).toHaveLength(0);
  });

  test('a partial refund without a valid amount is refused without a request', async ({ page }) => {
    await mockDisputesApi(page);
    await mockResolve(page);
    const seen = track(page);
    await openDetail(page);
    await decision(page).getByRole('radio', { name: 'Partial refund', exact: true }).check();
    await page.getByRole('textbox', { name: 'Note to both parties' }).fill('Half of the work is missing.');
    await page.getByRole('button', { name: 'Resolve dispute', exact: true }).click();
    await expect(page.getByText(/^Enter an amount between €0\.01 and/)).toBeVisible();
    await page.getByRole('spinbutton', { name: 'Refund amount (EUR)' }).fill('9999');
    await page.getByRole('button', { name: 'Resolve dispute', exact: true }).click();
    await expect(page.getByText(/^Enter an amount between €0\.01 and/)).toBeVisible();
    await page.waitForTimeout(300);
    expect(seen.resolves).toHaveLength(0);
  });

  test('partial refund posts { outcome, note, refund_cents } in integer cents; success → "Dispute resolved." and the list reloads', async ({
    page,
  }) => {
    await mockDisputesApi(page);
    await mockResolve(page);
    const seen = track(page);
    await openDetail(page);
    const listsBefore = seen.lists.length;
    await decision(page).getByRole('radio', { name: 'Partial refund', exact: true }).check();
    await page.getByRole('spinbutton', { name: 'Refund amount (EUR)' }).fill('50.5');
    await page.getByRole('textbox', { name: 'Note to both parties' }).fill('Half of the work is missing.');
    await page.getByRole('button', { name: 'Resolve dispute', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Dispute resolved.' })).toBeVisible();
    expect(seen.resolves).toEqual([
      { id: DISPUTE_IDS.customer, body: { outcome: 'partial_refund', note: 'Half of the work is missing.', refund_cents: 5050 } },
    ]);
    await expect.poll(() => seen.lists.length).toBeGreaterThan(listsBefore);
  });

  test('release posts exactly { outcome: "release", note }', async ({ page }) => {
    await mockDisputesApi(page);
    await mockResolve(page);
    const seen = track(page);
    await openDetail(page);
    await decision(page).getByRole('radio', { name: 'Release payment to the provider', exact: true }).check();
    await page.getByRole('textbox', { name: 'Note to both parties' }).fill('The delivery matches the spec.');
    await page.getByRole('button', { name: 'Resolve dispute', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Dispute resolved.' })).toBeVisible();
    expect(seen.resolves).toEqual([{ id: DISPUTE_IDS.customer, body: { outcome: 'release', note: 'The delivery matches the spec.' } }]);
  });

  test('an error response shows its message as an alert', async ({ page }) => {
    await mockDisputesApi(page);
    await mockResolve(page, 409, { error: 'invalid_state', message: 'This dispute is already resolved.' });
    await openDetail(page);
    await decision(page).getByRole('radio', { name: 'Full refund', exact: true }).check();
    await page.getByRole('textbox', { name: 'Note to both parties' }).fill('Refunding in full.');
    await page.getByRole('button', { name: 'Resolve dispute', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'This dispute is already resolved.' })).toBeVisible();
  });

  test('a chargeback shows the card-network note instead of the decision form', async ({ page }) => {
    await mockDisputesApi(page);
    await openDetail(page, 'Logo refresh for the shop');
    await expect(page.getByText('Chargebacks are decided by the card network through Stripe.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolve dispute', exact: true })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Decision' })).toHaveCount(0);
  });

  test('no ad slots', async ({ page }) => {
    await mockDisputesApi(page, { open: OPEN_ITEMS });
    await page.goto('/admin/disputes');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Disputes');
    await expectNoAdSlots(page);
  });
});
