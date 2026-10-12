import { test, expect, type Locator, type Page } from '@playwright/test';
import { AD_SLOT, PRIMARY_NAV, blockThirdParty } from './surface-helpers';

/**
 * App shell contract in path-prefix mode (:3000), signed out:
 * skip link, landmarks, primary nav, sign-in entry, mobile menu with focus
 * trap, touch targets, no horizontal scroll and footer-only lazy ads.
 */

// /ai is signed-in only (the control panel), so it is not a signed-out shell page.
const SHELL_PAGES = ['/', '/pricing', '/marketplace', '/gigs'];
const CURRENT_BY_PAGE: Record<string, string | null> = {
  '/': null,
  '/pricing': null,
  '/marketplace': 'Marketplace',
  '/gigs': 'Gigs',
};
const NAV_HREF: Record<string, string> = {
  AI: '/ai',
  Marketplace: '/marketplace',
  Gigs: '/gigs',
  Chat: '/chat',
};

const blockAds = (page: Page) => blockThirdParty(page);

function signInControl(scope: Locator | Page): Locator {
  return scope
    .getByRole('link', { name: 'Sign in', exact: true })
    .or(scope.getByRole('button', { name: 'Sign in', exact: true }));
}

async function expectLeadsToSignIn(page: Page, control: Locator) {
  const tag = await control.evaluate((el) => el.tagName.toLowerCase());
  const href = tag === 'a' ? await control.getAttribute('href') : null;
  if (href) {
    expect(new URL(href, page.url()).pathname).toMatch(/^\/sign-in/);
  } else {
    await control.click();
    await expect(page).toHaveURL(/\/sign-in/);
  }
}

