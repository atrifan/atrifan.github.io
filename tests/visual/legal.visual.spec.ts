import { expect, test } from '@playwright/test';
import { openSettled } from '../support/pages';

/**
 * Visual baselines for the legal documents with the most layout (summary box, table of contents,
 * document nav or mobile select, the complaints form) in the light/dark x desktop/mobile projects.
 * Snapshots: tests/visual/legal.visual.spec.ts-snapshots/<name>-<project>-<platform>.png.
 * /pricing (refund FAQ) and /credits (consent) are covered by pages.visual and hub.visual.
 *
 * Masked: the ad slot and Clerk's widgets.
 */
const PAGES = [
  { path: '/legal/payments', name: 'legal-payments' },
  { path: '/legal/terms', name: 'legal-terms' },
  { path: '/legal/complaints', name: 'legal-complaints' },
] as const;

for (const { path, name } of PAGES) {
  test(`${name} (${path})`, async ({ page }) => {
    await openSettled(page, path);
    await expect(page).toHaveScreenshot(`${name}.png`, {
      fullPage: true,
      mask: [page.locator('[data-ad-slot]'), page.locator('.cl-footer'), page.locator('.cl-userButtonBox')],
    });
  });
}

test('pricing FAQ with "Can I get a refund?" open', async ({ page }) => {
  await openSettled(page, '/pricing');
  const faq = page.locator('details', { has: page.getByText('Can I get a refund?', { exact: true }) });
  await faq.locator('summary').click();
  await expect(faq).toHaveAttribute('open', '');
  await expect(faq).toHaveScreenshot('pricing-faq-refund.png');
});
