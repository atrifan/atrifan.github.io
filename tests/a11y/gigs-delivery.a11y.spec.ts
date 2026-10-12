import { expect, test } from '@playwright/test';
import { expectNoBlockingAxe, expectNoHorizontalScroll, isMobileProject, openGigs, projectTag, signIn } from '../support/gigs-ui';
import { PAGE_STATES, PHASE5_ENV_MISSING, deliveryUrl, seedPageState } from '../support/gigs-delivery';

/**
 * axe (wcag2a + wcag2aa, fails on serious/critical) on the delivery page
 * `/gigs/contracts/{id}/delivery` in its main states, in light/dark x desktop/mobile.
 * No horizontal scroll at 390px. Runs under `npm run test:e2e:gigs`.
 */

test.skip(PHASE5_ENV_MISSING, 'gigs QA e2e env not set');

const word = (tag: string) => `zqdla${tag}`;

for (const { state, name, heading, text } of PAGE_STATES) {
  test(`delivery page, ${name}: no serious or critical axe violations`, async ({ page, context, request }, testInfo) => {
    test.setTimeout(120_000);
    const { viewer, contractId } = await seedPageState(request, state, word(projectTag(testInfo)));
    await signIn(context, viewer);
    await openGigs(page, deliveryUrl(contractId), { signedIn: true });
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    await expect(page.locator('#main')).toContainText(text);
    await expectNoBlockingAxe(page);
    if (isMobileProject(testInfo)) await expectNoHorizontalScroll(page);
  });
}

test('delivery page, dispute form open: no serious or critical axe violations', async ({ page, context, request }, testInfo) => {
  test.setTimeout(120_000);
  const { viewer, contractId } = await seedPageState(request, 'ready', word(projectTag(testInfo)));
  await signIn(context, viewer);
  await openGigs(page, deliveryUrl(contractId), { signedIn: true });
  await page.getByRole('button', { name: 'Open a dispute' }).click();
  await expect(page.getByRole('combobox', { name: 'What went wrong' })).toBeVisible();
  await expectNoBlockingAxe(page);
  if (isMobileProject(testInfo)) await expectNoHorizontalScroll(page);
});
