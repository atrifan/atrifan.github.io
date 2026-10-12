import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { signedInRequest } from './hub-helpers';
import {
  ADMIN_ACTIVITY,
  ADMIN_SECTIONS,
  EMPTY_ADMIN_ACTIVITY,
  EMPTY_GIGS_ACTIVITY,
  EMPTY_PUBLISHER_ACTIVITY,
  PUBLISHER_ACTIVITY,
  dataRows,
  horizontalOverflow,
  itemTexts,
  mockAdminActivity,
  mockGigsActivity,
  mockNotifications,
  mockPublisherActivity,
  optionsOf,
  parseCsv,
  prepare,
  sectionWithHeading,
  termValue,
} from '../support/notification-center';

/**
 * Activity views: /marketplace/publisher/activity, /gigs/activity (+ CSV export) and the hub's
 * /admin/activity. Behaviour only; data from page.route mocks (tests/support/notification-center.ts).
 * Project: chromium (desktop 1280x800, path-prefix mode).
 */

const PHONE = { width: 390, height: 844 };

test.describe('activity APIs, signed out', () => {
  for (const p of ['/api/marketplace/publisher/activity', '/api/activity/gigs', '/api/admin/activity']) {
    test(`GET ${p} → 401 { error: "unauthorized" }`, async ({ request }) => {
      const res = await request.get(p);
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    });
  }
});

test.describe('activity pages, signed out', () => {
  for (const p of ['/marketplace/publisher/activity', '/gigs/activity', '/admin/activity']) {
    test(`${p} redirects to sign-in`, async ({ page }) => {
      await prepare(page);
      await page.goto(p);
      await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
    });
  }
});

// ---------------------------------------------------------------------------
// publisher activity

