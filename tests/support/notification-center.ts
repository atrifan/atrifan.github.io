import { expect, type Locator, type Page, type Request, type Route } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { blockThirdParty } from '../e2e/surface-helpers';
import { hasClerkTestEnv } from '../fixtures/clerk-users';

/**
 * Mock data and `page.route` mocks for the notification center (bell + /notifications) and the
 * activity views (/marketplace/publisher/activity, /gigs/activity, /admin/activity).
 * Shared by tests/e2e/notification-center.spec.ts, tests/e2e/activity-views.spec.ts and the
 * notification-center a11y/visual specs. Shapes follow the behaviour contract; every date is fixed
 * (2026-10-..) so renders are stable. Register mocks BEFORE page.goto.
 */

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const path = (pathname: string) => (url: URL) => url.pathname === pathname;

// ---------------------------------------------------------------------------
// notifications

export type Surface = 'hub' | 'ai' | 'marketplace' | 'gigs' | 'chat';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  surface: Surface;
  url: string;
  count: number;
  readAt: string | null;
  createdAt: string;
}

export function notification(over: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'n1',
    type: 'bid_received',
    title: 'New bid on CSV importer',
    body: 'Pat Provider bid €300.00 on CSV importer.',
    surface: 'gigs',
    url: '/jobs/j1',
    count: 1,
    readAt: null,
    createdAt: '2026-10-12T09:00:00.000Z',
    ...over,
  };
}

/** Newest first: two unread (gigs), one read on the hub, one read on marketplace. */
export const ITEMS: NotificationItem[] = [
  notification({ count: 3, body: '3 new bids on CSV importer.' }),
  notification({
    id: 'n2',
    type: 'qa_verdict',
    title: 'QA passed for Nightly backups',
    body: 'Your delivery passed QA on the first attempt.',
    url: '/contracts/c2',
    createdAt: '2026-10-11T15:30:00.000Z',
  }),
  notification({
    id: 'n3',
    type: 'payout_sent',
    title: 'Payout sent',
    body: '€300.00 is on its way to your bank account.',
    surface: 'hub',
    url: '/credits',
    readAt: '2026-10-11T08:00:00.000Z',
    createdAt: '2026-10-10T08:00:00.000Z',
  }),
  notification({
    id: 'n4',
    type: 'package_approved',
    title: 'GitHub MCP is live',
    body: 'Your package was approved and is now public.',
    surface: 'marketplace',
    url: '/fx-github-mcp',
    readAt: '2026-10-10T07:00:00.000Z',
    createdAt: '2026-10-09T12:00:00.000Z',
  }),
];

/** The expected href of an item in path-prefix mode. */
export const hrefOf = (item: NotificationItem): string => (item.surface === 'hub' ? item.url : `/${item.surface}${item.url}`);

/** The expected accessible name of an item link. */
export const linkName = (item: NotificationItem): string => (item.readAt ? item.title : `Unread: ${item.title}`);

/** Older items returned for `cursor=CURSOR_2` ("Load more"). */
export const CURSOR_2 = 'cursor-page-2';
export const PAGE_2: NotificationItem[] = [
  notification({
    id: 'n5',
    type: 'review_received',
    title: 'New review from Cara',
    body: 'Cara Customer rated your work 5 out of 5.',
    url: '/profile',
    surface: 'hub',
    readAt: '2026-10-08T07:00:00.000Z',
    createdAt: '2026-10-07T10:00:00.000Z',
  }),
];

/** Many unread items, more than the bell shows. */
export function manyItems(n: number): NotificationItem[] {
  return Array.from({ length: n }, (_, i) =>
    notification({
      id: `m${i + 1}`,
      title: `New bid number ${i + 1}`,
      url: `/jobs/m${i + 1}`,
      createdAt: new Date(Date.UTC(2026, 9, 12, 9, 0, 0) - i * 3_600_000).toISOString(),
    }),
  );
}

