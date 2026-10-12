import { expect, test, type Page } from '@playwright/test';
import { openGigs, projectTag, signInWithHeader as signIn } from '../support/gigs-ui';
import { PAGE_STATES, PHASE5_ENV_MISSING, deliveryMasks, deliveryUrl, seedPageState } from '../support/gigs-delivery';

/**
 * Visual baselines for the delivery page `/gigs/contracts/{id}/delivery` (locked, ready,
 * provider view, accepted with the review form, disputed) in light/dark x desktop/mobile.
 * Titles use a fixed per-project word; SHAs, dates, table cells and ids are masked, as are
 * ad slots and Clerk widgets. Runs under `npm run test:e2e:gigs`.
 */

test.skip(PHASE5_ENV_MISSING, 'gigs QA e2e env not set');

const word = (tag: string) => `zqdlv${tag}`;

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot(name, { fullPage: true, mask: deliveryMasks(page) });
}

for (const { state, name, heading, text } of PAGE_STATES) {
  test(`delivery page, ${name}`, async ({ page, context, request }, testInfo) => {
    test.setTimeout(120_000);
    const { viewer, contractId } = await seedPageState(request, state, word(projectTag(testInfo)));
    await signIn(context, viewer);
    await openGigs(page, deliveryUrl(contractId), { signedIn: true });
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await expect(page.locator('#main')).toContainText(text);
    await shot(page, `gigs-delivery-${state}.png`);
  });
}