test.describe('app shell (desktop 1280x800)', () => {
  test.beforeEach(async ({ page }) => blockAds(page));

  for (const path of SHELL_PAGES) {
    test.describe(`on ${path}`, () => {
      test('first Tab focuses "Skip to content", which moves to #main', async ({ page }) => {
        await page.goto(path);
        await page.keyboard.press('Tab');
        const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
        await expect(skip).toBeFocused();
        await expect(skip).toHaveAttribute('href', '#main');
        await page.keyboard.press('Enter');
        await expect
          .poll(() =>
            page.evaluate(() => {
              const main = document.getElementById('main');
              if (!main) return 'no #main';
              const active = document.activeElement;
              if (active && main.contains(active)) return 'focused';
              const top = main.getBoundingClientRect().top;
              if (location.hash === '#main' && top >= -1 && top < window.innerHeight) return 'focused';
              return 'not moved';
            }),
          )
          .toBe('focused');
      });

      test('exactly one main landmark, and it is #main', async ({ page }) => {
        await page.goto(path);
        const main = page.getByRole('main');
        await expect(main).toHaveCount(1);
        await expect(main).toHaveAttribute('id', 'main');
      });

      test('banner has the "Tulzo" wordmark linking to "/"', async ({ page }) => {
        await page.goto(path);
        const wordmark = page.getByRole('banner').getByRole('link', { name: 'Tulzo', exact: true });
        await expect(wordmark).toBeVisible();
        await expect(wordmark).toHaveAttribute('href', '/');
      });

      test('Primary nav has AI, Marketplace, Gigs, Chat with correct hrefs and aria-current', async ({
        page,
      }) => {
        await page.goto(path);
        const links = page.getByRole('navigation', { name: 'Primary' }).getByRole('link');
        await expect(links).toHaveCount(4);
        await expect(links).toHaveText([...PRIMARY_NAV]);
        for (const [i, name] of PRIMARY_NAV.entries()) {
          const link = links.nth(i);
          await expect(link).toBeVisible();
          await expect(link).toHaveAttribute('href', NAV_HREF[name]);
          if (CURRENT_BY_PAGE[path] === name) await expect(link).toHaveAttribute('aria-current', 'page');
          else await expect(link).not.toHaveAttribute('aria-current', /.*/);
        }
      });

      test('signed out: header shows "Sign in" to /sign-in and no Profile/Credits links', async ({ page }) => {
        await page.goto(path);
        const signIn = signInControl(page.getByRole('banner'));
        await expect(signIn).toBeVisible();
        await expect(page.getByRole('link', { name: /profile/i })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /credits/i })).toHaveCount(0);
        await expectLeadsToSignIn(page, signIn);
      });

      test('has a contentinfo landmark', async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole('contentinfo')).toHaveCount(1);
      });
    });
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test.describe(`mobile menu (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport, hasTouch: true });
    test.beforeEach(async ({ page }) => blockAds(page));

    async function menuParts(page: Page) {
      const button = page.getByRole('button', { name: 'Menu', exact: true });
      await expect(button).toBeVisible();
      const controls = await button.getAttribute('aria-controls');
      expect(controls, 'Menu button has aria-controls').toBeTruthy();
      const panel = page.locator(`[id="${controls}"]`);
      return { button, panel };
    }

    test('nav links are hidden until Menu is pressed; menu shows nav, Sign in and theme', async ({ page }) => {
      await page.goto('/');
      const { button, panel } = await menuParts(page);
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      for (const name of PRIMARY_NAV) {
        await expect(page.getByRole('link', { name, exact: true })).toBeHidden();
      }

      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(panel).toBeVisible();
      for (const name of PRIMARY_NAV) {
        await expect(panel.getByRole('link', { name, exact: true })).toBeVisible();
      }
      await expect(signInControl(panel)).toBeVisible();
      await expect(panel.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    });

    test('open menu traps focus; Escape closes it and returns focus to Menu', async ({ page }) => {
      await page.goto('/');
      const { button, panel } = await menuParts(page);
      await button.click();
      await expect(button).toHaveAttribute('aria-expanded', 'true');

      const controlsId = (await button.getAttribute('aria-controls'))!;
      const focusInside = () =>
        page.evaluate((id) => {
          const panelEl = document.getElementById(id);
          const active = document.activeElement;
          const menuButton = document.querySelector(`[aria-controls="${id}"]`);
          return !!active && (active === menuButton || !!panelEl?.contains(active));
        }, controlsId);

      await expect
        .poll(() => panel.evaluate((el) => el.contains(document.activeElement)), {
          message: 'focus moves into the menu when it opens',
        })
        .toBe(true);

      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('Tab');
        expect(await focusInside(), `focus stays in menu after Tab #${i + 1}`).toBe(true);
      }
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Shift+Tab');
        expect(await focusInside(), `focus stays in menu after Shift+Tab #${i + 1}`).toBe(true);
      }

      await page.keyboard.press('Escape');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      for (const name of PRIMARY_NAV) {
        await expect(page.getByRole('link', { name, exact: true })).toBeHidden();
      }
      await expect(button).toBeFocused();
    });

    test('clicking a nav link in the menu navigates', async ({ page }) => {
      await page.goto('/');
      const { button, panel } = await menuParts(page);
      await button.click();
      await panel.getByRole('link', { name: 'Marketplace', exact: true }).click();
      await expect(page).toHaveURL(/\/marketplace$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Marketplace');
    });

    for (const path of [...SHELL_PAGES, '/sign-in']) {
      test(`no horizontal scroll on ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('load');
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      });
    }
  });
}

test.describe('touch targets (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test.beforeEach(async ({ page }) => blockAds(page));

  async function expectTargets(scope: Locator, label: string) {
    const targets = scope.locator('a, button, [role="button"], [role="link"]').filter({ visible: true });
    const count = await targets.count();
    expect(count, `${label} has visible links/buttons`).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const el = targets.nth(i);
      const box = await el.boundingBox();
      const name = (await el.getAttribute('aria-label')) ?? (await el.innerText()).trim();
      expect(box, `${label} target "${name}" has a box`).not.toBeNull();
      expect(box!.height, `${label} target "${name}" height`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${label} target "${name}" width`).toBeGreaterThanOrEqual(44);
    }
  }

  test('header and open-menu links/buttons are at least 44x44', async ({ page }) => {
    await page.goto('/');
    await expectTargets(page.getByRole('banner'), 'header');
    const button = page.getByRole('button', { name: 'Menu', exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator(`[id="${await button.getAttribute('aria-controls')}"]`);
    await expect(panel).toBeVisible();
    await expectTargets(panel, 'menu');
  });
});

