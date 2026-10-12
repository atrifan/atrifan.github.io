import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { openSettled } from '../support/pages';
import { blockThirdParty } from '../e2e/surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

test.skip(process.env.MARKETPLACE_E2E !== '1', 'marketplace e2e runs via npm run test:e2e:marketplace');

/**
 * Visual baselines for the marketplace pages in the light/dark x desktop/mobile projects, taken on
 * a freshly seeded catalog (CATALOG_FIXTURES). Ads and Clerk's widgets are masked.
 * Update with `npm run test:e2e:marketplace -- --update-snapshots` and look at every changed image.
 */

const mask = (page: Page) => [page.locator('[data-ad-slot]'), page.locator('.cl-footer'), page.locator('.cl-userButtonBox')];

/** Signed-in pages: openSettled waits for the signed-out "Sign in" link, so wait on the h1 instead. */
async function openSignedInSettled(page: Page, path: string) {
  await blockThirdParty(page);
  await setupClerkTestingToken({ page });
  await page.goto(path, { waitUntil: 'load' });
  await page.locator('#main').waitFor({ state: 'visible' });
  await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

const PUBLIC_SHOTS = [
  { path: '/marketplace', name: 'catalog.png' },
  { path: '/marketplace?kind=skill&sort=top', name: 'catalog-filtered.png' },
  { path: '/marketplace?q=zzzz-no-match', name: 'catalog-no-results.png' },
  { path: '/marketplace/fx-github-mcp', name: 'detail-mcp.png' },
  { path: '/marketplace/fx-pdf-skill', name: 'detail-skill.png' },
];

for (const { path, name } of PUBLIC_SHOTS) {
  test(`${name} (${path})`, async ({ page }) => {
    await openSettled(page, path);
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await expect(page).toHaveScreenshot(name, { fullPage: true, mask: mask(page) });
  });
}

test('catalog-filters-sheet.png (/marketplace, Filters open)', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('mobile'), 'the Filters dialog is mobile only');
  await openSettled(page, '/marketplace');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('catalog-filters-sheet.png', { mask: mask(page) });
});

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  for (const { path, name } of [
    { path: '/marketplace/publish', name: 'publish.png' },
    { path: '/marketplace/admin', name: 'admin.png' },
  ]) {
    test(`${name} (${path})`, async ({ page }) => {
      await openSignedInSettled(page, path);
      await expect(page).toHaveScreenshot(name, { fullPage: true, mask: mask(page) });
    });
  }
});
