import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility scans.
 *
 * The control panel lives behind Clerk auth. Until Clerk test tokens are wired
 * up (E2E_CLERK_STORAGE_STATE), we scan the public pages that render the same
 * design system, and gate the authenticated dashboard scan behind that env.
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

test('home page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  const blocking = await scan(page);
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')
  ).toEqual([]);
});

test('pricing page has no serious accessibility violations', async ({ page }) => {
  const res = await page.goto('/pricing');
  test.skip(!res || res.status() >= 400, 'pricing page not available');
  const blocking = await scan(page);
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')
  ).toEqual([]);
});

test.describe('authenticated dashboard', () => {
  test.skip(!process.env.E2E_CLERK_STORAGE_STATE, 'requires Clerk test session (E2E_CLERK_STORAGE_STATE)');
  test.use({ storageState: process.env.E2E_CLERK_STORAGE_STATE });

  test('control panel has no serious accessibility violations', async ({ page }) => {
    await page.goto('/dashboard');
    // The tablist is the anchor of the control panel menu.
    await expect(page.getByRole('tablist', { name: /control panel sections/i })).toBeVisible();
    const blocking = await scan(page);
    expect(
      blocking,
      blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n')
    ).toEqual([]);
  });

  test('control panel tabs are keyboard navigable', async ({ page }) => {
    await page.goto('/dashboard');
    const tabs = page.getByRole('tab');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    // After ArrowRight the second tab should be selected.
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  });
});

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
