import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { blockThirdParty } from './surface-helpers';

/**
 * Theme contract (:3000): a "Theme" radio group (Light / Dark / System),
 * persisted in localStorage["tulzo-theme"], applied as <html data-theme>,
 * with no flash of the wrong theme on load.
 */

type Scheme = 'light' | 'dark';
const PAGES = ['/', '/pricing'];
const STORAGE_KEY = 'tulzo-theme';

async function newContext(browser: Browser, colorScheme: Scheme): Promise<BrowserContext> {
  const use = test.info().project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: { width: 1280, height: 800 },
    colorScheme,
  });
  await blockThirdParty(context);
  return context;
}

function themeGroup(page: Page) {
  return page.getByRole('radiogroup', { name: 'Theme' });
}
function themeRadio(page: Page, name: 'Light' | 'Dark' | 'System') {
  return themeGroup(page).getByRole('radio', { name, exact: true });
}
async function choose(page: Page, name: 'Light' | 'Dark' | 'System') {
  const radio = themeRadio(page, name);
  await expect(radio).toBeVisible();
  // Click where a user would: the centre of the radio's box, whatever is drawn on top of it.
  const box = await radio.boundingBox();
  expect(box, `${name} radio has a box`).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(radio, `clicking ${name} selects it`).toBeChecked();
}
const dataTheme = (page: Page) => page.locator('html');
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

/** WCAG contrast of body text against the effective page background, colours resolved via canvas. */
function bodyContrast(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const paint = (colors: string[]) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
      for (const c of colors) {
        ctx.fillStyle = '#ffffff';
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
      }
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    };
    const lum = ([r, g, b]: number[]) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const text = getComputedStyle(document.body).color;
    const bg = paint([htmlBg, bodyBg]);
    const fg = paint([htmlBg, bodyBg, text]);
    const [hi, lo] = [lum(bg), lum(fg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
  });
}

for (const path of PAGES) {
  test.describe(`theme on ${path}`, () => {
    test('header has a "Theme" radio group with Light, Dark, System and exactly one checked', async ({
      browser,
    }) => {
      const context = await newContext(browser, 'light');
      const page = await context.newPage();
      await page.goto(path);
      const group = themeGroup(page);
      await expect(page.getByRole('banner').getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
      const radios = group.getByRole('radio');
      await expect(radios).toHaveCount(3);
      for (const name of ['Light', 'Dark', 'System'] as const) {
        await expect(themeRadio(page, name)).toBeVisible();
      }
      await expect(group.getByRole('radio', { checked: true })).toHaveCount(1);
      await context.close();
    });

    for (const scheme of ['dark', 'light'] as const) {
      test(`fresh visit with colorScheme ${scheme}: System checked and data-theme="${scheme}"`, async ({
        browser,
      }) => {
        const context = await newContext(browser, scheme);
        const page = await context.newPage();
        await page.goto(path);
        await expect(themeRadio(page, 'System')).toBeChecked();
        await expect(dataTheme(page)).toHaveAttribute('data-theme', scheme);
        await context.close();
      });
    }

    const choices = [
      { option: 'Dark', value: 'dark', scheme: 'light' },
      { option: 'Light', value: 'light', scheme: 'dark' },
    ] as const;
    for (const { option, value, scheme } of choices) {
      test(`choosing ${option} persists across reload against colorScheme ${scheme}`, async ({ browser }) => {
        const context = await newContext(browser, scheme);
        const page = await context.newPage();
        await page.goto(path);
        await choose(page, option);
        await expect(dataTheme(page)).toHaveAttribute('data-theme', value);
        expect(await stored(page)).toBe(value);

        await page.reload();
        await expect(dataTheme(page)).toHaveAttribute('data-theme', value);
        await expect(themeRadio(page, option)).toBeChecked();
        await context.close();
      });
    }

    test('choosing System again stores "system" (or clears) and follows colorScheme', async ({ browser }) => {
      const context = await newContext(browser, 'light');
      const page = await context.newPage();
      await page.goto(path);
      await choose(page, 'Dark');
      await expect(dataTheme(page)).toHaveAttribute('data-theme', 'dark');

      await choose(page, 'System');
      await expect(dataTheme(page)).toHaveAttribute('data-theme', 'light');
      expect([null, 'system']).toContain(await stored(page));

      await page.reload();
      await expect(themeRadio(page, 'System')).toBeChecked();
      await expect(dataTheme(page)).toHaveAttribute('data-theme', 'light');
      await context.close();
    });

    test('no flash: stored "dark" is applied by DOMContentLoaded under a light colorScheme', async ({
      browser,
    }) => {
      const context = await newContext(browser, 'light');
      await context.addInitScript((key) => localStorage.setItem(key, 'dark'), STORAGE_KEY);
      const page = await context.newPage();
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const attr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(attr).toBe('dark');
      await context.close();
    });

    test('radios are keyboard operable with arrow keys', async ({ browser }) => {
      const context = await newContext(browser, 'dark');
      const page = await context.newPage();
      await page.goto(path);
      await choose(page, 'Light');
      await expect(dataTheme(page)).toHaveAttribute('data-theme', 'light');

      await themeRadio(page, 'Light').focus();
      await page.keyboard.press('ArrowRight');
      await expect(themeRadio(page, 'Dark')).toBeChecked();
      await expect(dataTheme(page)).toHaveAttribute('data-theme', 'dark');

      await page.keyboard.press('ArrowLeft');
      await expect(themeRadio(page, 'Light')).toBeChecked();
      await expect(dataTheme(page)).toHaveAttribute('data-theme', 'light');

      await page.keyboard.press('ArrowDown');
      await expect(themeRadio(page, 'Dark')).toBeChecked();
      await expect(dataTheme(page)).toHaveAttribute('data-theme', 'dark');
      await context.close();
    });

    for (const theme of ['light', 'dark'] as const) {
      test(`body text contrast is >= 4.5 in the ${theme} theme`, async ({ browser }) => {
        const context = await newContext(browser, theme);
        const page = await context.newPage();
        await page.goto(path);
        await expect(dataTheme(page)).toHaveAttribute('data-theme', theme);
        const ratio = await bodyContrast(page);
        expect(ratio).toBeGreaterThanOrEqual(4.5);
        await context.close();
      });
    }
  });
}

test.describe('theme on mobile (390x844)', () => {
  test('the Theme radio group lives inside the Menu', async ({ browser }) => {
    const use = test.info().project.use;
    const context = await browser.newContext({
      baseURL: use.baseURL,
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      colorScheme: 'light',
    });
    await blockThirdParty(context);
    const page = await context.newPage();
    await page.goto('/');
    await expect(themeGroup(page)).toBeHidden();
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await expect(menu).toBeVisible();
    await menu.click();
    const panel = page.locator(`[id="${await menu.getAttribute('aria-controls')}"]`);
    await expect(panel.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    const dark = panel.getByRole('radio', { name: 'Dark', exact: true });
    await expect(dark).toBeVisible();
    const box = await dark.boundingBox();
    expect(box, 'Dark radio has a box').not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(dark).toBeChecked();
    await expect(dataTheme(page)).toHaveAttribute('data-theme', 'dark');
    await context.close();
  });
});
