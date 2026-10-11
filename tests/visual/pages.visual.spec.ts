import { expect, test } from '@playwright/test';
import { PAGES, openSettled } from '../support/pages';

/**
 * Visual baselines for every page, in the light/dark x desktop/mobile projects.
 * Snapshots: tests/visual/pages.visual.spec.ts-snapshots/<name>-<project>-<platform>.png
 * (darwin for local runs, linux for CI). Update with
 *   npx playwright test tests/visual --update-snapshots
 * and look at every changed image before committing it.
 *
 * Masked: the ad slot, and Clerk's widgets (their dev-instance banner and
 * avatar change between runs).
 */
for (const { path, name } of PAGES) {
  test(`${name} (${path})`, async ({ page }) => {
    await openSettled(page, path);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      mask: [page.locator('[data-ad-slot]'), page.locator('.cl-footer'), page.locator('.cl-userButtonBox')],
    });
  });
}
