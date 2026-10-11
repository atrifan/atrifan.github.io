import { expect, test, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import AxeBuilder from '@axe-core/playwright';
import { openSettled } from '../support/pages';
import { blockThirdParty } from '../e2e/surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';

test.skip(process.env.MARKETPLACE_E2E !== '1', 'marketplace e2e runs via npm run test:e2e:marketplace');

/**
 * axe (wcag2a + wcag2aa, no serious/critical) and no horizontal scroll on the marketplace pages,
 * in the light/dark x desktop/mobile projects. Publish and moderation are scanned as the admin.
 */

const BLOCKING = ['serious', 'critical'];

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
  const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
  ).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Signed-in pages: openSettled waits for the signed-out "Sign in" link, so wait on the h1 instead. */
async function openSignedInSettled(page: Page, path: string) {
  await blockThirdParty(page);
  await setupClerkTestingToken({ page });
  await page.goto(path, { waitUntil: 'load' });
  await page.locator('#main').waitFor({ state: 'visible' });
  await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

const PUBLIC_PAGES = [
  '/marketplace',
  '/marketplace?kind=skill&sort=top',
  '/marketplace?q=zzzz-no-match',
  '/marketplace/fx-github-mcp',
  '/marketplace/fx-pdf-skill',
];

for (const path of PUBLIC_PAGES) {
  test(`${path} has no serious or critical axe violations`, async ({ page }) => {
    await openSettled(page, path);
    await expectNoBlockingViolations(page);
  });

  test(`${path} has no horizontal scroll`, async ({ page }) => {
    await openSettled(page, path);
    await expectNoHorizontalScroll(page);
  });
}

test('/marketplace with the Filters dialog open has no serious or critical axe violations', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('mobile'), 'the Filters dialog is mobile only');
  await openSettled(page, '/marketplace');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  await page.waitForTimeout(300);
  await expectNoBlockingViolations(page);
  await expectNoHorizontalScroll(page);
});

test.describe('admin', () => {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('admin') });

  for (const path of ['/marketplace/publish', '/marketplace/admin']) {
    test(`${path} has no serious or critical axe violations`, async ({ page }) => {
      await openSignedInSettled(page, path);
      await expectNoBlockingViolations(page);
    });

    test(`${path} has no horizontal scroll`, async ({ page }) => {
      await openSignedInSettled(page, path);
      await expectNoHorizontalScroll(page);
    });
  }
});
