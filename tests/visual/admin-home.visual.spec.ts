import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { blockThirdParty } from '../e2e/surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

test.skip(process.env.ADMIN_HOME_E2E !== '1', 'admin home e2e runs via npm run test:e2e:marketplace');

/**
 * Visual baselines for the admin home (hub /admin) in the light/dark x desktop/mobile projects, on
 * the seeded data (tests/support/admin-home-seed.ts). The MCP URL (it carries the runner's port),
 * ads and Clerk's widgets are masked. Update with
 * `npm run test:e2e:marketplace -- --update-snapshots` and look at every changed image.
 */

const mask = (page: Page) => [page.locator('[data-ad-slot]'), page.locator('.cl-footer'), page.locator('.cl-userButtonBox'), page.locator('.copy-url-text')];

async function openAdminHome(page: Page) {
  await blockThirdParty(page);
  await setupClerkTestingToken({ page });
  await page.goto('/admin', { waitUntil: 'load' });
  await page.getByRole('heading', { level: 1, name: 'Admin' }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  test('admin-home.png (/admin)', async ({ page }) => {
    await openAdminHome(page);
    await expect(page).toHaveScreenshot('admin-home.png', { fullPage: true, mask: mask(page) });
  });

  test('admin-home-menu.png (/admin, Menu open)', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('mobile'), 'the Menu panel is mobile only');
    await openAdminHome(page);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.locator('#site-menu').getByRole('link', { name: 'Admin', exact: true })).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('admin-home-menu.png', { mask: mask(page) });
  });
});
