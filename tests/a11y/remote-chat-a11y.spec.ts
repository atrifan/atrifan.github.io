import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility scan for the remote chat page (/chat) at two viewports.
 *
 * The page is a mobile-first, responsive chat GUI. We scan it at both a mobile
 * and a desktop viewport and fail on any serious/critical axe violation.
 *
 * The route is Clerk-gated; until Clerk test tokens are wired
 * (E2E_CLERK_STORAGE_STATE) these tests skip cleanly, matching the existing
 * Clerk-gated a11y specs.
 */
const SERIOUS = ['serious', 'critical'];

async function scan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const blocking = results.violations.filter((v) => SERIOUS.includes(v.impact || ''));
  return blocking;
}

test.describe('remote chat accessibility (/chat)', () => {
  test.skip(!process.env.E2E_CLERK_STORAGE_STATE, 'requires Clerk test session (E2E_CLERK_STORAGE_STATE)');
  test.use({ storageState: process.env.E2E_CLERK_STORAGE_STATE });

  test('no serious accessibility violations on mobile (390x844)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat');
    const blocking = await scan(page);
    expect(
      blocking,
      blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')
    ).toEqual([]);
  });

  test('no serious accessibility violations on desktop (1440x900)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/chat');
    const blocking = await scan(page);
    expect(
      blocking,
      blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')
    ).toEqual([]);
  });

  test('no serious violations on the device chat view (voice controls present)', async ({ page }) => {
    // The device-open view (?device=) renders the composer with the voice mic
    // robot + speak-back toggle; scan it so those labelled controls stay a11y-clean.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chat?device=e2e');
    const blocking = await scan(page);
    expect(
      blocking,
      blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')
    ).toEqual([]);
  });
});