export interface NotificationMock {
  /** GET /api/notifications URLs, in order. */
  lists: URL[];
  /** GET /api/notifications/unread-count, in order. */
  counts: URL[];
  /** POST /api/notifications/read bodies, in order. */
  reads: unknown[];
  /** Override the unread count both endpoints report (null = computed from the items). */
  setUnread(n: number | null): void;
  /** Replace the first-page items. */
  setItems(items: NotificationItem[]): void;
  unread(): number;
}

export interface NotificationMockOptions {
  items?: NotificationItem[];
  /** nextCursor of the first page; PAGE_2 is served for it. */
  nextCursor?: string | null;
  page2?: NotificationItem[];
  /** Fixed unread count (e.g. 120 for the 99+ badge). Default: unread items. */
  unreadCount?: number;
}

/**
 * Stateful mocks of GET /api/notifications (honours limit, unread, surface, type, cursor),
 * GET /api/notifications/unread-count and POST /api/notifications/read (marks items read).
 */
export async function mockNotifications(page: Page, opts: NotificationMockOptions = {}): Promise<NotificationMock> {
  let items = (opts.items ?? ITEMS).map((i) => ({ ...i }));
  const page2 = (opts.page2 ?? PAGE_2).map((i) => ({ ...i }));
  const nextCursor = opts.nextCursor === undefined ? null : opts.nextCursor;
  let fixedUnread: number | null = opts.unreadCount ?? null;
  const all = () => [...items, ...page2];
  const unread = () => fixedUnread ?? all().filter((i) => !i.readAt).length;

  const mock: NotificationMock = {
    lists: [],
    counts: [],
    reads: [],
    setUnread: (n) => {
      fixedUnread = n;
    },
    setItems: (next) => {
      items = next.map((i) => ({ ...i }));
    },
    unread,
  };

  await page.route(path('/api/notifications'), (route) => {
    const url = new URL(route.request().url());
    mock.lists.push(url);
    const q = url.searchParams;
    const limit = Math.min(50, Math.max(1, Number(q.get('limit') ?? 20) || 20));
    const cursor = q.get('cursor');
    let source = cursor === CURSOR_2 ? page2 : items;
    if (q.get('unread') === '1') source = source.filter((i) => !i.readAt);
    if (q.get('surface')) source = source.filter((i) => i.surface === q.get('surface'));
    if (q.get('type')) source = source.filter((i) => i.type === q.get('type'));
    return json(route, {
      items: source.slice(0, limit),
      nextCursor: cursor === CURSOR_2 ? null : nextCursor,
      unreadCount: unread(),
    });
  });

  await page.route(path('/api/notifications/unread-count'), (route) => {
    mock.counts.push(new URL(route.request().url()));
    return json(route, { count: unread() });
  });

  await page.route(path('/api/notifications/read'), (route) => {
    const body = route.request().postDataJSON() as { ids?: string[]; all?: boolean } | null;
    mock.reads.push(body);
    const now = '2026-10-12T12:00:00.000Z';
    let updated = 0;
    if (body?.all === true) {
      for (const i of all()) {
        if (!i.readAt) {
          i.readAt = now;
          updated++;
        }
      }
      if (fixedUnread !== null) fixedUnread = 0;
    } else if (Array.isArray(body?.ids)) {
      for (const i of all()) {
        if (body.ids.includes(i.id) && !i.readAt) {
          i.readAt = now;
          updated++;
        }
      }
      if (fixedUnread !== null) fixedUnread = Math.max(0, fixedUnread - updated);
    } else {
      return json(route, { error: 'bad_request' }, 400);
    }
    return json(route, { updated, unreadCount: unread() });
  });

  return mock;
}

// ---------------------------------------------------------------------------
// bell

export const header = (page: Page): Locator => page.getByRole('banner');

