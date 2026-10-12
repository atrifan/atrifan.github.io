import { expect, test, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { expectNoAdSlots } from './hub-helpers';
import {
  CURSOR_2,
  ITEMS,
  PAGE_2,
  bell,
  bellDialog,
  header,
  horizontalOverflow,
  hrefOf,
  linkName,
  manyItems,
  mockNotifications,
  notification,
  openBell,
  optionsOf,
  prepare,
} from '../support/notification-center';

/**
 * Notification center: the header bell (every surface), its dropdown, /notifications, and the
 * notification API auth. Behaviour only; data comes from page.route mocks of the JSON API
 * (tests/support/notification-center.ts). Project: chromium (desktop 1280x800, path-prefix mode).
 */

const SURFACE_HOMES = ['/', '/marketplace', '/gigs', '/ai', '/chat'] as const;

const signInLink = (page: Page) => page.getByRole('link', { name: 'Sign in', exact: true, includeHidden: true }).first();

// ---------------------------------------------------------------------------
// API auth (no Clerk needed)

test.describe('notification API, signed out', () => {
  test('GET /api/notifications → 401 { error: "unauthorized" }', async ({ request }) => {
    const res = await request.get('/api/notifications');
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  test('GET /api/notifications/unread-count → 401 { error: "unauthorized" }', async ({ request }) => {
    const res = await request.get('/api/notifications/unread-count');
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  test('POST /api/notifications/read → 401 { error: "unauthorized" }', async ({ request }) => {
    const res = await request.post('/api/notifications/read', { data: { all: true } });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });
});

// ---------------------------------------------------------------------------
// bell, signed out

test.describe('bell, signed out', () => {
  for (const home of SURFACE_HOMES) {
    test(`${home}: there is no Notifications button`, async ({ page }) => {
      await prepare(page);
      await page.goto(home);
      await signInLink(page).waitFor({ state: 'attached', timeout: 30_000 });
      await expect(page.getByRole('button', { name: /^Notifications/, includeHidden: true })).toHaveCount(0);
    });
  }
});

// ---------------------------------------------------------------------------
// bell, signed in

test.describe('bell, signed in', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await prepare(page);
  });

  for (const home of SURFACE_HOMES) {
    test(`${home}: the header has the bell`, async ({ page }) => {
      await mockNotifications(page);
      await page.goto(home);
      await expect(bell(page)).toBeVisible({ timeout: 30_000 });
    });
  }

  test('2 unread → name "Notifications, 2 unread" and a visible badge "2"', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/');
    await expect(bell(page)).toHaveAccessibleName('Notifications, 2 unread', { timeout: 30_000 });
    await expect(header(page).getByText('2', { exact: true })).toBeVisible();
  });

  test('0 unread → name exactly "Notifications" and no badge', async ({ page }) => {
    await mockNotifications(page, { items: ITEMS.map((i) => ({ ...i, readAt: i.readAt ?? '2026-10-12T08:00:00.000Z' })) });
    await page.goto('/');
    await expect(bell(page)).toHaveAccessibleName('Notifications', { timeout: 30_000 });
    await expect(header(page).getByText(/^\d+\+?$/)).toHaveCount(0);
  });

  test('more than 99 unread → badge "99+"', async ({ page }) => {
    await mockNotifications(page, { unreadCount: 120 });
    await page.goto('/');
    await expect(bell(page)).toHaveAccessibleName(/^Notifications, (120|99\+) unread$/, { timeout: 30_000 });
    await expect(header(page).getByText('99+', { exact: true })).toBeVisible();
  });

  test('the unread count is re-fetched every 30 seconds', async ({ page }) => {
    await page.clock.install();
    const mock = await mockNotifications(page);
    await page.goto('/');
    await expect(bell(page)).toHaveAccessibleName('Notifications, 2 unread', { timeout: 30_000 });
    const before = mock.counts.length + mock.lists.length;
    mock.setUnread(5);
    await page.clock.fastForward('00:31');
    await expect.poll(() => mock.counts.length + mock.lists.length).toBeGreaterThan(before);
    await expect(bell(page)).toHaveAccessibleName('Notifications, 5 unread');
  });

  test('a poll with a higher unread count is announced in a polite status region', async ({ page }) => {
    await page.clock.install();
    const mock = await mockNotifications(page);
    await page.goto('/');
    await expect(bell(page)).toHaveAccessibleName('Notifications, 2 unread', { timeout: 30_000 });
    mock.setUnread(3);
    await page.clock.fastForward('00:31');
    await expect(page.getByRole('status').filter({ hasText: /^\s*1 new notification\s*$/ })).toHaveCount(1);
    mock.setUnread(6);
    await page.clock.fastForward('00:31');
    await expect(page.getByRole('status').filter({ hasText: /^\s*3 new notifications\s*$/ })).toHaveCount(1);
  });

  test('click opens a dialog "Notifications" with a heading; aria-expanded flips; requests limit=10', async ({ page }) => {
    const mock = await mockNotifications(page);
    await page.goto('/');
    await expect(bell(page)).toHaveAttribute('aria-expanded', 'false', { timeout: 30_000 });
    const dialog = await openBell(page);
    await expect(bell(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
    await expect.poll(() => mock.lists.some((u) => u.searchParams.get('limit') === '10')).toBe(true);
  });

  test('items are links named by title ("Unread: " prefix when unread) with surface hrefs', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/');
    const dialog = await openBell(page);
    for (const item of ITEMS) {
      const link = dialog.getByRole('link', { name: linkName(item), exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', hrefOf(item));
    }
    // spelled out once, so the rule above can't hide a mistake
    await expect(dialog.getByRole('link', { name: 'Unread: New bid on CSV importer', exact: true })).toHaveAttribute('href', '/gigs/jobs/j1');
    await expect(dialog.getByRole('link', { name: 'Payout sent', exact: true })).toHaveAttribute('href', '/credits');
    await expect(dialog.getByRole('link', { name: 'GitHub MCP is live', exact: true })).toHaveAttribute('href', '/marketplace/fx-github-mcp');
  });

  test('shows at most 10 items', async ({ page }) => {
    await mockNotifications(page, { items: manyItems(15), nextCursor: 'more' });
    await page.goto('/');
    const dialog = await openBell(page);
    await expect(dialog.getByRole('link', { name: 'Unread: New bid number 1', exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /^Unread: New bid number \d+$/ })).toHaveCount(10);
    await expect(dialog.getByRole('link', { name: 'Unread: New bid number 11', exact: true })).toHaveCount(0);
  });

  test('empty list → "You\'re all caught up."; Mark all read is disabled', async ({ page }) => {
    await mockNotifications(page, { items: [], page2: [] });
    await page.goto('/');
    const dialog = await openBell(page);
    await expect(dialog.getByText("You're all caught up.")).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Mark all read', exact: true })).toBeDisabled();
  });

  test('Mark all read is disabled when every item is read', async ({ page }) => {
    await mockNotifications(page, { items: ITEMS.map((i) => ({ ...i, readAt: '2026-10-12T08:00:00.000Z' })) });
    await page.goto('/');
    const dialog = await openBell(page);
    await expect(dialog.getByRole('link', { name: 'Payout sent', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Mark all read', exact: true })).toBeDisabled();
  });

  test('Mark all read posts { all: true }; the badge goes and no item stays unread', async ({ page }) => {
    const mock = await mockNotifications(page);
    await page.goto('/');
    const dialog = await openBell(page);
    await expect(dialog.getByRole('link', { name: 'Unread: New bid on CSV importer', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Mark all read', exact: true }).click();
    await expect.poll(() => mock.reads).toEqual([{ all: true }]);
    await expect(bell(page)).toHaveAccessibleName('Notifications');
    await expect(page.getByRole('link', { name: /^Unread: / })).toHaveCount(0);
  });

  test('See all notifications links to /notifications', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/gigs');
    const dialog = await openBell(page);
    const link = dialog.getByRole('link', { name: 'See all notifications', exact: true });
    await expect(link).toHaveAttribute('href', '/notifications');
    await link.click();
    await expect(page).toHaveURL(/\/notifications$/);
  });

  test('clicking an unread item posts { ids: [id] } and navigates to its href', async ({ page }) => {
    const mock = await mockNotifications(page);
    await page.goto('/');
    const dialog = await openBell(page);
    const read = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/notifications/read');
    await dialog.getByRole('link', { name: 'Unread: New bid on CSV importer', exact: true }).click();
    expect((await read).postDataJSON()).toEqual({ ids: ['n1'] });
    await expect(page).toHaveURL(/\/gigs\/jobs\/j1$/);
    expect(mock.reads).toEqual([{ ids: ['n1'] }]);
  });

  test('on open focus moves into the dialog; Escape closes it and returns focus to the bell', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/');
    const dialog = await openBell(page);
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(bell(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(bell(page)).toBeFocused();
  });

  test('opening with the keyboard works too', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/');
    await expect(bell(page)).toBeVisible({ timeout: 30_000 });
    await bell(page).focus();
    await page.keyboard.press('Enter');
    await expect(bellDialog(page)).toBeVisible();
    await expect(bell(page)).toHaveAttribute('aria-expanded', 'true');
  });

  test('clicking outside closes the dialog', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/');
    const dialog = await openBell(page);
    await page.mouse.click(10, 700);
    await expect(dialog).toBeHidden();
    await expect(bell(page)).toHaveAttribute('aria-expanded', 'false');
  });
});

// ---------------------------------------------------------------------------
// bell at 390px

test.describe('bell on a phone (390px)', () => {
  test.use({ storageState: storageStatePath('customer'), viewport: { width: 390, height: 844 } });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await prepare(page);
  });

  test('the bell is in the header without opening Menu', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/');
    await expect(bell(page)).toBeVisible({ timeout: 30_000 });
    await expect(header(page).getByRole('button', { name: 'Menu', exact: true })).toHaveAttribute('aria-expanded', 'false');
  });

  test('the open dialog is a full-width sheet with no horizontal scroll', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/');
    const dialog = await openBell(page);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(370);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// /notifications

const list = (page: Page) => page.getByRole('list', { name: 'Notifications' });
const surfaceSelect = (page: Page) => page.getByLabel('Surface', { exact: true });
const typeSelect = (page: Page) => page.getByLabel('Type', { exact: true });
const unreadOnly = (page: Page) => page.getByRole('checkbox', { name: 'Unread only' });

test.describe('/notifications, signed out', () => {
  test('redirects to sign-in', async ({ page }) => {
    await prepare(page);
    await page.goto('/notifications');
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
  });
});

test.describe('/notifications, signed in', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await prepare(page);
  });

  test('h1 "Notifications", robots noindex, no ad slot', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notifications');
    expect(await page.locator('meta[name="robots"]').first().getAttribute('content')).toMatch(/noindex/);
    await expectNoAdSlots(page);
  });

  test('filters: Surface options, Type starts with "All types" and has bid_received, Unread only', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/notifications');
    expect(await optionsOf(surfaceSelect(page))).toEqual([
      { text: 'All surfaces', value: '' },
      { text: 'Account', value: 'hub' },
      { text: 'AI', value: 'ai' },
      { text: 'Marketplace', value: 'marketplace' },
      { text: 'Gigs', value: 'gigs' },
      { text: 'Chat', value: 'chat' },
    ]);
    const types = await optionsOf(typeSelect(page));
    expect(types[0]).toEqual({ text: 'All types', value: '' });
    expect(types.map((t) => t.value)).toContain('bid_received');
    for (const t of types.slice(1)) expect(t.text, `label of ${t.value}`).not.toBe(t.value);
    await expect(unreadOnly(page)).not.toBeChecked();
  });

  test('changing a filter re-requests with surface=, type=, unread=1', async ({ page }) => {
    const mock = await mockNotifications(page);
    await page.goto('/notifications');
    await expect(list(page)).toBeVisible();
    await surfaceSelect(page).selectOption('gigs');
    await expect.poll(() => mock.lists.some((u) => u.searchParams.get('surface') === 'gigs')).toBe(true);
    await typeSelect(page).selectOption('bid_received');
    await expect
      .poll(() => mock.lists.some((u) => u.searchParams.get('surface') === 'gigs' && u.searchParams.get('type') === 'bid_received'))
      .toBe(true);
    await unreadOnly(page).check();
    await expect
      .poll(() =>
        mock.lists.some(
          (u) => u.searchParams.get('surface') === 'gigs' && u.searchParams.get('type') === 'bid_received' && u.searchParams.get('unread') === '1',
        ),
      )
      .toBe(true);
    await expect(list(page).getByRole('link', { name: 'Unread: New bid on CSV importer', exact: true })).toBeVisible();
    await expect(list(page).getByRole('link', { name: 'Payout sent', exact: true })).toHaveCount(0);
  });

  test('each item: link (name + href), body text and the en-GB date', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/notifications');
    await expect(list(page).getByRole('listitem')).toHaveCount(ITEMS.length);
    for (const item of ITEMS) {
      const row = list(page).getByRole('listitem').filter({ has: page.getByRole('link', { name: linkName(item), exact: true }) });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole('link', { name: linkName(item), exact: true })).toHaveAttribute('href', hrefOf(item));
      await expect(row).toContainText(item.body ?? '');
    }
    const first = list(page).getByRole('listitem').first();
    await expect(first).toContainText('12 Oct 2026');
    await expect(list(page).getByRole('listitem').nth(2)).toContainText('10 Oct 2026');
  });

  test('Mark read: <title> on unread items only; clicking posts { ids } and the button goes', async ({ page }) => {
    const mock = await mockNotifications(page);
    await page.goto('/notifications');
    await expect(page.getByRole('button', { name: /^Mark read: / })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Mark read: Payout sent', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark read: New bid on CSV importer', exact: true }).click();
    await expect.poll(() => mock.reads).toEqual([{ ids: ['n1'] }]);
    await expect(page.getByRole('button', { name: 'Mark read: New bid on CSV importer', exact: true })).toHaveCount(0);
    await expect(list(page).getByRole('link', { name: 'New bid on CSV importer', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark read: QA passed for Nightly backups', exact: true })).toBeVisible();
  });

  test('Mark all read posts { all: true } and clears every unread marker', async ({ page }) => {
    const mock = await mockNotifications(page);
    await page.goto('/notifications');
    await expect(list(page)).toBeVisible();
    await page.locator('#main').getByRole('button', { name: 'Mark all read', exact: true }).click();
    await expect.poll(() => mock.reads).toEqual([{ all: true }]);
    await expect(page.getByRole('button', { name: /^Mark read: / })).toHaveCount(0);
    await expect(list(page).getByRole('link', { name: /^Unread: / })).toHaveCount(0);
  });

  test('Load more fetches cursor=<nextCursor> and appends the older items', async ({ page }) => {
    const mock = await mockNotifications(page, { nextCursor: CURSOR_2 });
    await page.goto('/notifications');
    await expect(list(page).getByRole('listitem')).toHaveCount(ITEMS.length);
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect.poll(() => mock.lists.some((u) => u.searchParams.get('cursor') === CURSOR_2)).toBe(true);
    await expect(list(page).getByRole('listitem')).toHaveCount(ITEMS.length + PAGE_2.length);
    await expect(list(page).getByRole('listitem').last()).toContainText(PAGE_2[0].title);
    await expect(list(page).getByRole('link', { name: linkName(ITEMS[0]), exact: true })).toBeVisible();
    // the second page has no nextCursor
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
  });

  test('no Load more when nextCursor is null', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/notifications');
    await expect(list(page).getByRole('listitem')).toHaveCount(ITEMS.length);
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
  });

  test('no items and no filters → "No notifications yet"', async ({ page }) => {
    await mockNotifications(page, { items: [], page2: [] });
    await page.goto('/notifications');
    await expect(page.getByText('No notifications yet')).toBeVisible();
    await expect(page.getByText('Nothing matches these filters')).toHaveCount(0);
  });

  test('no items with a filter on → "Nothing matches these filters"', async ({ page }) => {
    await mockNotifications(page, { items: [notification({ readAt: '2026-10-12T08:00:00.000Z' })], page2: [] });
    await page.goto('/notifications');
    await expect(list(page).getByRole('link', { name: 'New bid on CSV importer', exact: true })).toBeVisible();
    await unreadOnly(page).check();
    await expect(page.getByText('Nothing matches these filters')).toBeVisible();
    await expect(page.getByText('No notifications yet')).toHaveCount(0);
  });

  test('surface filter with no match → "Nothing matches these filters"', async ({ page }) => {
    await mockNotifications(page);
    await page.goto('/notifications');
    await expect(list(page)).toBeVisible();
    await surfaceSelect(page).selectOption('chat');
    await expect(page.getByText('Nothing matches these filters')).toBeVisible();
  });
});

test.describe('/notifications dates are UTC', () => {
  test.use({ storageState: storageStatePath('customer'), timezoneId: 'Asia/Tokyo' });
  test('23:30Z on 10 Oct shows "10 Oct 2026" in a UTC+9 browser', async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await prepare(page);
    await mockNotifications(page, { items: [notification({ createdAt: '2026-10-10T23:30:00.000Z' })], page2: [] });
    await page.goto('/notifications');
    const item = list(page).getByRole('listitem').first();
    await expect(item).toContainText('10 Oct 2026');
    await expect(item).not.toContainText('11 Oct 2026');
  });
});
