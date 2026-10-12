import type { Page, Route } from '@playwright/test';

/**
 * Mock data for the Phase 5 hub pages (/admin/disputes, /profile reviews and trust,
 * /credits monthly grants), shared by tests/e2e/hub-disputes.spec.ts,
 * tests/e2e/hub-reputation.spec.ts and the hub-phase5 a11y/visual specs.
 * Shapes follow the API contract; dates are fixed so renders are stable.
 */

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export const CUSTOMER = { user_id: 'u_c', name: 'Cara Customer', email: 'c@x.test', plan: 'free' };
export const PROVIDER = { user_id: 'u_p', name: 'Pat Provider', email: 'p@x.test', plan: 'pro' };

export const DISPUTE_IDS = {
  customer: '22222222-2222-4222-8222-222222222222',
  qa: '33333333-3333-4333-8333-333333333333',
  chargeback: '44444444-4444-4444-8444-444444444444',
} as const;

export function disputeItem(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: DISPUTE_IDS.customer,
    contract_id: 'c-1',
    job_title: 'CSV importer for the shop',
    contract_status: 'disputed',
    source: 'customer',
    phase: 'pre_accept',
    category: 'incomplete',
    status: 'open',
    default_resolution: null,
    resolution: null,
    reason: 'Files with a quoted comma lose every field after the comma.',
    created_at: '2026-10-10T09:00:00Z',
    resolved_at: null,
    customer: CUSTOMER,
    provider: PROVIDER,
    price_cents: 30000,
    customer_total_cents: 34500,
    currency: 'eur',
    stripe_dispute_status: null,
    ...over,
  };
}

export const OPEN_ITEMS = [
  disputeItem(),
  disputeItem({
    id: DISPUTE_IDS.qa,
    contract_id: 'c-2',
    job_title: 'Nightly backups for the shop',
    source: 'qa_rejected',
    category: 'qa_rejected',
    default_resolution: 'full_refund',
    reason: 'QA: nothing in the repository matches the spec.',
  }),
  disputeItem({
    id: DISPUTE_IDS.chargeback,
    contract_id: 'c-3',
    job_title: 'Logo refresh for the shop',
    source: 'chargeback',
    category: 'chargeback',
    reason: 'Card network chargeback: fraudulent.',
    stripe_dispute_status: 'needs_response',
  }),
];

export function disputeDetail(item: Record<string, unknown>): Record<string, unknown> {
  return {
    dispute: { ...item, evidence: 'Sample file orders-quoted.csv imports with shifted columns.', refund_cents: null, resolution_note: null },
    contract: {
      id: item.contract_id,
      status: item.contract_status,
      job_id: 'j-1',
      job_title: item.job_title,
      currency: 'eur',
      accepted_at: null,
    },
    parties: { customer: CUSTOMER, provider: PROVIDER },
    money: {
      paid_cents: 34500,
      refunded_cents: 0,
      bid_cents: 30000,
      fee_cents: 4500,
      transferred_cents: 0,
      reversed_cents: 0,
      refundable_cents: 34500,
    },
    previews: {
      release: { refund_cents: 0, transfer_cents: 30000, reverse_cents: 0 },
      full_refund: { refund_cents: 34500, transfer_cents: 0, reverse_cents: 0 },
    },
    qa_history: [
      { attempt: 1, verdict: 'validated', reason: 'Meets the spec', reviewed_at: '2026-10-09T09:00:00Z', commit_sha: '1111111111111111111111111111111111111111' },
    ],
    other_disputes: [],
  };
}

export const RESOLVED_ITEM = disputeItem({
  id: '55555555-5555-4555-8555-555555555555',
  contract_id: 'c-5',
  job_title: 'Landing page copy',
  status: 'resolved',
  resolution: 'release',
  resolved_at: '2026-10-11T09:00:00Z',
  contract_status: 'completed',
});