/** The bell: any button whose name starts with "Notifications". */
export const bell = (page: Page): Locator => header(page).getByRole('button', { name: /^Notifications(,|$)/ });

export const bellDialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Notifications' });

/** Open the bell and wait for the dialog. */
export async function openBell(page: Page): Promise<Locator> {
  await bell(page).click();
  const dialog = bellDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

// ---------------------------------------------------------------------------
// page setup

/** Third parties blocked and (with Clerk test keys) the Clerk testing token, so saved sessions refresh. */
export async function prepare(page: Page): Promise<void> {
  await blockThirdParty(page);
  if (hasClerkTestEnv()) await setupClerkTestingToken({ page });
}

/** Records every request to `pathname` with `method`. */
export function record(page: Page, pathname: string, method = 'GET'): Request[] {
  const seen: Request[] = [];
  page.on('request', (req) => {
    if (req.method() === method && new URL(req.url()).pathname === pathname) seen.push(req);
  });
  return seen;
}

/** The <dd> right after the <dt> with exactly `term` inside `scope`. */
export function termValue(scope: Locator, term: string): Locator {
  return scope
    .locator('dt')
    .filter({ hasText: new RegExp(`^\\s*${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
    .locator('xpath=following-sibling::dd[1]');
}

/** The innermost <section> (or region) holding a heading with exactly this text. */
export function sectionWithHeading(page: Page, name: string): Locator {
  return page
    .locator('section, [role="region"]')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .last();
}

/** Each list item's aria-label, else its text, whitespace-normalised. */
export async function itemTexts(list: Locator): Promise<string[]> {
  return list
    .getByRole('listitem')
    .evaluateAll((els) => els.map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()));
}

/** <option> text + value pairs of a select. */
export async function optionsOf(select: Locator): Promise<Array<{ text: string; value: string }>> {
  return select
    .locator('option')
    .evaluateAll((els) => els.map((el) => ({ text: (el.textContent ?? '').trim(), value: (el as HTMLOptionElement).value })));
}

/** Data rows (rows with cells, not the header row) of a table. */
export const dataRows = (table: Locator): Locator => table.getByRole('row').filter({ has: table.page().getByRole('cell') });

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** RFC 4180 parse (quoted fields, doubled quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// publisher activity

export const PUBLISHER_ACTIVITY = {
  totals: { all: 42, last7: 5, last30: 11 },
  // 4 Oct 2026 is a Sunday; 5 and 12 Oct are Mondays.
  daily: [
    { date: '2026-10-04', installs: 4 },
    { date: '2026-10-05', installs: 2 },
    { date: '2026-10-06', installs: 1 },
    { date: '2026-10-10', installs: 3 },
    { date: '2026-10-12', installs: 1 },
  ],
  packages: [
    {
      id: 'fx-github-mcp',
      name: 'GitHub MCP',
      total: 30,
      timeline: [
        { date: '2026-10-10', version: '1.2.0', installs: 3 },
        { date: '2026-10-05', version: '1.1.0', installs: 2 },
      ],
    },
    {
      id: 'fx-pdf-skill',
      name: 'PDF skill',
      total: 12,
      timeline: [{ date: '2026-10-12', version: '0.3.0', installs: 1 }],
    },
  ],
};

export const EMPTY_PUBLISHER_ACTIVITY = { totals: { all: 0, last7: 0, last30: 0 }, daily: [], packages: [] };

export async function mockPublisherActivity(page: Page, body: unknown = PUBLISHER_ACTIVITY): Promise<void> {
  await page.route(path('/api/marketplace/publisher/activity'), (route) => json(route, body));
}

// ---------------------------------------------------------------------------
// gigs activity

export interface LedgerEntry {
  id: string;
  at: string;
  role: 'customer' | 'provider';
  kind: 'job_posted' | 'bid_received' | 'contract' | 'payment' | 'delivery' | 'bid_placed' | 'contract_won' | 'payout' | 'review';
  jobTitle: string;
  amountCents: number | null;
  commissionCents: number | null;
  status: string;
}

/** Newest first. Titles exercise CSV quoting (comma, quotes) and formula-injection escaping. */
export const LEDGER: LedgerEntry[] = [
  { id: 'l1', at: '2026-10-12T10:00:00.000Z', role: 'customer', kind: 'payment', jobTitle: 'CSV importer, phase 1', amountCents: 34500, commissionCents: 4500, status: 'paid' },
  { id: 'l2', at: '2026-10-11T09:00:00.000Z', role: 'provider', kind: 'payout', jobTitle: 'Nightly backups "v2"', amountCents: 30000, commissionCents: null, status: 'sent' },
  { id: 'l3', at: '2026-10-10T08:00:00.000Z', role: 'customer', kind: 'job_posted', jobTitle: '=1+2 sheet', amountCents: null, commissionCents: null, status: 'open' },
  { id: 'l4', at: '2026-10-09T08:00:00.000Z', role: 'provider', kind: 'bid_placed', jobTitle: 'Logo refresh', amountCents: 12000, commissionCents: null, status: 'pending' },
];

export const GIGS_ACTIVITY = {
  currency: 'eur',
  customer: { jobsPosted: 4, bidsReceived: 7, contracts: 2, deliveries: 1, paymentsCents: 34500, commissionCents: 4500 },
  provider: { bidsPlaced: 5, contractsWon: 3, payoutsCents: 60000, reviews: 6 },
  ledger: LEDGER,
};

export const EMPTY_GIGS_ACTIVITY = {
  currency: 'eur',
  customer: { jobsPosted: 0, bidsReceived: 0, contracts: 0, deliveries: 0, paymentsCents: 0, commissionCents: 0 },
  provider: { bidsPlaced: 0, contractsWon: 0, payoutsCents: 0, reviews: 0 },
  ledger: [],
};

export async function mockGigsActivity(page: Page, body: unknown = GIGS_ACTIVITY): Promise<void> {
  await page.route(path('/api/activity/gigs'), (route) => json(route, body));
}

// ---------------------------------------------------------------------------
// admin activity

export const ADMIN_ACTIVITY = {
  range: { from: '2026-09-12', to: '2026-10-12' },
  currency: 'eur',
  totals: {
    installs: 12,
    publishes: 3,
    paymentsCount: 2,
    paymentsCents: 69000,
    commissionCents: 9000,
    payoutsCount: 1,
    payoutsCents: 30000,
    refundsCount: 1,
    refundsCents: 4500,
    disputes: 1,
  },
  installs: [
    { packageId: 'fx-github-mcp', packageName: 'GitHub MCP', version: '1.2.0', at: '2026-10-10T09:00:00.000Z' },
    { packageId: 'fx-pdf-skill', packageName: 'PDF skill', version: '0.3.0', at: '2026-10-09T09:00:00.000Z' },
  ],
  publishes: [{ packageId: 'fx-pdf-skill', packageName: 'PDF skill', version: '0.3.0', at: '2026-10-08T09:00:00.000Z', visibility: 'pending' }],
  payments: [
    { id: 'pay1', at: '2026-10-11T09:00:00.000Z', jobTitle: 'CSV importer for the shop', amountCents: 34500, feeCents: 4500, status: 'paid' },
    { id: 'pay2', at: '2026-10-10T09:00:00.000Z', jobTitle: 'Nightly backups for the shop', amountCents: 34500, feeCents: 4500, status: 'paid' },
  ],
  payouts: [{ id: 'po1', at: '2026-10-11T10:00:00.000Z', jobTitle: 'CSV importer for the shop', amountCents: 30000, status: 'sent' }],
  refunds: [{ id: 'rf1', at: '2026-10-11T11:00:00.000Z', jobTitle: 'Logo refresh for the shop', amountCents: 4500, status: 'succeeded' }],
  disputes: [{ id: 'dp1', at: '2026-10-11T12:00:00.000Z', jobTitle: 'Logo refresh for the shop', category: 'incomplete', status: 'open' }],
};

export const EMPTY_ADMIN_ACTIVITY = {
  range: { from: '2026-09-12', to: '2026-10-12' },
  currency: 'eur',
  totals: {
    installs: 0,
    publishes: 0,
    paymentsCount: 0,
    paymentsCents: 0,
    commissionCents: 0,
    payoutsCount: 0,
    payoutsCents: 0,
    refundsCount: 0,
    refundsCents: 0,
    disputes: 0,
  },
  installs: [],
  publishes: [],
  payments: [],
  payouts: [],
  refunds: [],
  disputes: [],
};

export const ADMIN_SECTIONS = ['Marketplace installs', 'Publishes', 'Payments', 'Payouts', 'Refunds', 'Disputes'] as const;

export async function mockAdminActivity(page: Page, body: unknown = ADMIN_ACTIVITY): Promise<URL[]> {
  const seen: URL[] = [];
  await page.route(path('/api/admin/activity'), (route) => {
    seen.push(new URL(route.request().url()));
    return json(route, body);
  });
  return seen;
}

// ---------------------------------------------------------------------------
// pages for the a11y and visual specs

export interface NotifPage {
  path: string;
  name: string;
  role: 'admin' | 'customer' | 'provider';
  mock: (page: Page) => Promise<unknown>;
  /** Text that proves the page rendered its data. */
  ready: (page: Page) => Locator;
  after?: (page: Page) => Promise<void>;
}

export const NOTIF_PAGES: NotifPage[] = [
  {
    path: '/',
    name: 'notif-dropdown',
    role: 'customer',
    mock: (page) => mockNotifications(page),
    ready: (page) => bell(page),
    after: async (page) => {
      await openBell(page);
      await bellDialog(page).getByRole('link', { name: 'Unread: New bid on CSV importer', exact: true }).waitFor();
    },
  },
  {
    path: '/',
    name: 'notif-dropdown-empty',
    role: 'customer',
    mock: (page) => mockNotifications(page, { items: [], page2: [] }),
    ready: (page) => bell(page),
    after: async (page) => {
      await openBell(page);
      await bellDialog(page).getByText("You're all caught up.").waitFor();
    },
  },
  {
    path: '/notifications',
    name: 'notifications-page',
    role: 'customer',
    mock: (page) => mockNotifications(page),
    ready: (page) => page.getByRole('list', { name: 'Notifications' }).getByText('QA passed for Nightly backups'),
  },
  {
    path: '/notifications',
    name: 'notifications-page-empty',
    role: 'customer',
    mock: (page) => mockNotifications(page, { items: [], page2: [] }),
    ready: (page) => page.getByText('No notifications yet'),
  },
  {
    path: '/marketplace/publisher/activity',
    name: 'publisher-activity',
    role: 'customer',
    mock: (page) => mockPublisherActivity(page),
    ready: (page) => page.getByRole('table', { name: 'GitHub MCP installs' }),
  },
  {
    path: '/gigs/activity',
    name: 'gigs-activity',
    role: 'customer',
    mock: (page) => mockGigsActivity(page),
    ready: (page) => page.getByRole('table', { name: 'Activity ledger' }).getByText('Logo refresh'),
  },
  {
    path: '/admin/activity',
    name: 'admin-activity',
    role: 'admin',
    mock: (page) => mockAdminActivity(page),
    ready: (page) => page.getByRole('heading', { level: 2, name: 'Marketplace installs' }),
  },
];

/** Every page in the a11y/visual set also gets the bell's data mocked (stable header badge). */
export async function mockForNotifPage(page: Page, p: NotifPage): Promise<void> {
  if (!p.name.startsWith('notif')) await mockNotifications(page);
  await p.mock(page);
}
