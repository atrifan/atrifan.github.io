import { expect, test, type Locator, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { AD_SLOT, blockThirdParty } from './surface-helpers';
import { userButton } from './hub-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

test.skip(process.env.ADMIN_HOME_E2E !== '1', 'admin home e2e runs via npm run test:e2e:marketplace');

/**
 * Admin home contract: GET /admin (admins only) with one card per admin area, an "Admin"
 * entry in the shell for admins, and an "Admin" back link on every admin sub-page.
 * Numbers come from the freshly seeded throwaway DB.
 */

/** An href whose path ends with `path` (relative or absolute, any query/hash). */
const hrefEndingWith = (path: string) => new RegExp(`${path.replace(/[/.]/g, '\\$&')}/?(?:[?#].*)?$`);

const MCP_URL = /^https?:\/\/\S+\/api\/admin\/qa\/mcp$/;

const AREAS = [
  { title: 'QA queue', href: '/admin/qa', value: '2' },
  { title: 'Disputes', href: '/admin/disputes', value: '2' },
  { title: 'Inbox', href: '/admin/inbox', value: '3' },
  { title: 'Marketplace moderation', href: '/marketplace/admin', value: '1' },
  { title: 'Activity', href: '/admin/activity', value: '€90.00' },
] as const;

const SUB_PAGES = ['/admin/qa', '/admin/disputes', '/admin/inbox', '/admin/activity', '/marketplace/admin'] as const;

const card = (page: Page, name: string): Locator => page.getByRole('article', { name, exact: true });
const adminHeading = (page: Page): Locator => page.getByRole('heading', { level: 1, name: 'Admin', exact: true });

async function openUserMenu(page: Page): Promise<void> {
  await page.goto('/');
  await userButton(page.getByRole('banner')).click({ timeout: 30_000 });
  await expect(page.getByRole('menuitem', { name: 'Profile', exact: true })).toBeVisible({ timeout: 30_000 });
}

async function openMenuPanel(page: Page): Promise<Locator> {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.click();
  const controls = await menu.getAttribute('aria-controls');
  expect(controls, 'Menu button has aria-controls').toBeTruthy();
  const panel = page.locator(`[id="${controls}"]`);
  await expect(panel).toBeVisible();
  return panel;
}

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
  // Lets Clerk refresh the saved session (60s tokens) past bot protection.
  if (hasClerkTestEnv()) await setupClerkTestingToken({ page });
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/admin redirects to sign-in with no admin cards', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(adminHeading(page)).toHaveCount(0);
    for (const { title } of AREAS) await expect(card(page, title)).toHaveCount(0);
    await expect(card(page, 'Admin QA MCP')).toHaveCount(0);
  });

  test('home page has no "Admin" link or menu item', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Admin', exact: true })).toHaveCount(0);
  });
});

test.describe('customer', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('customer') });

  test('/admin is a 404 with no Admin heading', async ({ page }) => {
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(404);
    await expect(adminHeading(page)).toHaveCount(0);
  });

  test('user menu has Profile but no Admin entry', async ({ page }) => {
    await openUserMenu(page);
    await expect(page.getByRole('menuitem', { name: 'Admin', exact: true })).toHaveCount(0);
  });

  test.describe('phone 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Menu panel has no Admin link', async ({ page }) => {
      const panel = await openMenuPanel(page);
      await expect(userButton(panel)).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
    });
  });
});

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  test('/admin renders the admin home, noindex, no ads', async ({ page }) => {
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(200);
    await expect(adminHeading(page)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator(AD_SLOT)).toHaveCount(0);
  });

  for (const { title, href, value } of AREAS) {
    test(`"${title}" card links to ${href} and shows ${value}`, async ({ page }) => {
      await page.goto('/admin');
      const c = card(page, title);
      await expect(c).toBeVisible();
      await expect(c.getByRole('link', { name: title, exact: true })).toHaveAttribute('href', hrefEndingWith(href));
      await expect(c.getByText(value, { exact: true })).toBeVisible();
    });
  }

  test('"Admin QA MCP" card shows the MCP URL, a copy button and a docs link', async ({ page }) => {
    await page.goto('/admin');
    const c = card(page, 'Admin QA MCP');
    await expect(c).toBeVisible();
    await expect(c.getByText(MCP_URL).first()).toBeVisible();
    await expect(c.getByRole('button', { name: 'Copy MCP URL', exact: true })).toBeVisible();
    await expect(c.getByRole('link', { name: 'Admin QA MCP docs', exact: true })).toHaveAttribute(
      'href',
      hrefEndingWith('/gigs/docs/admin-qa'),
    );
  });

  test('"Copy MCP URL" copies the shown URL and says Copied', async ({ page, context, baseURL }) => {
    expect(baseURL, 'baseURL is configured').toBeTruthy();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL!).origin });
    await page.goto('/admin');
    const c = card(page, 'Admin QA MCP');
    const urlText = c.getByText(MCP_URL).first();
    await expect(urlText).toBeVisible();
    const shown = (await urlText.textContent())?.trim() ?? '';
    expect(shown).toMatch(MCP_URL);

    await c.getByRole('button', { name: 'Copy MCP URL', exact: true }).click();
    await expect(c.getByRole('button', { name: 'Copied' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
  });

  test('user menu has Admin next to Profile and Credits, and it opens /admin', async ({ page }) => {
    await openUserMenu(page);
    await expect(page.getByRole('menuitem', { name: 'Credits', exact: true })).toBeVisible();
    const admin = page.getByRole('menuitem', { name: 'Admin', exact: true });
    await expect(admin).toBeVisible({ timeout: 30_000 });
    await admin.click();
    await expect(page).toHaveURL(hrefEndingWith('/admin'));
    await expect(adminHeading(page)).toBeVisible();
  });

  for (const path of SUB_PAGES) {
    test(`${path} has an "Admin" sub-nav linking back to /admin`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
      const nav = page.getByRole('navigation', { name: 'Admin', exact: true });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('href', hrefEndingWith('/admin'));
    });
  }

  test.describe('phone 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Menu panel has an Admin link to /admin', async ({ page }) => {
      const panel = await openMenuPanel(page);
      const link = panel.getByRole('link', { name: 'Admin', exact: true });
      await expect(link).toBeVisible({ timeout: 30_000 });
      await expect(link).toHaveAttribute('href', hrefEndingWith('/admin'));
    });
  });
});
