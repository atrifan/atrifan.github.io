import { test, expect, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { expectNoAdSlots, guardPage, userButton } from './hub-helpers';

/** Hub pricing page `/pricing`. */

const PLANS = [
  { name: 'Free', texts: ['$0', '0 credits'] },
  { name: 'Pro', texts: ['$10', '1,000 credits', '$100.08'] },
  { name: 'Plus', texts: ['$25', '2,800 credits', '$250.08'] },
  { name: 'Super', texts: ['$60', '7,000 credits', '$600'] },
] as const;
const PLAN_NAMES = PLANS.map((p) => p.name);

/**
 * Text of the card that holds the plan heading: the largest ancestor of the
 * h2/h3 that does not also contain another plan's heading.
 */
function planCardText(page: Page, name: string): Promise<string | null> {
  return page.evaluate(
    ({ name, names }) => {
      const headings = Array.from(document.querySelectorAll('h2, h3'));
      const isPlan = (el: Element) => names.includes(el.textContent?.trim() ?? '');
      const own = headings.find((h) => h.textContent?.trim() === name);
      if (!own) return null;
      let card: Element = own;
      while (card.parentElement) {
        const parent = card.parentElement;
        const others = Array.from(parent.querySelectorAll('h2, h3')).filter((h) => h !== own && isPlan(h));
        if (others.length > 0) break;
        card = parent;
      }
      return card.textContent;
    },
    { name, names: PLAN_NAMES as string[] },
  );
}

test.describe('hub pricing, signed out', () => {
  test.beforeEach(async ({ page }) => {
    await guardPage(page);
    await page.goto('/pricing');
  });

  test('h1 is "Pricing"', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pricing');
  });

  test('four plans in order: Free, Pro, Plus, Super', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Free', exact: true })).toBeVisible();
    const headings = (await page.locator('h2, h3').allTextContents()).map((t) => t.trim());
    expect(headings.filter((t) => (PLAN_NAMES as string[]).includes(t))).toEqual(PLAN_NAMES);
  });

  for (const plan of PLANS) {
    test(`plan ${plan.name} shows ${plan.texts.join(', ')}`, async ({ page }) => {
      await expect(page.getByRole('heading', { name: plan.name, exact: true })).toBeVisible();
      const text = await planCardText(page, plan.name);
      expect(text, `card for ${plan.name}`).not.toBeNull();
      for (const t of plan.texts) expect(text).toContain(t);
    });
  }

  test('FAQ "What is a credit?" explains the credit', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'Frequently asked questions', exact: true })).toBeVisible();
    const summary = page.locator('summary', { hasText: 'What is a credit?' });
    await expect(summary).toHaveCount(1);
    await summary.click();
    const answer = page.locator('details', { has: summary });
    await expect(answer).toHaveAttribute('open', '');
    for (const t of ['1 credit = $0.01', 'Opus', 'Sonnet', '1,000 credits']) {
      await expect(answer).toContainText(t);
    }
  });

  test('"Get started" links to /sign-up', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Get started', exact: true }).first()).toHaveAttribute('href', '/sign-up');
  });

  test('no ad slots', async ({ page }) => {
    await expectNoAdSlots(page);
  });
});

test.describe('hub pricing, signed in (customer)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
  });

  test('no ad slots', async ({ page }) => {
    await page.goto('/pricing');
    await expect(userButton(page.getByRole('banner'))).toBeVisible({ timeout: 30_000 });
    await expectNoAdSlots(page);
  });
});
