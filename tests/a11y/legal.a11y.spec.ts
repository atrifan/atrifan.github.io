import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openSettled } from '../support/pages';
import { LEGAL_PAGES } from '../support/legal';

/**
 * axe (wcag2a + wcag2aa) on the legal pages and on the complaints form with its validation
 * errors showing, in both themes and both viewports. Fails on serious or critical issues.
 */
const BLOCKING = ['serious', 'critical'];

async function expectNoBlocking(page: Page): Promise<void> {
  // Clerk's dev-instance footer ("Secured by Clerk" logo link) is third-party chrome we can't label.
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
  const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
  ).toEqual([]);
}

for (const { path, name, h1 } of LEGAL_PAGES) {
  test(`${name} (${path}) has no serious or critical axe violations`, async ({ page }) => {
    await openSettled(page, path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    await expectNoBlocking(page);
  });

  test(`${name} (${path}) has no horizontal scroll`, async ({ page }) => {
    await openSettled(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('complaints form with validation errors has no serious or critical axe violations', async ({ page }) => {
  await page.route((url) => url.pathname === '/api/legal/complaints', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"not mocked"}' }),
  );
  await openSettled(page, '/legal/complaints');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Enter your name.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption({ label: 'Illegal content notice' });
  await expectNoBlocking(page);
});
