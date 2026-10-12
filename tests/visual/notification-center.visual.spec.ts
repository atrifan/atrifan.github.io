import { expect, test } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { openSettledSignedIn } from '../support/pages';
import { mockHubApis } from '../support/hub-pages';
import { NOTIF_PAGES, mockForNotifPage, prepare } from '../support/notification-center';

/**
 * Visual baselines for the notification center and activity views: the bell dropdown (items,
 * empty), /notifications (items, empty), /marketplace/publisher/activity, /gigs/activity and
 * /admin/activity, in light/dark x desktop/mobile. Mock data is fixed;
 * masked: Clerk widgets and <time> elements.
 */
for (const p of NOTIF_PAGES) {
  test.describe(`${p.name} as ${p.role}`, () => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    test.use({ storageState: storageStatePath(p.role) });

    test(`${p.name} (${p.path})`, async ({ page }) => {
      await prepare(page);
      await mockHubApis(page);
      await mockForNotifPage(page, p);
      await openSettledSignedIn(page, p.path);
      await expect(p.ready(page).first()).toBeVisible();
      if (p.after) {
        // keep the dropdown open (and its focus): that is the state under test
        await p.after(page);
      } else {
        await page.mouse.move(0, 0);
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo(0, 0);
        });
      }
      await page.waitForTimeout(300);
      await expect(page).toHaveScreenshot(`${p.name}.png`, {
        fullPage: true,
        mask: [
          page.locator('.cl-footer'),
          page.locator('.cl-userButtonBox'),
          page.locator('#main time'),
          page.getByRole('dialog').locator('time'),
        ],
      });
    });
  });
}