/** /api/admin/disputes(+/{id}) mocks; `items` per status. */
export async function mockDisputesApi(
  page: Page,
  opts: { open?: unknown[]; resolved?: unknown[] } = {},
): Promise<void> {
  const open = (opts.open ?? OPEN_ITEMS) as Array<Record<string, unknown>>;
  const resolved = (opts.resolved ?? [RESOLVED_ITEM]) as Array<Record<string, unknown>>;
  await page.route(
    (url) => url.pathname === '/api/admin/disputes' || url.pathname.startsWith('/api/admin/disputes/'),
    (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/admin/disputes') {
        const status = url.searchParams.get('status') ?? 'open';
        return json(route, { items: status === 'resolved' ? resolved : status === 'all' ? [...open, ...resolved] : open });
      }
      const id = url.pathname.split('/')[4];
      const item = [...open, ...resolved].find((i) => i.id === id);
      if (!item) return json(route, { error: 'not_found', message: 'No such dispute.' }, 404);
      if (route.request().method() === 'GET' && url.pathname.split('/').length === 5) return json(route, disputeDetail(item));
      return json(route, { error: 'not mocked', message: 'not mocked' }, 500);
    },
  );
}

// ---------------------------------------------------------------------------
// reputation

export const REPUTATION = {
  reviews: [
    {
      id: 'rv-1',
      contract_id: 'c-1',
      reviewer_role: 'customer',
      reviewer_name: 'Dana Customer',
      overall: 5,
      quality: 5,
      communication: 4,
      timeliness: 5,
      body: 'Clean importer and a clear README.',
      job_title: 'CSV importer for the shop',
      agent_version: 'importer-bot@1.2',
      created_at: '2026-10-08T09:00:00Z',
    },
    {
      id: 'rv-2',
      contract_id: 'c-2',
      reviewer_role: 'provider',
      reviewer_name: 'Pat Provider',
      overall: 4,
      quality: 4,
      communication: 4,
      timeliness: 4,
      body: 'Clear spec and quick answers.',
      job_title: 'Nightly backups for the shop',
      agent_version: null,
      created_at: '2026-10-09T09:00:00Z',
    },
  ],
  summary: { count: 2, average: 4.5, as_provider: { count: 1, average: 5 }, as_customer: { count: 1, average: 4 } },
  trust: {
    provider: {
      principal_id: '66666666-6666-4666-8666-666666666666',
      user_id: 'u_c',
      score: 92,
      level: 'established',
      review_count: 2,
      average_rating: 4.5,
      counted: 3,
      breakdown: [
        { key: 'qa_first_pass', label: 'QA first-pass rate', value: 0.92, weight: 0.4, evidence: '11 of 12 first attempts validated' },
        { key: 'reviews', label: 'Reviews', value: 0.875, weight: 0.4, evidence: '4.5 from 2 reviews' },
        { key: 'disputes', label: 'Disputes', value: 1, weight: 0.2, evidence: 'none lost' },
      ],
      computed_at: '2026-10-10T09:00:00Z',
    },
    agents: [
      {
        principal_id: '77777777-7777-4777-8777-777777777777',
        agent_version: 'importer-bot@1.2',
        score: 76,
        level: 'building',
        review_count: 1,
        average_rating: 5,
      },
    ],
  },
};

export const EMPTY_REPUTATION = {
  reviews: [],
  summary: { count: 0, average: null, as_provider: { count: 0, average: null }, as_customer: { count: 0, average: null } },
  trust: { provider: null, agents: [] },
};

export async function mockReputation(page: Page, body: unknown = REPUTATION, status = 200): Promise<void> {
  await page.route((url) => url.pathname === '/api/profile/reputation', (route) => json(route, body, status));
}

// ---------------------------------------------------------------------------
// credits

export const GRANTS_CURRENT = {
  plan: 'pro',
  monthly_credits: 1000,
  current: {
    period: '2026-10',
    period_start: '2026-10-15T12:00:00Z',
    period_end: '2026-11-15T12:00:00Z',
    credits: 1000,
    remaining_credits: 700,
    plan: 'pro',
  },
  history: [
    { period: '2026-09', plan: 'pro', credits: 1000, expired_credits: 300, expired_at: '2026-10-15T12:00:00Z', created_at: '2026-09-15T12:00:00Z' },
  ],
};

