import { expect, test, type Locator, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { blockThirdParty } from '../e2e/surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { openSettledSignedIn } from '../support/pages';

/**
 * Visual baselines for the site header with the admin's "Admin" link in the Primary nav, on /admin, in the
 * light/dark x desktop/mobile projects: the banner at the project viewport and at 960x800 (where the nav
 * folds into the Menu), and on mobile the opened Menu panel. Clerk's user button and dev footer are masked.
 * Update with `--update-snapshots` and look at every changed image.
 */

const mask = (page: Page) => [page.locator('.cl-footer'), page.locator('.cl-userButtonBox'), page.locator('[data-ad-slot]')];

/** The Admin link in the Primary nav; `includeHidden` finds it while the phone Menu is closed. */
const primaryAdmin = (scope: Page | Locator, includeHidden = false) =>
  scope
    .getByRole('navigation', { name: 'Primary', exact: true, includeHidden })
    .getByRole('link', { name: 'Admin', exact: true, includeHidden })
    .first();

async function openAdmin(page: Page) {
  await blockThirdParty(page);
  await setupClerkTestingToken({ page });
  await openSettledSignedIn(page, '/admin');
  await expect(primaryAdmin(page, true)).toBeAttached({ timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(300);
}

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  test('admin-nav-banner.png (/admin header)', async ({ page }) => {
    await openAdmin(page);
    await expect(page.getByRole('banner')).toHaveScreenshot('admin-nav-banner.png', { mask: mask(page) });
  });

  test('admin-nav-banner-960.png (/admin header at 960x800)', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 800 });
    await openAdmin(page);
    await expect(page.getByRole('banner')).toHaveScreenshot('admin-nav-banner-960.png', { mask: mask(page) });
  });

  test('admin-nav-menu.png (/admin, Menu panel open)', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('mobile'), 'the Menu panel is mobile only');
    await openAdmin(page);
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.click();
    const controls = await menu.getAttribute('aria-controls');
    expect(controls, 'Menu button has aria-controls').toBeTruthy();
    const panel = page.locator(`[id="${controls}"]`);
    await expect(primaryAdmin(panel)).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(300);
    await expect(panel).toHaveScreenshot('admin-nav-menu.png', { mask: mask(page) });
  });
});
