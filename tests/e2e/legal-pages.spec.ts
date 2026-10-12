import { test, expect, type Page } from '@playwright/test';
import { blockThirdParty } from './surface-helpers';
import {
  CONTACT_EMAIL,
  IUBENDA_COOKIES,
  IUBENDA_PRIVACY,
  JOBS_AUTO_ACCEPT_DAYS,
  JOBS_POST_ACCEPT_CLAIM_DAYS,
  LEGAL_DATE,
  LEGAL_DOCS,
  LEGAL_PAGES,
  LEGAL_VERSION,
  MARKETPLACE_COMMISSION_PERCENT,
  PLACEHOLDER,
  canonicalHref,
} from '../support/legal';

/**
 * Hub legal pages (/legal and its seven documents) and the legal footer, from the behaviour
 * contract only. Main run, path-prefix mode on :3000 with LEGAL_CONTACT_EMAIL=support@tulzo.online
 * and the gigs/marketplace day and commission settings at their defaults.
 */

async function open(page: Page, path: string): Promise<void> {
  await blockThirdParty(page);
  const res = await page.goto(path);
  expect(res?.status(), `${path} status`).toBe(200);
  await page.locator('#main').waitFor({ state: 'visible' });
}

const main = (page: Page) => page.locator('#main');
const docsNav = (page: Page) => page.getByRole('navigation', { name: 'Legal documents', exact: true });
const tocNav = (page: Page) => page.getByRole('navigation', { name: 'On this page', exact: true });
const footerLegal = (page: Page) => page.getByRole('contentinfo').getByRole('navigation', { name: 'Legal', exact: true });

// ---------------------------------------------------------------------------
// every page: h1, canonical, sitemap, no placeholders

test.describe('legal pages: heading, canonical, sitemap', () => {
  for (const { path, h1 } of LEGAL_PAGES) {
    test(`${path}: h1 "${h1}"`, async ({ page }) => {
      await open(page, path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    });

    test(`${path}: canonical ends with ${path} and the page is indexable`, async ({ page }) => {
      await open(page, path);
      const href = await canonicalHref(page);
      expect(href, 'canonical link').not.toBeNull();
      expect(new URL(href!, page.url()).pathname).toBe(path);
      const robots = await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((e) => e.getAttribute('content') ?? '').join(','));
      expect(robots).not.toMatch(/noindex/i);
    });

    test(`${path}: no bracketed placeholder text in main`, async ({ page }) => {
      await open(page, path);
      const text = await main(page).innerText();
      expect(text.match(PLACEHOLDER)?.[0] ?? null, 'placeholder left in the page').toBeNull();
    });
  }

  test('/sitemap.xml lists every legal page', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1].trim()).pathname);
    for (const { path } of LEGAL_PAGES) expect(locs, `sitemap has ${path}`).toContain(path);
  });
});

// ---------------------------------------------------------------------------
// /legal index

test.describe('/legal index', () => {
  test('links to each document by its h1, plus the iubenda privacy and cookie policies', async ({ page }) => {
    await open(page, '/legal');
    for (const { path, h1 } of LEGAL_DOCS) {
      const link = main(page).getByRole('link', { name: h1, exact: true });
      await expect(link, h1).toHaveCount(1);
      expect(new URL((await link.getAttribute('href'))!, page.url()).pathname).toBe(path);
    }
    await expect(main(page).getByRole('link', { name: 'Privacy policy', exact: true })).toHaveAttribute('href', IUBENDA_PRIVACY);
    await expect(main(page).getByRole('link', { name: 'Cookie policy', exact: true })).toHaveAttribute('href', IUBENDA_COOKIES);
  });
});

// ---------------------------------------------------------------------------
// shared document layout