test.describe('/marketplace/publisher/activity', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await prepare(page);
    await mockNotifications(page);
  });

  const chart = (page: Page, unit: 'day' | 'week') => page.getByRole('list', { name: `Installs by ${unit}` });

  test('h1, anonymity note and the totals definition list', async ({ page }) => {
    await mockPublisherActivity(page);
    await page.goto('/marketplace/publisher/activity');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Install activity');
    await expect(page.getByText('Installs are anonymous counts')).toBeVisible();
    const main = page.locator('#main');
    await expect(termValue(main, 'Total installs')).toHaveText(/^\s*42\s*$/);
    await expect(termValue(main, 'Last 7 days')).toHaveText(/^\s*5\s*$/);
    await expect(termValue(main, 'Last 30 days')).toHaveText(/^\s*11\s*$/);
  });

  test('Day is pressed by default; the chart lists installs by day', async ({ page }) => {
    await mockPublisherActivity(page);
    await page.goto('/marketplace/publisher/activity');
    await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(chart(page, 'day')).toBeVisible();
    const texts = await itemTexts(chart(page, 'day'));
    expect(texts).toEqual(
      expect.arrayContaining(['4 Oct 2026: 4 installs', '5 Oct 2026: 2 installs', '6 Oct 2026: 1 install', '10 Oct 2026: 3 installs', '12 Oct 2026: 1 install']),
    );
  });

  test('Week groups by Monday-start weeks and sums the days', async ({ page }) => {
    await mockPublisherActivity(page);
    await page.goto('/marketplace/publisher/activity');
    await page.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(chart(page, 'week')).toBeVisible();
    await expect(chart(page, 'day')).toHaveCount(0);
    const texts = await itemTexts(chart(page, 'week'));
    expect(texts).toEqual(
      expect.arrayContaining(['Week of 28 Sep 2026: 4 installs', 'Week of 5 Oct 2026: 6 installs', 'Week of 12 Oct 2026: 1 install']),
    );
    expect(texts.filter((t) => t.startsWith('Week of'))).toHaveLength(3);
  });

  test('per package: h2 with the name and a table "<name> installs" with Date / Version / Installs', async ({ page }) => {
    await mockPublisherActivity(page);
    await page.goto('/marketplace/publisher/activity');
    for (const pkg of PUBLISHER_ACTIVITY.packages) {
      await expect(page.getByRole('heading', { level: 2, name: pkg.name, exact: true })).toBeVisible();
      const table = page.getByRole('table', { name: `${pkg.name} installs` });
      await expect(table).toBeVisible();
      await expect(table.getByRole('columnheader')).toHaveText(['Date', 'Version', 'Installs']);
      await expect(dataRows(table)).toHaveCount(pkg.timeline.length);
    }
    const gh = page.getByRole('table', { name: 'GitHub MCP installs' });
    const row = dataRows(gh).filter({ hasText: '1.2.0' });
    await expect(row.getByRole('cell')).toHaveText(['10 Oct 2026', '1.2.0', '3']);
  });

  test('no installer identity appears', async ({ page }) => {
    await mockPublisherActivity(page);
    await page.goto('/marketplace/publisher/activity');
    await expect(page.getByRole('table', { name: 'GitHub MCP installs' })).toBeVisible();
    const text = (await page.locator('#main').innerText()).toLowerCase();
    expect(text).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
    expect(text).not.toMatch(/\buser_[a-z0-9]+/);
  });

  test('empty → "No installs yet"', async ({ page }) => {
    await mockPublisherActivity(page, EMPTY_PUBLISHER_ACTIVITY);
    await page.goto('/marketplace/publisher/activity');
    await expect(page.getByText('No installs yet')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('no horizontal scroll at 390px', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await mockPublisherActivity(page);
    await page.goto('/marketplace/publisher/activity');
    await expect(page.getByRole('table', { name: 'GitHub MCP installs' })).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe('/marketplace/publish links to Install activity', () => {
  test.use({ storageState: storageStatePath('admin') });
  test('link "Install activity" → /marketplace/publisher/activity', async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await prepare(page);
    await mockNotifications(page);
    await page.goto('/marketplace/publish');
    await expect(page.getByRole('link', { name: 'Install activity', exact: true })).toHaveAttribute(
      'href',
      '/marketplace/publisher/activity',
    );
  });
});

// ---------------------------------------------------------------------------
// gigs activity

test.describe('/gigs/activity', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await prepare(page);
    await mockNotifications(page);
  });

  const ledger = (page: Page) => page.getByRole('table', { name: 'Activity ledger' });
  const roleSelect = (page: Page) => page.getByLabel('Role', { exact: true });
  const eventSelect = (page: Page) => page.getByLabel('Event', { exact: true });

  test('h1 "My activity"; customer and provider summaries', async ({ page }) => {
    await mockGigsActivity(page);
    await page.goto('/gigs/activity');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My activity');
    const customer = sectionWithHeading(page, 'As a customer');
    const expectedCustomer: Array<[string, string]> = [
      ['Jobs posted', '4'],
      ['Bids received', '7'],
      ['Contracts', '2'],
      ['Payments made', '€345.00'],
      ['Deliveries', '1'],
    ];
    for (const [term, value] of expectedCustomer) await expect(termValue(customer, term)).toHaveText(new RegExp(`^\\s*${value.replace('.', '\\.')}\\s*$`));
    const provider = sectionWithHeading(page, 'As a provider');
    const expectedProvider: Array<[string, string]> = [
      ['Bids placed', '5'],
      ['Contracts won', '3'],
      ['Payouts received', '€600.00'],
      ['Reviews', '6'],
    ];
    for (const [term, value] of expectedProvider) await expect(termValue(provider, term)).toHaveText(new RegExp(`^\\s*${value.replace('.', '\\.')}\\s*$`));
  });

  test('Ledger: heading, filters and the table headers', async ({ page }) => {
    await mockGigsActivity(page);
    await page.goto('/gigs/activity');
    await expect(page.getByRole('heading', { name: 'Ledger', exact: true })).toBeVisible();
    expect(await optionsOf(roleSelect(page))).toEqual([
      { text: 'All roles', value: '' },
      { text: 'Customer', value: 'customer' },
      { text: 'Provider', value: 'provider' },
    ]);
    expect((await optionsOf(eventSelect(page)))[0]?.text).toBe('All events');
    await expect(page.getByLabel('From', { exact: true })).toHaveAttribute('type', 'date');
    await expect(page.getByLabel('To', { exact: true })).toHaveAttribute('type', 'date');
    await expect(ledger(page).getByRole('columnheader')).toHaveText(['Date', 'Role', 'Event', 'Job', 'Amount', 'Commission', 'Status']);
    await expect(dataRows(ledger(page))).toHaveCount(4);
  });

  test('money as €, null money as —, dates as 10 Oct 2026', async ({ page }) => {
    await mockGigsActivity(page);
    await page.goto('/gigs/activity');
    const payment = dataRows(ledger(page)).filter({ hasText: 'CSV importer, phase 1' });
    const cells = payment.getByRole('cell');
    await expect(cells.nth(0)).toHaveText('12 Oct 2026');
    await expect(cells.nth(4)).toHaveText('€345.00');
    await expect(cells.nth(5)).toHaveText('€45.00');
    const posted = dataRows(ledger(page)).filter({ hasText: '=1+2 sheet' }).getByRole('cell');
    await expect(posted.nth(0)).toHaveText('10 Oct 2026');
    await expect(posted.nth(4)).toHaveText('—');
    await expect(posted.nth(5)).toHaveText('—');
  });

  test('Role filter is client-side', async ({ page }) => {
    await mockGigsActivity(page);
    let fetches = 0;
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/activity/gigs') fetches++;
    });
    await page.goto('/gigs/activity');
    await expect(dataRows(ledger(page))).toHaveCount(4);
    const before = fetches;
    await roleSelect(page).selectOption('provider');
    await expect(dataRows(ledger(page))).toHaveCount(2);
    await expect(ledger(page)).toContainText('Logo refresh');
    await expect(ledger(page)).not.toContainText('CSV importer, phase 1');
    await roleSelect(page).selectOption('customer');
    await expect(dataRows(ledger(page))).toHaveCount(2);
    await expect(ledger(page)).toContainText('CSV importer, phase 1');
    expect(fetches).toBe(before);
  });

  test('From / To filter by date, inclusive', async ({ page }) => {
    await mockGigsActivity(page);
    await page.goto('/gigs/activity');
    await expect(dataRows(ledger(page))).toHaveCount(4);
    await page.getByLabel('From', { exact: true }).fill('2026-10-10');
    await expect(dataRows(ledger(page))).toHaveCount(3);
    await page.getByLabel('To', { exact: true }).fill('2026-10-11');
    await expect(dataRows(ledger(page))).toHaveCount(2);
    await expect(ledger(page)).toContainText('Nightly backups "v2"');
    await expect(ledger(page)).toContainText('=1+2 sheet');
  });

  test('Export CSV downloads gigs-activity.csv with the exact header, quoting and formula escaping', async ({ page }) => {
    await mockGigsActivity(page);
    await page.goto('/gigs/activity');
    await expect(dataRows(ledger(page))).toHaveCount(4);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV', exact: true }).click()]);
    expect(download.suggestedFilename()).toBe('gigs-activity.csv');
    const text = await readFile((await download.path())!, 'utf8');
    const body = text;
    expect(body.split(/\r?\n/)[0]).toBe('Date,Role,Event,Job,Amount,Commission,Currency,Status');
    // RFC 4180 quoting on the raw text
    expect(body).toContain('"CSV importer, phase 1"');
    expect(body).toContain('"Nightly backups ""v2"""');
    const rows = parseCsv(body).filter((r) => r.some((c) => c !== ''));
    expect(rows).toHaveLength(5);
    const [, ...data] = rows;
    for (const r of data) expect(r).toHaveLength(8);
    const byJob = new Map(data.map((r) => [r[3], r]));
    const payment = byJob.get('CSV importer, phase 1')!;
    expect(payment[0]).toBe('2026-10-12');
    expect(payment[1].toLowerCase()).toBe('customer');
    expect([payment[4], payment[5], payment[6], payment[7]]).toEqual(['345.00', '45.00', 'EUR', 'paid']);
    const payout = byJob.get('Nightly backups "v2"')!;
    expect([payout[0], payout[4], payout[5], payout[6]]).toEqual(['2026-10-11', '300.00', '', 'EUR']);
    expect(payout[1].toLowerCase()).toBe('provider');
    // a cell starting with = is prefixed with '
    expect(byJob.has("'=1+2 sheet")).toBe(true);
    const posted = byJob.get("'=1+2 sheet")!;
    expect([posted[0], posted[4], posted[5]]).toEqual(['2026-10-10', '', '']);
    // newest first, like the ledger
    expect(data.map((r) => r[0])).toEqual(['2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09']);
  });

  test('Export CSV only has the currently filtered rows', async ({ page }) => {
    await mockGigsActivity(page);
    await page.goto('/gigs/activity');
    await roleSelect(page).selectOption('provider');
    await expect(dataRows(ledger(page))).toHaveCount(2);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV', exact: true }).click()]);
    const body = await readFile((await download.path())!, 'utf8');
    const rows = parseCsv(body).filter((r) => r.some((c) => c !== ''));
    expect(rows[0]).toEqual(['Date', 'Role', 'Event', 'Job', 'Amount', 'Commission', 'Currency', 'Status']);
    expect(rows.slice(1).map((r) => r[3])).toEqual(['Nightly backups "v2"', 'Logo refresh']);
  });

  test('empty ledger → "No activity yet"', async ({ page }) => {
    await mockGigsActivity(page, EMPTY_GIGS_ACTIVITY);
    await page.goto('/gigs/activity');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My activity');
    await expect(page.getByText('No activity yet')).toBeVisible();
  });

  test('390px: no horizontal scroll and the ledger still exposes its column headers', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await mockGigsActivity(page);
    await page.goto('/gigs/activity');
    await expect(dataRows(ledger(page))).toHaveCount(4);
    await expect(ledger(page).getByRole('columnheader')).toHaveText(['Date', 'Role', 'Event', 'Job', 'Amount', 'Commission', 'Status']);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// admin activity

test.describe('/admin/activity, customer (not an admin)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await prepare(page);
  });

  test('is the 404 page', async ({ page }) => {
    await mockNotifications(page);
    await mockAdminActivity(page);
    const res = await page.goto('/admin/activity');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /not found/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Marketplace installs' })).toHaveCount(0);
  });

  test('GET /api/admin/activity → 403 { error: "forbidden" }', async ({ page }) => {
    const request = await signedInRequest(page);
    const res = await request.get('/api/admin/activity');
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });
});