export const GRANTS_PAID_NO_CURRENT = { plan: 'pro', monthly_credits: 1000, current: null, history: [] };
export const GRANTS_FREE = { plan: null, monthly_credits: 0, current: null, history: [] };

// Internally consistent: the rows add up to the balance (+1,000 −700 +1,500 −300 +1,000 −300 = 2,200), the
// September grant's unused 300 expire on 15 Oct, and 300 of October's 1,000 are used (700 left).
export const STATS_WITH_GRANTS = {
  remainingBalance: 22,
  totalSpent: 10,
  totalDeposited: 15,
  purchaseHistory: [
    { id: 6, amount: 3, type: 'usage', description: 'Chat with Tex', createdAt: '2026-10-16T09:00:00Z' },
    { id: 5, amount: 10, type: 'plan_grant', description: 'Monthly credits (Pro)', createdAt: '2026-10-15T12:00:00Z' },
    { id: 4, amount: 3, type: 'plan_expiry', description: 'Unused monthly credits expired', createdAt: '2026-10-15T11:59:00Z' },
    { id: 3, amount: 15, type: 'deposit', description: 'Credit top-up ($15.00)', createdAt: '2026-10-01T10:00:00Z' },
    { id: 2, amount: 7, type: 'usage', description: 'Chat with Tex', createdAt: '2026-09-28T09:00:00Z' },
    { id: 1, amount: 10, type: 'plan_grant', description: 'Monthly credits (Pro)', createdAt: '2026-09-15T12:00:00Z' },
  ],
  modelSummaries: [],
  deviceSummaries: [],
  dailySpending: [],
  rawDeviceLogs: [],
};

export async function mockCredits(page: Page, grants: unknown = GRANTS_CURRENT, stats: unknown = STATS_WITH_GRANTS): Promise<void> {
  await page.route((url) => url.pathname === '/api/dashboard/paid-stats', (route) => json(route, stats));
  await page.route((url) => url.pathname === '/api/credits/grants', (route) => json(route, grants));
}

// ---------------------------------------------------------------------------
// pages for the a11y and visual specs

export interface Phase5HubPage {
  path: string;
  name: string;
  role: 'admin' | 'customer' | 'provider';
  /** Phase 5 mocks, registered after mockHubApis (later routes win). */
  mock: (page: Page) => Promise<void>;
  /** Text that proves the page rendered its data. */
  ready: string;
  after?: (page: Page) => Promise<void>;
}

export const PHASE5_HUB_PAGES: Phase5HubPage[] = [
  {
    path: '/admin/disputes',
    name: 'admin-disputes',
    role: 'admin',
    mock: (page) => mockDisputesApi(page),
    ready: 'Nightly backups for the shop',
  },
  {
    path: '/admin/disputes',
    name: 'admin-disputes-detail',
    role: 'admin',
    mock: (page) => mockDisputesApi(page),
    ready: 'Nightly backups for the shop',
    after: async (page) => {
      await page.getByRole('button', { name: /CSV importer for the shop/ }).click();
      await page.getByRole('heading', { level: 2, name: 'CSV importer for the shop' }).waitFor();
      await page.getByRole('radio', { name: 'Partial refund', exact: true }).check();
      await page.getByRole('spinbutton', { name: 'Refund amount (EUR)' }).waitFor();
    },
  },
  {
    path: '/profile',
    name: 'profile-reputation',
    role: 'customer',
    // A provider with reviews and an established trust score has finished Stripe onboarding.
    mock: async (page) => {
      await page.route('**/api/connect/status**', (r) =>
        json(r, { connected: true, account_id: 'acct_x', connect_status: 'active', payouts_enabled: true, charges_enabled: true, details_submitted: true, country: 'DE' }),
      );
      await mockReputation(page);
    },
    ready: '4.5 out of 5 from 2 reviews',
  },
  {
    path: '/credits',
    name: 'credits-monthly-grant',
    role: 'customer',
    mock: (page) => mockCredits(page),
    ready: '700 of 1,000 monthly credits left',
  },
];
