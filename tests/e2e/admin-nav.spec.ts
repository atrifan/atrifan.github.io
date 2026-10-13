import { expect, test, type Locator, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { blockThirdParty } from './surface-helpers';
import { userButton } from './hub-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

/**
 * Admin entry in the primary navigation.
 *
 * Contract: the banner's nav "Primary" holds AI, Marketplace, Gigs, Chat (each with an svg icon). For admins
 * only, a fifth link "Admin" (with an svg icon, href ending in /admin) follows Chat, on desktop and in the
 * phone "Menu" panel. It is aria-current="page" on the admin pages (and then it is the only current link),
 * never elsewhere. Customers and signed-out users never see it, not even briefly while the page loads, and
 * its arrival does not move the other links.
 */

const BASE_NAV = ['AI', 'Marketplace', 'Gigs', 'Chat'] as const;
const ADMIN_PAGES = ['/admin', '/admin/qa', '/marketplace/admin'] as const;
const NON_ADMIN_PAGES = ['/', '/pricing', '/marketplace', '/gigs'] as const;
const NO_ADMIN_FOR_OTHERS = ['/', '/marketplace', '/gigs'] as const;

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

/** An href whose path ends with `path` (relative or absolute, any query/hash). */
const hrefEndingWith = (path: string) => new RegExp(`${path.replace(/[/.]/g, '\\$&')}/?(?:[?#].*)?$`);

const primaryNav = (scope: Page | Locator): Locator => scope.getByRole('navigation', { name: 'Primary', exact: true });
const navLink = (scope: Page | Locator, name: string): Locator => scope.getByRole('link', { name, exact: true });

/** Trimmed text of every link in `scope`, in DOM order. */
const linkNames = (scope: Locator): Promise<string[]> =>
  scope.getByRole('link').evaluateAll((els) => els.map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()));

async function openMenuPanel(page: Page): Promise<Locator> {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.click();
  const controls = await menu.getAttribute('aria-controls');
  expect(controls, 'Menu button has aria-controls').toBeTruthy();
  const panel = page.locator(`[id="${controls}"]`);
  await expect(panel).toBeVisible();
  return panel;
}

/** The Primary nav inside the panel when there is one, else the panel itself. */
async function panelNav(panel: Locator): Promise<Locator> {
  const nav = primaryNav(panel);
  return (await nav.count()) > 0 ? nav : panel;
}

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
  // Lets Clerk refresh the saved session (60s tokens) past bot protection.
  if (hasClerkTestEnv()) await setupClerkTestingToken({ page });
});

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  test.describe('desktop 1280x800', () => {
    test.use({ viewport: DESKTOP });

    test('Primary nav ends AI, Marketplace, Gigs, Chat, Admin, and Admin has an icon and links to /admin', async ({ page }) => {
      await page.goto('/');
      const nav = primaryNav(page);
      const admin = navLink(nav, 'Admin');
      await expect(admin).toBeVisible({ timeout: 30_000 });
      await expect(admin).toHaveAttribute('href', hrefEndingWith('/admin'));
      await expect(admin.locator('svg')).toHaveCount(1);
      expect(await linkNames(nav)).toEqual([...BASE_NAV, 'Admin']);
      for (const name of BASE_NAV) await expect(navLink(nav, name).locator('svg')).toHaveCount(1);
    });

    for (const path of ADMIN_PAGES) {
      test(`on ${path} Admin is the only aria-current="page" link in Primary`, async ({ page }) => {
        await page.goto(path);
        const nav = primaryNav(page);
        const admin = navLink(nav, 'Admin');
        await expect(admin).toBeVisible({ timeout: 30_000 });
        await expect(admin).toHaveAttribute('aria-current', 'page');
        for (const name of BASE_NAV) await expect(navLink(nav, name)).not.toHaveAttribute('aria-current', 'page');
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      });
    }

    for (const path of NON_ADMIN_PAGES) {
      test(`on ${path} the Admin link is not aria-current`, async ({ page }) => {
        await page.goto(path);
        const admin = navLink(primaryNav(page), 'Admin');
        await expect(admin).toBeVisible({ timeout: 30_000 });
        await expect(admin).not.toHaveAttribute('aria-current', 'page');
      });
    }

    test('keyboard: the Tab after Chat focuses Admin', async ({ page }) => {
      await page.goto('/');
      const nav = primaryNav(page);
      await expect(navLink(nav, 'Admin')).toBeVisible({ timeout: 30_000 });
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      const focused = () =>
        page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return {
            text: (el?.getAttribute('aria-label') ?? el?.textContent ?? '').trim(),
            inPrimary: el?.closest('nav')?.getAttribute('aria-label') === 'Primary',
            tag: el?.tagName.toLowerCase() ?? '',
          };
        });
      let reachedChat = false;
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab');
        const f = await focused();
        if (f.inPrimary && f.tag === 'a' && f.text === 'Chat') {
          reachedChat = true;
          break;
        }
      }
      expect(reachedChat, 'Tab reaches Chat in the Primary nav').toBe(true);
      await page.keyboard.press('Tab');
      await expect(navLink(nav, 'Admin')).toBeFocused();
    });

    test('no layout shift: AI/Marketplace/Gigs/Chat stay put when Admin appears', async ({ page }) => {
      await page.addInitScript(() => {
        type Box = { x: number; y: number; w: number; h: number };
        const w = window as unknown as { __navBefore: Record<string, Box> | null; __navAt: Record<string, Box> | null };
        w.__navBefore = null;
        w.__navAt = null;
        const NAMES = ['AI', 'Marketplace', 'Gigs', 'Chat'];
        const linksOf = (nav: Element) =>
          Array.from(nav.querySelectorAll('a')).map((a) => ({ a, name: (a.getAttribute('aria-label') ?? a.textContent ?? '').trim() }));
        const measure = (): { boxes: Record<string, Box> | null; hasAdmin: boolean } => {
          const nav = document.querySelector('nav[aria-label="Primary"]');
          if (!nav) return { boxes: null, hasAdmin: false };
          const links = linksOf(nav);
          const boxes: Record<string, Box> = {};
          for (const n of NAMES) {
            const l = links.find((x) => x.name === n);
            if (!l) return { boxes: null, hasAdmin: false };
            const r = l.a.getBoundingClientRect();
            boxes[n] = { x: r.x, y: r.y, w: r.width, h: r.height };
          }
          return { boxes, hasAdmin: links.some((x) => x.name === 'Admin') };
        };
        const sample = () => {
          if (w.__navAt) return;
          const { boxes, hasAdmin } = measure();
          if (!boxes) return;
          if (hasAdmin) w.__navAt = boxes;
          else w.__navBefore = boxes;
        };
        const tick = () => {
          sample();
          if (!w.__navAt) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        new MutationObserver(sample).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      });
      await page.goto('/');
      await expect(navLink(primaryNav(page), 'Admin')).toBeVisible({ timeout: 30_000 });
      const { before, at } = await page.evaluate(() => {
        const w = window as unknown as { __navBefore: unknown; __navAt: unknown };
        return { before: w.__navBefore as Record<string, { x: number; y: number; w: number; h: number }> | null, at: w.__navAt as Record<string, { x: number; y: number; w: number; h: number }> | null };
      });
      expect(at, 'positions recorded when Admin appeared').not.toBeNull();
      // Admin present from the first render: nothing to shift.
      if (!before) return;
      for (const name of BASE_NAV) {
        const b = before[name];
        const a = at![name];
        expect(Math.abs(a.x - b.x), `${name} x`).toBeLessThanOrEqual(1);
        expect(Math.abs(a.y - b.y), `${name} y`).toBeLessThanOrEqual(1);
        expect(Math.abs(a.w - b.w), `${name} width`).toBeLessThanOrEqual(1);
        expect(Math.abs(a.h - b.h), `${name} height`).toBeLessThanOrEqual(1);
      }
    });
  });

  test.describe('phone 390x844', () => {
    test.use({ viewport: PHONE });

    test('the Menu panel shows Admin with an icon right after Chat', async ({ page }) => {
      await page.goto('/');
      const panel = await openMenuPanel(page);
      const nav = await panelNav(panel);
      const admin = navLink(nav, 'Admin');
      await expect(admin).toBeVisible({ timeout: 30_000 });
      await expect(admin).toHaveAttribute('href', hrefEndingWith('/admin'));
      await expect(admin.locator('svg')).toHaveCount(1);
      const names = await linkNames(nav);
      const chat = names.indexOf('Chat');
      expect(chat, `Chat in ${JSON.stringify(names)}`).toBeGreaterThanOrEqual(0);
      expect(names[chat + 1], `link after Chat in ${JSON.stringify(names)}`).toBe('Admin');
    });
  });
});

