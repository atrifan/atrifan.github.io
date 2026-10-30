import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { blockThirdParty } from './surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

/**
 * Shell footer contract: every page has one main and one contentinfo landmark. Content shorter than the
 * viewport: the footer's bottom edge is the viewport bottom (no bare page background under it). Content
 * longer than the viewport: the footer follows the main content (no overlap) and ends the document. The
 * footer is in the flow (not fixed/sticky). The chat fills the viewport without page scroll and keeps its
 * composer at the bottom of the screen.
 */

type Metrics = {
  innerHeight: number;
  scrollHeight: number;
  footerTop: number;
  footerBottom: number;
  mainBottom: number;
  position: string;
};

/** Footer and main edges in document coordinates. */
async function measure(page: Page): Promise<Metrics> {
  return page.evaluate(() => {
    const footer = document.querySelector('footer, [role="contentinfo"]') as HTMLElement;
    const main = document.querySelector('main, [role="main"]') as HTMLElement;
    const f = footer.getBoundingClientRect();
    const m = main.getBoundingClientRect();
    return {
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      footerTop: f.top + window.scrollY,
      footerBottom: f.bottom + window.scrollY,
      mainBottom: m.bottom + window.scrollY,
      position: getComputedStyle(footer).position,
    };
  });
}

async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'load' });
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/** The footer sits flush with the bottom of the viewport on a page with less content than the screen. */
async function expectFooterAtViewportBottom(page: Page) {
  const m = await measure(page);
  const ctx = JSON.stringify(m);
  expect(m.scrollHeight, `document is not taller than the viewport: ${ctx}`).toBeLessThanOrEqual(m.innerHeight);
  expect(Math.abs(m.footerBottom - m.innerHeight), `footer bottom == viewport bottom: ${ctx}`).toBeLessThanOrEqual(1);
  expect(m.footerTop, `footer after main: ${ctx}`).toBeGreaterThanOrEqual(m.mainBottom - 1);
  expect(['fixed', 'sticky']).not.toContain(m.position);
}

/** Long page: the footer follows main, ends the document, and scrolls with it. */
async function expectFooterAfterContent(page: Page) {
  const top = await measure(page);
  const ctx = JSON.stringify(top);
  expect(top.scrollHeight, `page is longer than the viewport: ${ctx}`).toBeGreaterThan(top.innerHeight);
  expect(top.footerTop, `footer after main: ${ctx}`).toBeGreaterThanOrEqual(top.mainBottom - 1);
  expect(['fixed', 'sticky']).not.toContain(top.position);
  const footerViewportTopBefore = await page.getByRole('contentinfo').evaluate((el) => el.getBoundingClientRect().top);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const end = await measure(page);
  expect(Math.abs(end.footerBottom - end.scrollHeight), `footer ends the document: ${JSON.stringify(end)}`).toBeLessThanOrEqual(1);
  const footerViewportTopAfter = await page.getByRole('contentinfo').evaluate((el) => el.getBoundingClientRect().top);
  expect(footerViewportTopAfter, 'the footer moves when the page scrolls').toBeLessThan(footerViewportTopBefore - 1);
  // Scrolled to the end, the footer's bottom is the viewport's bottom.
  const viewportBottom = await page.getByRole('contentinfo').evaluate((el) => el.getBoundingClientRect().bottom);
  expect(Math.abs(viewportBottom - end.innerHeight)).toBeLessThanOrEqual(1);
}

/**
 * `short`: pages whose content is genuinely shorter than that viewport (document == viewport height).
 * `any`: the general rule footer.bottom == max(viewport, document) bottom. At 390x844 no public page is
 * shorter than the screen (the 404 is ~900px with the stacked footer), so only the general rule applies there.
 */
const SHORT: Array<{ viewport: { width: number; height: number }; short: string[]; any: string[] }> = [
  { viewport: { width: 1280, height: 800 }, short: ['/legal/no-such-page'], any: ['/gigs', '/sign-in'] },
  { viewport: { width: 390, height: 844 }, short: [], any: ['/legal/no-such-page', '/gigs/no-such', '/sign-in'] },
  { viewport: { width: 2000, height: 1200 }, short: ['/legal/no-such-page', '/gigs', '/sign-in', '/docs'], any: ['/legal/imprint'] },
];

/** General rule: the footer ends at max(viewport, document) and follows main. */
async function expectFooterAtEnd(page: Page) {
  const m = await measure(page);
  const ctx = JSON.stringify(m);
  expect(Math.abs(m.footerBottom - Math.max(m.innerHeight, m.scrollHeight)), `footer bottom == max(viewport, document): ${ctx}`).toBeLessThanOrEqual(1);
  expect(m.footerTop, `footer after main: ${ctx}`).toBeGreaterThanOrEqual(m.mainBottom - 1);
  expect(['fixed', 'sticky']).not.toContain(m.position);
}

const LONG_VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const { viewport, short, any } of SHORT) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport });
      for (const path of short) {
        test(`short page ${path}: footer bottom is the viewport bottom`, async ({ page }) => {
          await open(page, path);
          await expectFooterAtViewportBottom(page);
        });
      }
      for (const path of any) {
        test(`${path}: footer bottom is max(viewport, document) bottom`, async ({ page }) => {
          await open(page, path);
          await expectFooterAtEnd(page);
        });
      }
    });
  }

  for (const viewport of LONG_VIEWPORTS) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport });
      test('long page /legal/terms: footer follows main, ends the document and scrolls', async ({ page }) => {
        await open(page, '/legal/terms');
        await expectFooterAfterContent(page);
      });
    });
  }
});

test.describe('admin /admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  for (const viewport of [{ width: 1280, height: 800 }, { width: 2000, height: 1200 }]) {
    test.describe(`${viewport.width}x${viewport.height}`, () => {
      test.use({ viewport });
      test('footer bottom is max(viewport, document) bottom, after main', async ({ page }) => {
        await setupClerkTestingToken({ page });
        await open(page, '/admin');
        await expect(page.getByRole('heading', { level: 1, name: 'Admin', exact: true })).toBeVisible({ timeout: 30_000 });
        await expectFooterAtEnd(page);
      });
    });
  }
});
