import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { openSettledSignedIn } from '../support/pages';
import { mockHubApis } from '../support/hub-pages';
import { PHASE5_HUB_PAGES } from '../support/hub-phase5';

/**
 * axe (wcag2a + wcag2aa, fails on serious/critical) and no horizontal scroll on the Phase 5
 * hub pages: /admin/disputes (list and detail with the decision form), /profile with reviews
 * and trust, /credits with a monthly grant. APIs mocked; light/dark x desktop/mobile.
 */
const BLOCKING = ['serious', 'critical'];

for (const { path, name, role, mock, ready, after } of PHASE5_HUB_PAGES) {
  test.describe(`${name} as ${role}`, () => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    test.use({ storageState: storageStatePath(role) });

    test(`${name} (${path}) has no serious or critical axe violations and no horizontal scroll`, async ({ page }) => {
      await mockHubApis(page);
      await mock(page);
      await openSettledSignedIn(page, path);
      await expect(page.getByText(ready).first()).toBeVisible();
      if (after) await after(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
      const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
      expect(
        blocking,
        blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
      ).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
