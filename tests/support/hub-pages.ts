import type { Page, Route } from '@playwright/test';
import { quietBell } from '../e2e/surface-helpers';
import type { E2ERole } from '../fixtures/clerk-users';

/**
 * Signed-in hub pages for the visual and a11y specs, with their API data mocked so
 * screenshots don't depend on the shared database (and never reach Stripe).
 */

export interface SignedInPage {
  path: string;
  name: string;
  role: E2ERole;
  /** Open something after load (e.g. the admin QA drawer). */
  after?: (page: Page) => Promise<void>;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const QUEUE_ITEM = {
  submission_id: '11111111-1111-4111-8111-111111111111',
  contract_id: 'c1',
  job_id: 'j1',
  job_title: 'Fix the login bug on Safari',
  attempt: 2,
  status: 'awaiting_qa',
  submitted_at: '2026-10-10T09:00:00Z',
  repo_full_name: 'acme/app',
  commit_sha: 'abcdef1234567890',
  provider: { user_id: 'u_p', name: 'Pat Provider', email: 'p@x.test', plan: 'pro' },
  customer: { user_id: 'u_c', name: 'Cara Customer', email: 'c@x.test', plan: 'free' },
  price_cents: 30000,
  commission_cents: 4500,
  commission_bps: 1500,
  customer_total_cents: 34500,
  currency: 'eur',
  checks: ['basic', 'code_review'],
};

const DETAIL = {
  submission: { id: QUEUE_ITEM.submission_id, status: 'awaiting_qa', attempt: 2, repo_full_name: 'acme/app', commit_sha: 'abcdef1234567890' },
  job: { id: 'j1', title: QUEUE_ITEM.job_title, description: 'Login fails on Safari 18 after the redirect from the identity provider.' },
  spec: {
    requirements: ['Login works on Safari 18', 'No regression on Chrome and Firefox'],
    acceptance_criteria: ['The Playwright login spec passes on WebKit'],
  },
  contract_version: { price_cents: 30000, fee_cents: 4500, currency: 'eur' },
  qa: { checks: ['basic', 'code_review'], reserved_credits: 300, used_credits: 0, status: 'reserved' },
  previous_reviews: [{ id: 'r1', attempt: 1, verdict: 'requires_changes', reason: 'The fix only covers Safari 17.' }],
};

export async function mockHubApis(page: Page): Promise<void> {
  await quietBell(page);
  await page.route('**/api/connect/status**', (r) =>
    json(r, { connected: true, account_id: 'acct_x', connect_status: 'pending', payouts_enabled: false, charges_enabled: false, details_submitted: false, country: 'DE' }),
  );
  await page.route('**/api/connect/onboard', (r) => json(r, { error: 'mocked' }, 500));
  await page.route('**/api/billing/checkout', (r) => json(r, { error: 'mocked' }, 500));
  await page.route('**/api/notifications/preferences', (r) =>
    json(r, {
      preferences: [
        { type: 'bid_received', label: 'New bids', emailEnabled: true },
        { type: 'qa_verdict', label: 'QA verdicts', emailEnabled: true },
        { type: 'payout_sent', label: 'Payouts', emailEnabled: false },
      ],
    }),
  );
  await page.route('**/api/dashboard/paid-stats', (r) =>
    json(r, {
      remainingBalance: 12.34,
      totalSpent: 2.66,
      totalDeposited: 15,
      purchaseHistory: [
        { id: 2, amount: 0.6, type: 'qa_reserve', description: 'QA reserve: Fix the login bug', createdAt: '2026-10-05T10:00:00Z' },
        { id: 1, amount: 15, type: 'deposit', description: 'Credit top-up ($15.00)', createdAt: '2026-10-01T10:00:00Z' },
      ],
      modelSummaries: [],
      deviceSummaries: [],
      dailySpending: [],
      rawDeviceLogs: [],
    }),
  );
  // Phase 5: no reviews, trust or monthly grant yet (the empty states)
  await page.route('**/api/profile/reputation', (r) =>
    json(r, { reviews: [], summary: { count: 0, average: null, as_provider: 0, as_customer: 0 }, trust: { provider: null, agents: [] } }),
  );
  await page.route('**/api/credits/grants', (r) => json(r, { plan: null, monthly_credits: 0, current: null, history: [] }));
  await page.route('**/api/admin/qa/queue**', (r) => json(r, { items: [QUEUE_ITEM] }));
  await page.route(`**/api/admin/qa/submissions/${QUEUE_ITEM.submission_id}`, (r) => json(r, DETAIL));
}

export const SIGNED_IN_PAGES: SignedInPage[] = [
  { path: '/', name: 'home-signed-in', role: 'customer' },
  { path: '/pricing', name: 'pricing-signed-in', role: 'customer' },
  { path: '/profile', name: 'profile', role: 'customer' },
  { path: '/credits', name: 'credits', role: 'customer' },
  { path: '/admin/qa', name: 'admin-qa', role: 'admin' },
  {
    path: '/admin/qa',
    name: 'admin-qa-drawer',
    role: 'admin',
    after: async (page) => {
      await page.getByRole('button', { name: 'Review', exact: true }).click();
      await page.getByRole('dialog').getByText('Login works on Safari 18').waitFor();
    },
  },
];
