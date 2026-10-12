import { test, expect, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { apiPath, fulfillJson, guardPage, sectionByH2 } from './hub-helpers';
import {
  EMPTY_REPUTATION,
  GRANTS_CURRENT,
  GRANTS_FREE,
  GRANTS_PAID_NO_CURRENT,
  REPUTATION,
  mockCredits,
  mockReputation,
} from '../support/hub-phase5';

/**
 * Phase 5 on the hub: `/profile` "Reviews about you" and "Trust score" sections, and the
 * monthly credit grant on `/credits`. APIs mocked; behaviour only.
 */

async function mockPrefs(page: Page) {
  await page.route(apiPath('/api/notifications/preferences'), (route) =>
    fulfillJson(route, { preferences: [{ type: 'bid_received', label: 'New bids', emailEnabled: true }] }),
  );
}

const reviews = (page: Page) => sectionByH2(page, 'Reviews about you');
const trust = (page: Page) => sectionByH2(page, 'Trust score');

test.describe('profile reputation (customer session)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
    await mockPrefs(page);
  });

  test('no reviews and no trust score → both empty states', async ({ page }) => {
    await mockReputation(page, EMPTY_REPUTATION);
    await page.goto('/profile');
    await expect(reviews(page)).toContainText(
      'No reviews yet. Reviews from customers and providers you work with on Gigs show up here.',
    );
    await expect(trust(page)).toContainText('No trust score yet. It builds up from finished gigs, QA results and reviews.');
  });

  test('reviews: the summary line and one list item per review with name, score, job, body and role', async ({ page }) => {
    await mockReputation(page);
    await page.goto('/profile');
    const s = reviews(page);
    await expect(s).toContainText('4.5 out of 5 from 2 reviews');
    const items = s.getByRole('listitem');
    await expect(items).toHaveCount(2);
    const first = items.filter({ hasText: 'Clean importer and a clear README.' });
    for (const t of ['Cara Customer', '5/5', 'CSV importer for the shop', 'As provider']) await expect(first).toContainText(t);
    const second = items.filter({ hasText: 'Clear spec and quick answers.' });
    for (const t of ['Pat Provider', '4/5', 'Nightly backups for the shop', 'As customer']) await expect(second).toContainText(t);
  });

  test('reviews: a single review reads "5 out of 5 from 1 review"', async ({ page }) => {
    await mockReputation(page, {
      ...REPUTATION,
      reviews: [REPUTATION.reviews[0]],
      summary: { count: 1, average: 5, as_provider: { count: 1, average: 5 }, as_customer: { count: 0, average: null } },
    });
    await page.goto('/profile');
    await expect(reviews(page)).toContainText('5 out of 5 from 1 review');
    await expect(reviews(page)).not.toContainText('1 reviews');
  });

  test('trust: score with accessible text, level, breakdown percentages and per-agent scores', async ({ page }) => {
    await mockReputation(page);
    await page.goto('/profile');
    const s = trust(page);
    await expect(s.getByText('Trust score 82 out of 100').or(s.getByLabel('Trust score 82 out of 100')).first()).toBeAttached();
    await expect(s).toContainText('82');
    await expect(s).toContainText('Established');
    const breakdown: Array<[string, string]> = [
      ['QA first-pass rate', '92%'],
      ['Average rating', '88%'],
      ['Disputes lost', '100%'],
    ];
    for (const [label, pct] of breakdown) {
      const li = s.getByRole('listitem').filter({ hasText: label });
      await expect(li).toHaveCount(1);
      await expect(li).toContainText(pct);
    }
    await expect(s).toContainText('importer-bot@1.2: 76');
  });

  test('trust levels "New" and "Building" are labelled', async ({ page }) => {
    for (const [level, label] of [
      ['new', 'New'],
      ['building', 'Building'],
    ] as const) {
      // Later routes win, so each iteration's mock replaces the previous one.
      await mockReputation(page, { ...REPUTATION, trust: { ...REPUTATION.trust, provider: { ...REPUTATION.trust.provider, level } } });
      await page.goto('/profile');
      await expect(trust(page).getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('a 500 from the reputation API → "We couldn\'t load your reviews. Refresh to try again."', async ({ page }) => {
    await mockReputation(page, { error: 'internal', message: 'boom' }, 500);
    await page.goto('/profile');
    await expect(page.getByText(/We couldn.t load your reviews\. Refresh to try again\./).first()).toBeVisible();
  });
});

test.describe('credits monthly grant (customer session)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
  });

  const balance = (page: Page) => sectionByH2(page, 'Balance');

  test('with a current grant: "700 of 1,000 monthly credits left, until 15 Nov 2026."', async ({ page }) => {
    await mockCredits(page, GRANTS_CURRENT);
    await page.goto('/credits');
    await expect(balance(page)).toContainText('700 of 1,000 monthly credits left, until 15 Nov 2026.');
  });

  test('paid plan without a current grant: credits arrive at the start of the billing period', async ({ page }) => {
    await mockCredits(page, GRANTS_PAID_NO_CURRENT);
    await page.goto('/credits');
    await expect(balance(page)).toContainText('Your monthly credits arrive at the start of your billing period.');
    await expect(balance(page)).not.toContainText('monthly credits left');
  });

  test('free plan: no monthly-credit line', async ({ page }) => {
    await mockCredits(page, GRANTS_FREE);
    await page.goto('/credits');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Credits');
    await expect(balance(page)).toBeVisible();
    await page.waitForTimeout(500);
    await expect(balance(page)).not.toContainText('monthly credits left');
    await expect(balance(page)).not.toContainText('Your monthly credits arrive');
  });

  test('history: a plan grant is positive like a deposit, an expiry negative', async ({ page }) => {
    await mockCredits(page, GRANTS_CURRENT);
    await page.goto('/credits');
    const table = page.getByRole('table', { name: 'Transaction history' });
    const grant = table.getByRole('row').filter({ hasText: 'Monthly credits (Pro)' });
    await expect(grant).toHaveCount(1);
    await expect(grant).toContainText('+1,000');
    const expiry = table.getByRole('row').filter({ hasText: 'Unused monthly credits expired' });
    await expect(expiry).toHaveCount(1);
    await expect(expiry).toContainText(/[-−]300\b/);
    await expect(expiry).not.toContainText('+300');
  });
});
