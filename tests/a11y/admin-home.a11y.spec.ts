import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import AxeBuilder from '@axe-core/playwright';
import { blockThirdParty } from '../e2e/surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

test.skip(process.env.ADMIN_HOME_E2E !== '1', 'admin home e2e runs via npm run test:e2e:marketplace');

/**
 * axe (wcag2a + wcag2aa, no serious/critical) and no horizontal scroll on the admin home (hub /admin)
 * as the admin, in the light/dark x desktop/mobile projects, on the seeded data
 * (tests/support/admin-home-seed.ts). On mobile also with the Menu panel open (its Admin link).
 */

const BLOCKING = ['serious', 'critical'];

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
  const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
  ).toEqual([]);
}

async function openAdminHome(page: Page) {
  await blockThirdParty(page);
  await setupClerkTestingToken({ page });
  await page.goto('/admin', { waitUntil: 'load' });
  await page.getByRole('heading', { level: 1, name: 'Admin' }).waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  test('/admin has no serious or critical axe violations', async ({ page }) => {
    await openAdminHome(page);
    await expectNoBlockingViolations(page);
  });

  test('/admin has no horizontal scroll', async ({ page }) => {
    await openAdminHome(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('/admin with the Menu panel open has no serious or critical axe violations', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.endsWith('mobile'), 'the Menu panel is mobile only');
    await openAdminHome(page);
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.locator('#site-menu').getByRole('link', { name: 'Admin', exact: true })).toBeVisible({ timeout: 30_000 });
    await expectNoBlockingViolations(page);
  });
});