/** Signed-in: wait for the account control so a missing Admin link is not just "not loaded yet". */
async function expectNoAdmin(page: Page, path: string, mobile: boolean, signedIn: boolean) {
  await page.goto(path);
  if (mobile) {
    const panel = await openMenuPanel(page);
    if (signedIn) await expect(userButton(panel)).toBeVisible({ timeout: 30_000 });
    else await expect(page.getByRole('link', { name: 'Sign in', exact: true, includeHidden: true }).first()).toBeAttached({ timeout: 30_000 });
    await expect(navLink(panel, 'Chat')).toBeVisible();
    await expect(navLink(panel, 'Admin')).toHaveCount(0);
  } else {
    const banner = page.getByRole('banner');
    if (signedIn) await expect(userButton(banner)).toBeVisible({ timeout: 30_000 });
    else await expect(navLink(banner, 'Sign in')).toBeVisible({ timeout: 30_000 });
    await expect(navLink(primaryNav(page), 'Chat')).toBeVisible();
    await expect(navLink(primaryNav(page), 'Admin')).toHaveCount(0);
  }
}

for (const who of ['customer', 'signed out'] as const) {
  test.describe(who, () => {
    if (who === 'customer') {
      test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
      test.use({ storageState: storageStatePath('customer') });
    } else {
      test.use({ storageState: { cookies: [], origins: [] } });
    }
    const signedIn = who === 'customer';

    for (const path of NO_ADMIN_FOR_OTHERS) {
      test.describe('desktop 1280x800', () => {
        test.use({ viewport: DESKTOP });
        test(`no Admin link in Primary on ${path}`, async ({ page }) => {
          await expectNoAdmin(page, path, false, signedIn);
        });
      });
      test.describe('phone 390x844', () => {
        test.use({ viewport: PHONE });
        test(`no Admin link in the Menu panel on ${path}`, async ({ page }) => {
          await expectNoAdmin(page, path, true, signedIn);
        });
      });
    }
  });
}

test.describe('customer: no flash', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('customer'), viewport: DESKTOP });

  test('an Admin link never appears in Primary while / loads', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __adminSeen: boolean };
      w.__adminSeen = false;
      const check = () => {
        for (const nav of Array.from(document.querySelectorAll('nav[aria-label="Primary"]'))) {
          for (const a of Array.from(nav.querySelectorAll('a'))) {
            if ((a.getAttribute('aria-label') ?? a.textContent ?? '').trim() === 'Admin') w.__adminSeen = true;
          }
        }
      };
      new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      document.addEventListener('DOMContentLoaded', check);
    });
    await page.goto('/');
    await expect(userButton(page.getByRole('banner'))).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => (window as unknown as { __adminSeen: boolean }).__adminSeen)).toBe(false);
  });
});
