import { test as setup } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { E2E_USERS, ensureE2EUsers, hasClerkTestEnv, storageStatePath, type E2ERole } from '../fixtures/clerk-users';

/**
 * Signs in the E2E users once and saves their sessions to tests/.auth/<role>.json
 * (git-ignored). Specs that need a signed-in user use
 * `test.use({ storageState: storageStatePath('customer') })` and depend on the
 * `setup` project. Skips when the Clerk development keys are not configured.
 *
 * Each role signs in in its own browser context, which is then just closed: signing
 * out would end the session on Clerk's side, and the saved session token (valid for
 * 60s) could then no longer be refreshed.
 */
setup.describe.configure({ mode: 'serial' });

setup('clerk users and sessions', async ({ browser, baseURL }) => {
  setup.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  await clerkSetup();
  await ensureE2EUsers();
  for (const role of Object.keys(E2E_USERS) as E2ERole[]) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    try {
      await page.goto('/');
      await clerk.signIn({ page, emailAddress: E2E_USERS[role].email });
      await page.goto('/');
      await context.storageState({ path: storageStatePath(role) });
    } finally {
      await context.close();
    }
  }
});
