import type { Page } from '@playwright/test';
import { AI_PAGES, aiPage, expect, fakeDevice, openAi, signedIn, test } from '../support/ai-fixtures';

/**
 * Screenshots of every ai page in the four themed projects: mock bridge connected,
 * mocked server endpoints, frozen clock. Plus the not-connected Secrets page and an
 * empty Schedules page.
 */

async function shoot(page: Page, name: string) {
  await expect(page.getByText('Loading…')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true, mask: [page.locator('.cl-userButtonBox')] });
}

test.describe('ai panel visual', () => {
  signedIn();

  for (const p of AI_PAGES) {
    test(`${p.name} (${p.path})`, async ({ page, bridge }) => {
      await bridge.install({ handlers: fakeDevice() });
      await openAi(page, p.path);
      await expect(page.getByText(p.ready, { exact: true }).first()).toBeVisible();
      await shoot(page, p.name);
    });
  }

  test('secrets-disconnected', async ({ page }) => {
    await openAi(page, aiPage('secrets').path);
    await expect(page.getByRole('heading', { name: 'Connect the extension', exact: true })).toBeVisible();
    await shoot(page, 'secrets-disconnected');
  });

  test('schedules-empty', async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice({ empty: true }) });
    await openAi(page, aiPage('schedules').path);
    await expect(page.getByText('No schedules yet.', { exact: true })).toBeVisible();
    await shoot(page, 'schedules-empty');
  });
});
