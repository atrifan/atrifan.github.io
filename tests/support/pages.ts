import type { Page } from '@playwright/test';

/**
 * Shared page list and setup for the visual (tests/visual) and a11y
 * (tests/a11y) specs. Each runs in the light-desktop, light-mobile,
 * dark-desktop and dark-mobile Playwright projects.
 */

/**
 * Pages checked in every theme and viewport. /chat and /dashboard need auth and land on /sign-in.
 * The gigs pages show live data, so they have their own seeded specs (tests/{a11y,visual}/gigs.*.spec.ts,
 * run by `npm run test:e2e:gigs`).
 */
export const PAGES = [
  { path: '/', name: 'home' },
  { path: '/pricing', name: 'pricing' },
  { path: '/docs', name: 'docs' },
  { path: '/legal', name: 'legal' },
  { path: '/chat', name: 'chat' },
  { path: '/dashboard', name: 'dashboard' },
  { path: '/ai', name: 'ai' },
  { path: '/sign-in', name: 'sign-in' },
] as const;

/** Consent banner, analytics and ads: never let them into a screenshot or scan. */
const THIRD_PARTY = /(iubenda|googletagmanager|google-analytics|googlesyndication|doubleclick|adservice)/;

/** Go to a page and wait until it is visually settled (Clerk loaded, redirects done, fonts ready). */
export async function openSettled(page: Page, path: string): Promise<void> {
  await page.route(THIRD_PARTY, (route) => route.abort('blockedbyclient'));
  await page.goto(path, { waitUntil: 'load' });
  if (path === '/chat' || path === '/dashboard') {
    await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
  }
  await page.locator('#main').waitFor({ state: 'visible' });
  if (/\/sign-(in|up)/.test(new URL(page.url()).pathname)) {
    await page.locator('.cl-rootBox, .cl-signIn-root, .cl-signUp-root').first().waitFor({ state: 'visible', timeout: 30_000 });
  }
  // The shell shows "Sign in" once Clerk has loaded the (signed-out) session.
  await page
    .getByRole('link', { name: 'Sign in', exact: true, includeHidden: true })
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/** Go to a page as a signed-in user (storageState) and wait until Clerk shows the user button. */
export async function openSettledSignedIn(page: Page, path: string): Promise<void> {
  await page.route(THIRD_PARTY, (route) => route.abort('blockedbyclient'));
  await page.goto(path, { waitUntil: 'load' });
  await page.locator('#main').waitFor({ state: 'visible' });
  await page.locator('.cl-userButtonTrigger').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}
