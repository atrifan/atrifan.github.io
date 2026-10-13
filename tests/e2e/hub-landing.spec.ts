import { test, expect, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { AD_SLOT } from './surface-helpers';
import { adSlots, guardPage, sectionByH2, userButton } from './hub-helpers';

/** Hub landing page `/` (path-prefix mode). */

const CARDS = [
  { name: 'AI', href: '/ai', text: 'Your assistant, keys and usage' },
  { name: 'Marketplace', href: '/marketplace', text: 'Skills, MCP servers, A2A agents and plugins' },
  { name: 'Gigs', href: '/gigs', text: "Hire AI agents for software work, or offer your agent's services" },
  { name: 'Chat', href: '/chat', text: 'Talk to your assistant from anywhere' },
] as const;

const cards = (page: Page) =>
  sectionByH2(page, 'Everything in one place')
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { level: 3 }) });

/** Every JSON-LD node on the page, flattening arrays and @graph. */
async function jsonLdNodes(page: Page): Promise<Record<string, unknown>[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  const out: Record<string, unknown>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      out.push(v as Record<string, unknown>);
      const graph = (v as Record<string, unknown>)['@graph'];
      if (graph) walk(graph);
    }
  };
  for (const text of raw) walk(JSON.parse(text));
  return out;
}

test.describe('hub landing, signed out', () => {
  test.beforeEach(async ({ page }) => {
    await guardPage(page);
    await page.goto('/');
  });

  test('has exactly one h1', async ({ page }) => {
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('"Everything in one place" has exactly four cards', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'Everything in one place', exact: true })).toBeVisible();
    await expect(cards(page)).toHaveCount(4);
  });

  for (const card of CARDS) {
    test(`card "${card.name}" links to ${card.href} with heading, description and icon`, async ({ page }) => {
      const link = cards(page).filter({ has: page.getByRole('heading', { level: 3, name: card.name, exact: true }) });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute('href', card.href);
      await expect(link).toContainText(card.text);
      expect(await link.locator('svg').count()).toBeGreaterThan(0);
    });
  }

  test('"How it works" is followed by an ordered list of 3+ steps', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2, name: 'How it works', exact: true })).toBeVisible();
    const list = page.locator('xpath=//h2[normalize-space()="How it works"]/following::ol[1]');
    await expect(list).toHaveCount(1);
    expect(await list.locator(':scope > li').count()).toBeGreaterThanOrEqual(3);
  });

  test('"Plans" section links "See pricing" to /pricing', async ({ page }) => {
    const plans = sectionByH2(page, 'Plans');
    await expect(plans).toHaveCount(1);
    await expect(plans.getByRole('link', { name: 'See pricing', exact: true })).toHaveAttribute('href', '/pricing');
  });

  test('mentions the assistant, Tex', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/\bTex\b/);
  });

  test('"Get started" links to /sign-up', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Get started', exact: true }).first()).toHaveAttribute('href', '/sign-up');
  });

  test('JSON-LD Organization named Tulzo with an absolute url', async ({ page }) => {
    const org = (await jsonLdNodes(page)).find((n) => n['@type'] === 'Organization');
    expect(org, 'an Organization JSON-LD node').toBeTruthy();
    expect(org!.name).toBe('Tulzo');
    expect(String(org!.url)).toMatch(/^https?:\/\//);
  });

  test('at most one ad slot, and it is in the footer', async ({ page }) => {
    const all = await adSlots(page);
    const total = await all.count();
    expect(total).toBeLessThanOrEqual(1);
    await expect(page.getByRole('contentinfo').locator(AD_SLOT)).toHaveCount(total);
  });
});

test.describe('hub landing, signed in (customer)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
    await page.goto('/');
    await expect(userButton(page.getByRole('banner'))).toBeVisible({ timeout: 30_000 });
  });

  test('"Open Tulzo AI" links to /ai and there is no "Get started" or bare "Open AI"', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Open Tulzo AI', exact: true }).first()).toHaveAttribute('href', '/ai');
    await expect(page.getByRole('link', { name: 'Open AI', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Get started', exact: true })).toHaveCount(0);
  });

  test('no ad slots', async ({ page }) => {
    await expect(await adSlots(page)).toHaveCount(0);
  });
});
