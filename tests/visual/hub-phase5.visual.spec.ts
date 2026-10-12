import { expect, test } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { openSettledSignedIn } from '../support/pages';
import { mockHubApis } from '../support/hub-pages';
import { PHASE5_HUB_PAGES } from '../support/hub-phase5';

/**
 * Visual baselines for the Phase 5 hub pages: /admin/disputes (list and detail), /profile
 * with reviews and trust, /credits with a monthly grant, in light/dark x desktop/mobile.
 * Mock data uses fixed dates; masked: Clerk widgets, Clerk's PricingTable and <time> elements.
 */
for (const { path, name, role, mock, ready, after } of PHASE5_HUB_PAGES) {
  test.describe(`${name} as ${role}`, () => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    test.use({ storageState: storageStatePath(role) });

    test(`${name} (${path})`, async ({ page }) => {
      await mockHubApis(page);
      await mock(page);
      await openSettledSignedIn(page, path);
      await expect(page.getByText(ready).first()).toBeVisible();
      if (after) await after(page);
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: true,
        mask: [
          page.locator('.cl-footer'),
          page.locator('.cl-userButtonBox'),
          page.locator('.pricing-table-wrapper'),
          page.locator('#main time'),
        ],
      });
    });
  });
}
