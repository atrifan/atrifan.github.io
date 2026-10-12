import { test as setup } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { E2E_USERS, ensureE2EUsers, hasClerkTestEnv, storageStatePath, type E2ERole } from '../fixtures/clerk-users';

/**
 * Signs in the E2E users once and saves their sessions to tests/.auth/<role>.json
 * (git-ignored). Specs that need a signed-in user use
 * `test.use({ storageState: storageStatePath('customer') })` and depend on the
 * `setup` project. Skips when the Clerk development keys are not configured.
 *
 * Each role signs in in its own browser context, and the session is never signed
 * out: signing out revokes it in Clerk, which leaves the saved state with a
 * short-lived __session JWT the server still accepts for a minute while the
 * browser's Clerk client already sees a signed-out user.
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
      await page.waitForFunction(() => !!(window as unknown as { Clerk?: { user?: unknown } }).Clerk?.user);
      await context.storageState({ path: storageStatePath(role) });
    } finally {
      await context.close();
    }
  }
});
