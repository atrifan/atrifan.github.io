import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { openSettledSignedIn } from '../support/pages';
import { mockHubApis } from '../support/hub-pages';
import { NOTIF_PAGES, horizontalOverflow, mockForNotifPage, prepare } from '../support/notification-center';

/**
 * axe (wcag2a + wcag2aa, fails on serious/critical) and no horizontal scroll for the notification
 * center and activity views: /notifications (items, empty), the open bell dropdown on / (items,
 * empty), /marketplace/publisher/activity, /gigs/activity, /admin/activity. APIs mocked;
 * light/dark x desktop/mobile projects.
 */
const BLOCKING = ['serious', 'critical'];

for (const p of NOTIF_PAGES) {
  test.describe(`${p.name} as ${p.role}`, () => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    test.use({ storageState: storageStatePath(p.role) });

    test(`${p.name} (${p.path}) has no serious or critical axe violations and no horizontal scroll`, async ({ page }) => {
      await prepare(page);
      await mockHubApis(page);
      await mockForNotifPage(page, p);
      await openSettledSignedIn(page, p.path);
      await expect(p.ready(page).first()).toBeVisible();
      if (p.after) await p.after(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
      const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
      expect(
        blocking,
        blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
      ).toEqual([]);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