test.describe('/admin/activity, admin', () => {
  test.use({ storageState: storageStatePath('admin') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await prepare(page);
    await mockNotifications(page);
  });

  test('h1 "Activity" and the totals in euros', async ({ page }) => {
    await mockAdminActivity(page);
    await page.goto('/admin/activity');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activity');
    const main = page.locator('#main');
    await expect(termValue(main, 'Installs')).toContainText('12');
    await expect(termValue(main, 'Publishes')).toContainText('3');
    await expect(termValue(main, 'Payments')).toContainText('€690.00');
    await expect(termValue(main, 'Commission earned')).toContainText('€90.00');
    await expect(termValue(main, 'Payouts')).toContainText('€300.00');
    await expect(termValue(main, 'Refunds')).toContainText('€45.00');
    await expect(termValue(main, 'Disputes')).toContainText('1');
    // One payout and one refund read in the singular.
    await expect(main).toContainText('2 payments, 1 payout and 1 refund from 12 Sep 2026 to 12 Oct 2026.');
  });

  test('From / To + Apply requests /api/admin/activity?from=&to=', async ({ page }) => {
    const seen = await mockAdminActivity(page);
    await page.goto('/admin/activity');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activity');
    await page.getByLabel('From', { exact: true }).fill('2026-10-01');
    await page.getByLabel('To', { exact: true }).fill('2026-10-12');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect
      .poll(() => seen.some((u) => u.searchParams.get('from') === '2026-10-01' && u.searchParams.get('to') === '2026-10-12'))
      .toBe(true);
  });

  test('each section is an h2 with a table of its rows', async ({ page }) => {
    await mockAdminActivity(page);
    await page.goto('/admin/activity');
    const counts: Record<(typeof ADMIN_SECTIONS)[number], number> = {
      'Marketplace installs': ADMIN_ACTIVITY.installs.length,
      Publishes: ADMIN_ACTIVITY.publishes.length,
      Payments: ADMIN_ACTIVITY.payments.length,
      Payouts: ADMIN_ACTIVITY.payouts.length,
      Refunds: ADMIN_ACTIVITY.refunds.length,
      Disputes: ADMIN_ACTIVITY.disputes.length,
    };
    for (const name of ADMIN_SECTIONS) {
      await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
      const section = sectionWithHeading(page, name);
      await expect(section.getByRole('table')).toHaveCount(1);
      await expect(dataRows(section.getByRole('table'))).toHaveCount(counts[name]);
    }
    await expect(sectionWithHeading(page, 'Marketplace installs')).toContainText('GitHub MCP');
    await expect(sectionWithHeading(page, 'Payments')).toContainText('€345.00');
    await expect(page.getByText('Nothing in this range')).toHaveCount(0);
  });

  test('empty range → every section says "Nothing in this range"', async ({ page }) => {
    await mockAdminActivity(page, EMPTY_ADMIN_ACTIVITY);
    await page.goto('/admin/activity');
    for (const name of ADMIN_SECTIONS) {
      const section = sectionWithHeading(page, name);
      await expect(section.getByText('Nothing in this range')).toBeVisible();
      await expect(section.getByRole('table')).toHaveCount(0);
    }
  });

  test('390px: no horizontal scroll; tables keep their column headers', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await mockAdminActivity(page);
    await page.goto('/admin/activity');
    await expect(page.getByRole('heading', { level: 2, name: 'Disputes', exact: true })).toBeVisible();
    for (const name of ADMIN_SECTIONS) {
      expect(await sectionWithHeading(page, name).getByRole('columnheader').count(), name).toBeGreaterThan(0);
    }
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
