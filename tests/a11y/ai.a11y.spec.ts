import AxeBuilder from '@axe-core/playwright';
import { AI_PAGES, expect, fakeDevice, openAi, signedIn, test } from '../support/ai-fixtures';

/**
 * axe (wcag2a + wcag2aa) on every ai page in the four themed projects, populated
 * (mock bridge connected, mocked server endpoints). Fails on serious or critical issues.
 * At the mobile width there is no horizontal page scroll.
 */
const BLOCKING = ['serious', 'critical'];

test.describe('ai panel accessibility', () => {
  signedIn();

  for (const p of AI_PAGES) {
    test(`${p.name} (${p.path}) has no serious or critical axe violations`, async ({ page, bridge }) => {
      await bridge.install({ handlers: fakeDevice() });
      await openAi(page, p.path);
      await expect(page.getByText(p.ready, { exact: true }).first()).toBeVisible();
      // Clerk's dev-instance footer is third-party chrome we can't label.
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
      const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
      expect(
        blocking,
        blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
      ).toEqual([]);
    });

    test(`${p.name} (${p.path}) has no horizontal scroll at the mobile width`, async ({ page, bridge }, testInfo) => {
      test.skip(!testInfo.project.name.endsWith('-mobile'), 'mobile projects only');
      await bridge.install({ handlers: fakeDevice() });
      await openAi(page, p.path);
      await expect(page.getByText(p.ready, { exact: true }).first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
