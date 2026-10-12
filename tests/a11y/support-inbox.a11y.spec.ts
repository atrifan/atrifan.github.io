import { expect, test } from '@playwright/test';
import { ADMIN_USER, expectNoBlockingAxe, expectNoHorizontalScroll, isMobileProject, openGigs, signIn } from '../support/gigs-ui';
import { LEGAL_ENV_MISSING, deliverInbound, inboundEmail } from '../support/legal-gigs';

/**
 * axe (wcag2a + wcag2aa, fails on serious/critical) on the hub admin inbox `/admin/inbox`, list
 * and with a thread open, in light/dark x desktop/mobile. No horizontal scroll at 390px.
 * Runs under `npm run test:e2e:gigs` (fake Resend, x-e2e-user identity).
 */
test.skip(LEGAL_ENV_MISSING || !ADMIN_USER, 'needs the gigs runner (RESEND_FAKE_URL, JOBS_E2E_AUTH_SECRET, QA_E2E_ADMIN_USER)');

test('admin inbox with a thread open: no serious or critical axe violations', async ({ page, context, request }, testInfo) => {
  const email = inboundEmail({ html: '<p>Hello, my <strong>invoice</strong> is wrong.</p>', text: 'Hello, my invoice is wrong.' });
  const res = await deliverInbound(request, email);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const reference = res.body.reference as string;

  await signIn(context, ADMIN_USER);
  await openGigs(page, '/admin/inbox', { signedIn: true });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox');
  await expectNoBlockingAxe(page);

  await page.getByRole('button', { name: `Open ${reference}`, exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Reply', exact: true })).toBeVisible();
  await expect(page.getByText('invoice').first()).toBeVisible();
  await expectNoBlockingAxe(page);
  if (isMobileProject(testInfo)) await expectNoHorizontalScroll(page);
});
