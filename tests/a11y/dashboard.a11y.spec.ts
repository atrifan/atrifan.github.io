import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility scans.
 *
 * The control panel lives behind Clerk auth: these scans run only with a saved
 * Clerk session (E2E_CLERK_STORAGE_STATE).
 *
 * Fails on any serious or critical axe violation.
 */

const SERIOUS = ['serious', 'critical'];

async function scan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const blocking = results.violations.filter((v) => SERIOUS.includes(v.impact || ''));
  return blocking;
}

// Public pages (home, pricing, …) are scanned in every theme and viewport by pages.a11y.spec.ts.

// The ai. control panel (formerly /dashboard) is scanned in every theme and viewport by ai.a11y.spec.ts.

test.describe('authenticated remote chat', () => {
  test.skip(!process.env.E2E_CLERK_STORAGE_STATE, 'requires Clerk test session (E2E_CLERK_STORAGE_STATE)');
  test.use({ storageState: process.env.E2E_CLERK_STORAGE_STATE });

  test('remote chat device picker has no serious accessibility violations', async ({ page }) => {
    await page.goto('/chat');
    // The message log region anchors the chat surface.
    const blocking = await scan(page);
    expect(
      blocking,
      blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')
    ).toEqual([]);
  });
});
