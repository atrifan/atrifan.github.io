import { expect, test } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { openSettledSignedIn } from '../support/pages';
import { SIGNED_IN_PAGES, mockHubApis } from '../support/hub-pages';

/**
 * Visual baselines for the signed-in hub pages (profile, credits, admin QA, signed-in
 * landing and pricing) in the light/dark x desktop/mobile projects. Public hub pages are
 * in pages.visual.spec.ts. API data is mocked (tests/support/hub-pages.ts).
 *
 * Masked: Clerk's user button and dev footer, and Clerk's PricingTable (loaded live from Clerk).
 */
for (const { path, name, role, after } of SIGNED_IN_PAGES) {
  test.describe(`${name} as ${role}`, () => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    test.use({ storageState: storageStatePath(role) });

    test(`${name} (${path})`, async ({ page }) => {
      await mockHubApis(page);
      await openSettledSignedIn(page, path);
      await page.locator('#main').getByText('Loading…').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
      if (after) await after(page);
      await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage: !after,
        mask: [page.locator('.cl-footer'), page.locator('.cl-userButtonBox'), page.locator('.pricing-table-wrapper')],
      });
    });
  });
}