test.describe('legal documents: shared layout', () => {
  for (const { path, h1 } of LEGAL_DOCS) {
    test(`${path}: "Legal documents" nav links all seven, current one marked`, async ({ page }) => {
      await open(page, path);
      const nav = docsNav(page);
      await expect(nav).toBeVisible();
      for (const doc of LEGAL_DOCS) {
        const link = nav.getByRole('link', { name: doc.h1, exact: true });
        await expect(link, doc.h1).toHaveCount(1);
        expect(new URL((await link.getAttribute('href'))!, page.url()).pathname).toBe(doc.path);
        if (doc.path === path) await expect(link).toHaveAttribute('aria-current', 'page');
        else await expect(link).not.toHaveAttribute('aria-current', 'page');
      }
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(h1);
    });

    test(`${path}: version and last-updated line`, async ({ page }) => {
      await open(page, path);
      await expect(main(page)).toContainText(`Version ${LEGAL_VERSION}`);
      await expect(main(page)).toContainText(`Last updated ${LEGAL_DATE}`);
    });

    test(`${path}: a "Summary" region`, async ({ page }) => {
      await open(page, path);
      const summary = page.getByRole('region', { name: 'Summary', exact: true });
      await expect(summary).toHaveCount(1);
      await expect(summary).toBeVisible();
      expect((await summary.innerText()).trim().length).toBeGreaterThan(20);
    });

    test(`${path}: "On this page" links resolve to h2 ids`, async ({ page }) => {
      await open(page, path);
      const nav = tocNav(page);
      await expect(nav).toBeVisible();
      const hrefs = await nav.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
      expect(hrefs.length, 'table of contents entries').toBeGreaterThanOrEqual(2);
      for (const href of hrefs) {
        expect(href, 'in-page anchor').toMatch(/^#[\w-]+$/);
        const id = href.slice(1);
        await expect(main(page).locator(`h2[id="${id}"]`), `h2#${id}`).toHaveCount(1);
      }
      // Every h2 section with an id is listed.
      const h2Ids = await main(page)
        .locator('h2[id]')
        .evaluateAll((els) => els.map((e) => `#${e.id}`));
      for (const id of h2Ids) expect(hrefs, `toc lists ${id}`).toContain(id);

      const last = hrefs[hrefs.length - 1];
      await nav.locator(`a[href="${last}"]`).click();
      await expect(page).toHaveURL(new RegExp(`${last}$`));
      await expect(main(page).locator(`h2[id="${last.slice(1)}"]`)).toBeInViewport();
    });
  }

  test('/legal/terms also shows "Effective 12 October 2026"', async ({ page }) => {
    await open(page, '/legal/terms');
    await expect(main(page)).toContainText(`Effective ${LEGAL_DATE}`);
  });

  test('at 390px the nav is replaced by a "Legal document" select that navigates', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, '/legal/terms');
    await expect(docsNav(page)).toBeHidden();
    const select = page.getByRole('combobox', { name: 'Legal document', exact: true });
    await expect(select).toBeVisible();
    for (const doc of LEGAL_DOCS) {
      await expect(select.locator('option', { hasText: doc.h1 }), doc.h1).toHaveCount(1);
    }
    await select.selectOption({ label: 'Imprint' });
    await expect(page).toHaveURL(/\/legal\/imprint$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Imprint');
  });

  test('at 1280px the "Legal document" select is not shown', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '/legal/payments');
    await expect(docsNav(page)).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Legal document', exact: true })).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// document content

test.describe('legal documents: content', () => {
  test('/legal/payments summary: credits not refundable, gigs dispute and claim windows', async ({ page }) => {
    await open(page, '/legal/payments');
    const summary = page.getByRole('region', { name: 'Summary', exact: true });
    await expect(summary).toContainText("Credits can't be refunded");
    await expect(summary).toContainText(
      `Gigs: dispute within ${JOBS_AUTO_ACCEPT_DAYS} days of delivery, claim within ${JOBS_POST_ACCEPT_CLAIM_DAYS} days of acceptance`,
    );
  });

  test('/legal/payments mentions the commission and the 48 hours reminder', async ({ page }) => {
    await open(page, '/legal/payments');
    await expect(main(page)).toContainText(`${MARKETPLACE_COMMISSION_PERCENT}%`);
    await expect(main(page)).toContainText('48 hours');
  });

  test('/legal/terms has a #withdrawal section', async ({ page }) => {
    await open(page, '/legal/terms');
    const h2 = main(page).locator('h2#withdrawal');
    await expect(h2).toHaveCount(1);
    await expect(h2).toContainText(/withdrawal/i);
    await expect(tocNav(page).locator('a[href="#withdrawal"]')).toHaveCount(1);
  });

  for (const path of ['/legal/imprint', '/legal/complaints', '/legal/terms', '/legal/payments']) {
    test(`${path} shows a mailto:${CONTACT_EMAIL} link`, async ({ page }) => {
      await open(page, path);
      await expect(main(page).locator(`a[href="mailto:${CONTACT_EMAIL}"]`).first()).toBeVisible();
    });
  }

  test('/legal/imprint shows "Tulzo"', async ({ page }) => {
    await open(page, '/legal/imprint');
    await expect(main(page)).toContainText('Tulzo');
  });
});

// ---------------------------------------------------------------------------
// footer, every page

const FOOTER_LINKS: Array<{ name: string; path?: string; href?: string }> = [
  { name: 'Terms', path: '/legal/terms' },
  { name: 'Payments & refunds', path: '/legal/payments' },
  { name: 'Disclaimers', path: '/legal/disclaimers' },
  { name: 'Complaints', path: '/legal/complaints' },
  { name: 'Imprint', path: '/legal/imprint' },
  { name: 'Privacy', href: IUBENDA_PRIVACY },
  { name: 'Cookies', href: IUBENDA_COOKIES },
];

test.describe('footer legal links', () => {
  for (const path of ['/', '/pricing', '/docs', '/legal', '/legal/terms', '/legal/complaints']) {
    test(`${path}: footer "Legal" nav has the legal links and "Cookie settings"`, async ({ page }) => {
      await open(page, path);
      const nav = footerLegal(page);
      await expect(nav).toHaveCount(1);
      for (const { name, path: to, href } of FOOTER_LINKS) {
        const link = nav.getByRole('link', { name, exact: true });
        await expect(link, name).toHaveCount(1);
        const actual = (await link.getAttribute('href'))!;
        if (to) expect(new URL(actual, page.url()).pathname, name).toBe(to);
        else expect(actual, name).toBe(href);
      }
      await expect(page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings', exact: true })).toHaveCount(1);
    });

    test(`${path}: no link to the iubenda terms and conditions`, async ({ page }) => {
      await open(page, path);
      await expect(page.locator('a[href*="iubenda.com/terms-and-conditions"]')).toHaveCount(0);
    });

    test(`${path}: no horizontal scroll at 390px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  for (const doc of LEGAL_DOCS.filter((d) => !['/legal/terms', '/legal/complaints'].includes(d.path))) {
    test(`${doc.path}: no horizontal scroll at 390px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, doc.path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test('footer "Terms" goes to /legal/terms', async ({ page }) => {
    await open(page, '/');
    await footerLegal(page).getByRole('link', { name: 'Terms', exact: true }).click();
    await expect(page).toHaveURL(/\/legal\/terms$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Terms and conditions');
  });
});
