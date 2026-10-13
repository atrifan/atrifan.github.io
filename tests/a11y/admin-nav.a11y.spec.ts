import { expect, test, type Locator, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import AxeBuilder from '@axe-core/playwright';
import { blockThirdParty } from '../e2e/surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

/**
 * axe (wcag2a + wcag2aa, no serious/critical) on / and /admin as the admin, with the "Admin" link in the
 * Primary nav, in the light/dark x desktop/mobile projects. On mobile also with the Menu panel open.
 */

const BLOCKING = ['serious', 'critical'];
const PATHS = ['/', '/admin'] as const;

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
  const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
  ).toEqual([]);
}

/** The Admin link in the Primary nav; `includeHidden` finds it while the phone Menu is closed. */
const primaryAdmin = (scope: Page | Locator, includeHidden = false) =>
  scope
    .getByRole('navigation', { name: 'Primary', exact: true, includeHidden })
    .getByRole('link', { name: 'Admin', exact: true, includeHidden })
    .first();

async function open(page: Page, path: string) {
  await blockThirdParty(page);
  await setupClerkTestingToken({ page });
  await page.goto(path, { waitUntil: 'load' });
  await page.locator('#main').waitFor({ state: 'visible' });
  await expect(primaryAdmin(page, true)).toBeAttached({ timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  for (const path of PATHS) {
    test(`${path} with the Admin nav link has no serious or critical axe violations`, async ({ page }) => {
      await open(page, path);
      await expectNoBlockingViolations(page);
    });

    test(`${path} with the Menu panel open has no serious or critical axe violations`, async ({ page }, testInfo) => {
      test.skip(!testInfo.project.name.endsWith('mobile'), 'the Menu panel is mobile only');
      await open(page, path);
      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      await menu.click();
      const controls = await menu.getAttribute('aria-controls');
      expect(controls, 'Menu button has aria-controls').toBeTruthy();
      const panel = page.locator(`[id="${controls}"]`);
      await expect(primaryAdmin(panel)).toBeVisible({ timeout: 30_000 });
      await expectNoBlockingViolations(page);
    });
  }
});
