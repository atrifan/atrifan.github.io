import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { blockThirdParty } from './surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

test.skip(process.env.MARKETPLACE_E2E !== '1', 'marketplace e2e runs via npm run test:e2e:marketplace');

/**
 * Package detail contract: GET /marketplace/<id or name slug> (public).
 * Only fx-slack-plugin is rated here; install counts of packages other specs install aren't asserted.
 */

const main = (page: Page) => page.locator('#main');
const h2 = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true });

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
  // Lets Clerk refresh the saved session (60s tokens) past bot protection.
  if (hasClerkTestEnv()) await setupClerkTestingToken({ page });
});

test('sitemap.xml lists every public package page and no pending or private one', async ({ request }) => {
  const res = await request.get('/sitemap.xml', { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  const paths = [...(await res.text()).matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  for (const id of ['fx-github-mcp', 'fx-pdf-skill', 'fx-slack-plugin', 'fx-travel-a2a', 'fx-code-reviewer', 'fx-release-workflow']) {
    expect(paths, id).toContain(`/marketplace/${id}`);
  }
  expect(paths).not.toContain('/marketplace/fx-pending-mcp');
  expect(paths).not.toContain('/marketplace/fx-hidden-skill');
});

test.describe('signed out', () => {
  test('MCP server detail shows the package summary', async ({ page }) => {
    await page.goto('/marketplace/fx-github-mcp');
    await expect(page.getByRole('heading', { level: 1, name: 'GitHub Tools' })).toBeVisible();
    const m = main(page);
    await expect(m.getByText('by Tulzo Labs').first()).toBeVisible();
    await expect(m.getByText('MCP server', { exact: true }).first()).toBeVisible();
    await expect(m.getByText('Verified', { exact: true }).first()).toBeVisible();
    await expect(m.getByText('4.5', { exact: true }).first()).toBeVisible();
    await expect(m.getByText('2 ratings').first()).toBeVisible();
    await expect(m.getByText('1.5k installs').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Install GitHub Tools' })).toBeVisible();
  });

  test('description is rendered Markdown with scripts and javascript: links neutralised', async ({ page }) => {
    await page.goto('/marketplace/fx-github-mcp');
    const m = main(page);
    await expect(m.locator('strong', { hasText: /^GitHub$/ })).toBeVisible();
    await expect(m.getByText('List and triage issues')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __fxInjected?: unknown }).__fxInjected)).toBeUndefined();
    const injectedScripts = await m
      .locator('script')
      .evaluateAll((els) => els.filter((el) => (el.textContent ?? '').includes('__fxInjected')).length);
    expect(injectedScripts).toBe(0);
    await expect(m.getByText('Unsafe link')).toBeVisible();
    await expect(page.locator('a[href^="javascript:" i]')).toHaveCount(0);
  });

  test('lists versions, reviews, install command, tools, permissions and publisher', async ({ page }) => {
    await page.goto('/marketplace/fx-github-mcp');
    const m = main(page);
    await expect(h2(page, 'Versions')).toBeVisible();
    await expect(m.getByText('2.1.0').first()).toBeVisible();
    await expect(m.getByText('2.0.0').first()).toBeVisible();

    await expect(h2(page, 'Ratings and reviews')).toBeVisible();
    await expect(m.getByText('Saves me an hour a day.')).toBeVisible();

    await expect(h2(page, 'Install from the command line')).toBeVisible();
    await expect(
      m.locator('pre, code').filter({ hasText: 'claude mcp add --transport http github-tools https://mcp.example.com/github' }).first(),
    ).toBeVisible();

    await expect(h2(page, 'Tools')).toBeVisible();
    await expect(m.getByText('list_issues').first()).toBeVisible();
    await expect(m.getByText('create_pull_request').first()).toBeVisible();

    await expect(h2(page, 'Permissions')).toBeVisible();
    await expect(m.getByText('Connects to mcp.example.com')).toBeVisible();

    await expect(h2(page, 'Publisher')).toBeVisible();
    await expect(m.getByText('Tulzo Labs').first()).toBeVisible();
  });

  test('skill detail lists every version, its archive URL and no MCP-only sections', async ({ page }) => {
    await page.goto('/marketplace/fx-pdf-skill');
    await expect(page.getByRole('heading', { level: 1, name: 'PDF Summarizer' })).toBeVisible();
    const m = main(page);
    await expect(h2(page, 'Versions')).toBeVisible();
    for (const v of ['1.2.0', '1.1.0', '1.0.0']) await expect(m.getByText(v).first()).toBeVisible();
    await expect(h2(page, 'Install from the command line')).toBeVisible();
    await expect(
      m.locator('pre, code').filter({ hasText: 'https://blob.example.com/packages/fx-pdf-skill/1.2.0.zip' }).first(),
    ).toBeVisible();
    await expect(h2(page, 'Tools')).toHaveCount(0);
    await expect(h2(page, 'Permissions')).toHaveCount(0);
    await expect(h2(page, 'Publisher')).toBeVisible();
  });

  test('A2A agent detail has a Permissions section but no Tools', async ({ page }) => {
    await page.goto('/marketplace/fx-travel-a2a');
    await expect(page.getByRole('heading', { level: 1, name: 'Travel Planner Agent' })).toBeVisible();
    await expect(h2(page, 'Permissions')).toBeVisible();
    await expect(h2(page, 'Tools')).toHaveCount(0);
  });

  test('has a canonical URL and SoftwareApplication JSON-LD', async ({ page }) => {
    await page.goto('/marketplace/fx-github-mcp');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical ?? '').toMatch(/\/marketplace\/fx-github-mcp$/);

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((els) => els.map((el) => el.textContent ?? ''));
    const docs = blocks.flatMap((text) => {
      const json = JSON.parse(text) as unknown;
      const list = Array.isArray(json) ? json : (json as { '@graph'?: unknown[] })['@graph'] ?? [json];
      return list as Array<Record<string, unknown>>;
    });
    const app = docs.find((d) => d['@type'] === 'SoftwareApplication');
    expect(app, 'a SoftwareApplication JSON-LD block').toBeTruthy();
    expect(app!.name).toBe('GitHub Tools');
    expect(app!.softwareVersion).toBe('2.1.0');
    const rating = app!.aggregateRating as { ratingValue: unknown; ratingCount: unknown };
    expect(Number(rating.ratingValue)).toBe(4.5);
    expect(Number(rating.ratingCount)).toBe(2);
  });

  test('the name slug resolves to the same package', async ({ page }) => {
    await page.goto('/marketplace/github-tools');
    await expect(page.getByRole('heading', { level: 1, name: 'GitHub Tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Install GitHub Tools' })).toBeVisible();
  });

  for (const id of ['does-not-exist', 'fx-hidden-skill']) {
    test(`/marketplace/${id} is a 404 "Package not found"`, async ({ page }) => {
      const res = await page.goto(`/marketplace/${id}`);
      expect(res?.status()).toBe(404);
      await expect(page.getByText('Package not found').first()).toBeVisible();
      await expect(page.getByText('Hidden by an admin.')).toHaveCount(0);
    });
  }

  test('signed out, rating asks to sign in', async ({ page }) => {
    await page.goto('/marketplace/fx-slack-plugin');
    await expect(page.getByRole('link', { name: 'Sign in to rate' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Your rating' })).toHaveCount(0);
  });
});

test.describe('signed in', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('customer') });

  test('rating a package thanks the user and counts the rating', async ({ page }) => {
    await page.goto('/marketplace/fx-slack-plugin');
    const group = page.getByRole('group', { name: 'Your rating' });
    await expect(group).toBeVisible();
    for (const name of ['Rate 1 star', 'Rate 2 stars', 'Rate 3 stars', 'Rate 4 stars', 'Rate 5 stars']) {
      await expect(group.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Sign in to rate' })).toHaveCount(0);
    await group.getByRole('button', { name: 'Rate 5 stars', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Thanks! You rated this 5 stars.' })).toBeVisible();
    await page.reload();
    await expect(main(page).getByText('2 ratings').first()).toBeVisible();
  });
});
