import { test, expect, type Page } from '@playwright/test';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { guardPage, userButton } from './hub-helpers';

/** Shell header on the hub pages: signed-out "Sign in", signed-in Clerk user button, no flash. */

const SIGNED_IN_PAGES = ['/', '/dashboard', '/profile', '/credits'];

const bannerSignIn = (page: Page) => page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true });

test.describe('hub header, signed out', () => {
  test.beforeEach(async ({ page }) => guardPage(page));

  test('banner has a "Sign in" link to /sign-in', async ({ page }) => {
    await page.goto('/');
    const link = bannerSignIn(page);
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/sign-in');
  });
});

test.describe('hub header, signed in (customer)', () => {
  test.use({ storageState: storageStatePath('customer') });
  test.beforeEach(async ({ page }) => {
    test.skip(!hasClerkTestEnv(), 'Clerk dev keys not configured');
    await guardPage(page);
  });

  test.describe('desktop 1280x800', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    for (const path of SIGNED_IN_PAGES) {
      test(`${path}: user button visible in the banner, no "Sign in"`, async ({ page }) => {
        await page.goto(path);
        const trigger = userButton(page.getByRole('banner'));
        await expect(trigger).toBeVisible({ timeout: 30_000 });
        await expect(trigger).toHaveClass(/cl-userButtonTrigger/);
        await expect(bannerSignIn(page)).toHaveCount(0);
      });
    }

    test('user button menu has Profile, which goes to /profile', async ({ page }) => {
      await page.goto('/');
      await userButton(page.getByRole('banner')).click({ timeout: 30_000 });
      await expect(page.getByRole('menuitem', { name: 'Credits', exact: true })).toBeVisible();
      await page.getByRole('menuitem', { name: 'Profile', exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
    });

    test('user button menu has Credits, which goes to /credits', async ({ page }) => {
      await page.goto('/');
      await userButton(page.getByRole('banner')).click({ timeout: 30_000 });
      await expect(page.getByRole('menuitem', { name: 'Profile', exact: true })).toBeVisible();
      await page.getByRole('menuitem', { name: 'Credits', exact: true }).click();
      await expect(page).toHaveURL(/\/credits$/);
    });

    for (const path of ['/', '/dashboard']) {
      test(`${path}: "Sign in" never flashes in the header while Clerk loads`, async ({ page }) => {
        await page.addInitScript(() => {
          const w = window as unknown as { __signInSeen: boolean };
          w.__signInSeen = false;
          const check = () => {
            for (const a of Array.from(document.querySelectorAll('header a'))) {
              if (a.textContent?.trim() === 'Sign in') w.__signInSeen = true;
            }
          };
          new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
          document.addEventListener('DOMContentLoaded', check);
        });
        await page.goto(path);
        await expect(userButton(page.getByRole('banner'))).toBeVisible({ timeout: 30_000 });
        expect(await page.evaluate(() => (window as unknown as { __signInSeen: boolean }).__signInSeen)).toBe(false);
      });
    }
  });

  test.describe('mobile 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    for (const path of SIGNED_IN_PAGES) {
      test(`${path}: user button is inside the Menu panel, no "Sign in"`, async ({ page }) => {
        await page.goto(path);
        const menu = page.getByRole('button', { name: 'Menu', exact: true });
        await menu.click();
        const controls = await menu.getAttribute('aria-controls');
        expect(controls, 'Menu button has aria-controls').toBeTruthy();
        const panel = page.locator(`[id="${controls}"]`);
        await expect(panel).toBeVisible();
        await expect(userButton(panel)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
      });
    }
  });
});
