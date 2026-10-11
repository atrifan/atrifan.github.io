import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { openSettledSignedIn } from '../support/pages';
import { SIGNED_IN_PAGES, mockHubApis } from '../support/hub-pages';

/**
 * axe (wcag2a + wcag2aa) on the signed-in hub pages in both themes and both viewports.
 * Public hub pages are scanned by pages.a11y.spec.ts. Fails on serious or critical issues.
 */
const BLOCKING = ['serious', 'critical'];

for (const { path, name, role, after } of SIGNED_IN_PAGES) {
  test.describe(`${name} as ${role}`, () => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    test.use({ storageState: storageStatePath(role) });

    test(`${name} (${path}) has no serious or critical axe violations`, async ({ page }) => {
      await mockHubApis(page);
      await openSettledSignedIn(page, path);
      await page.locator('#main').getByText('Loading…').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
      if (after) await after(page);
      // Clerk's dev-instance footer ("Secured by Clerk") is third-party chrome we can't label.
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
      const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
      expect(
        blocking,
        blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
      ).toEqual([]);
    });

    test(`${name} (${path}) has no horizontal scroll`, async ({ page }) => {
      await mockHubApis(page);
      await openSettledSignedIn(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
