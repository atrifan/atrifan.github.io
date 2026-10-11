import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PAGES, openSettled } from '../support/pages';

/**
 * axe (wcag2a + wcag2aa) on every page, in both themes and both viewports
 * (light/dark x desktop/mobile projects). Fails on serious or critical issues.
 * Signed out: /chat and /dashboard are scanned as the sign-in page they land on.
 */
const BLOCKING = ['serious', 'critical'];

for (const { path, name } of PAGES) {
  test(`${name} (${path}) has no serious or critical axe violations`, async ({ page }) => {
    await openSettled(page, path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
    expect(
      blocking,
      blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
    ).toEqual([]);
  });

  test(`${name} (${path}) has no horizontal scroll`, async ({ page }) => {
    await openSettled(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