test.describe('ads (signed out)', () => {
  test.beforeEach(async ({ page }) => blockAds(page));

  async function expectAdsOnlyInFooter(page: Page) {
    const footer = page.getByRole('contentinfo');
    const all = await page.locator('ins.adsbygoogle').count();
    const inFooter = await footer.locator('ins.adsbygoogle').count();
    expect(all, 'ins.adsbygoogle outside the footer').toBe(inFooter);
  }

  test('"/" has exactly one ad slot, inside the footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    await expect(page.locator(AD_SLOT)).toHaveCount(1);
    await expect(page.getByRole('contentinfo').locator(AD_SLOT)).toHaveCount(1);
    await expectAdsOnlyInFooter(page);
  });

  for (const path of ['/pricing', '/ai', '/sign-in']) {
    test(`${path} has no ad slots`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('load');
      await expect(page.locator(AD_SLOT)).toHaveCount(0);
      await expect(page.locator('ins.adsbygoogle')).toHaveCount(0);
    });
  }

  for (const path of ['/marketplace', '/gigs']) {
    test(`${path} has at most one ad slot, in the footer`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('load');
      const total = await page.locator(AD_SLOT).count();
      expect(total).toBeLessThanOrEqual(1);
      expect(await page.getByRole('contentinfo').locator(AD_SLOT).count()).toBe(total);
      await expectAdsOnlyInFooter(page);
    });
  }

  test('"/" footer ad is lazy: below the fold, no ins until scrolled into view, slot <= 120px', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('load');
    const footer = page.getByRole('contentinfo');
    await expect(footer).toHaveCount(1);

    const footerTop = await footer.evaluate((el) => el.getBoundingClientRect().top);
    expect(footerTop, 'footer starts below the fold').toBeGreaterThanOrEqual(800);

    await page.waitForTimeout(1000);
    await expect(page.locator('ins.adsbygoogle'), 'no ad element before the footer is in view').toHaveCount(0);

    const slot = footer.locator(AD_SLOT);
    await expect(slot).toHaveCount(1);
    await footer.scrollIntoViewIfNeeded();
    await slot
      .locator('ins.adsbygoogle')
      .first()
      .waitFor({ state: 'attached', timeout: 5000 })
      .catch(() => undefined);

    const all = await page.locator('ins.adsbygoogle').count();
    expect(all).toBeLessThanOrEqual(1);
    expect(await slot.locator('ins.adsbygoogle').count()).toBe(all);

    const box = await slot.boundingBox();
    expect(box, 'ad slot is rendered').not.toBeNull();
    expect(box!.height).toBeLessThanOrEqual(120);
  });
});

// A phone (touch, 390px) gets the same text sizes as desktop, all on the token scale: nothing scales body
// text up on touch screens (Spectrum's "large" scale did, to 17px).
test.describe('type scale on a phone', () => {
  const TOKEN_PX = new Set([12, 14, 16, 18, 22, 28]);

  async function textSizes(page: Page): Promise<Record<string, number>> {
    return page.evaluate(() => {
      const out: Record<string, number> = {};
      const walker = document.createTreeWalker(document.querySelector('#main') ?? document.body, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const el = n.parentElement;
        if (!el || !n.textContent?.trim() || el.closest('h1, h2, h3, .visually-hidden, code, pre')) continue;
        if (!el.getBoundingClientRect().height) continue;
        const key = `${el.tagName.toLowerCase()}|${n.textContent.trim().slice(0, 40)}`;
        out[key] = parseFloat(getComputedStyle(el).fontSize);
      }
      return out;
    });
  }

  for (const path of ['/', '/pricing', '/gigs']) {
    test(`${path}: body text sizes match desktop and stay on the scale`, async ({ browser, playwright }) => {
      const sizes: Record<string, Record<string, number>> = {};
      for (const [name, opts] of [
        ['desktop', { viewport: { width: 1280, height: 800 } }],
        ['phone', { ...playwright.devices['Pixel 7'], viewport: { width: 390, height: 844 } }],
      ] as const) {
        const context = await browser.newContext(opts);
        const page = await context.newPage();
        await blockAds(page);
        await page.goto(path);
        await page.locator('#main').waitFor();
        sizes[name] = await textSizes(page);
        await context.close();
      }
      const shared = Object.keys(sizes.phone).filter((k) => k in sizes.desktop);
      expect(shared.length).toBeGreaterThan(5);
      const differ = shared.filter((k) => sizes.phone[k] !== sizes.desktop[k]).map((k) => `${k}: ${sizes.desktop[k]} → ${sizes.phone[k]}`);
      expect(differ, 'text that changes size on a phone').toEqual([]);
      const offScale = Object.entries(sizes.phone).filter(([, px]) => !TOKEN_PX.has(px)).map(([k, px]) => `${k}: ${px}px`);
      expect(offScale, 'text off the token scale on a phone').toEqual([]);
    });
  }
});
