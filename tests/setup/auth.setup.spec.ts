import { test as setup } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { E2E_USERS, ensureE2EUsers, hasClerkTestEnv, storageStatePath, type E2ERole } from '../fixtures/clerk-users';

/**
 * Signs in the E2E users once and saves their sessions to tests/.auth/<role>.json
 * (git-ignored). Specs that need a signed-in user use
 * `test.use({ storageState: storageStatePath('customer') })` and depend on the
 * `setup` project. Skips when the Clerk development keys are not configured.
 */
setup.describe.configure({ mode: 'serial' });

setup('clerk users and sessions', async ({ browser, baseURL }) => {
  setup.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  await clerkSetup();
  await ensureE2EUsers();
  for (const role of Object.keys(E2E_USERS) as E2ERole[]) {
    // One context per role, closed rather than signed out: signing out revokes the
    // session, which would make the saved storage state unusable.
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto('/');
    await clerk.signIn({ page, emailAddress: E2E_USERS[role].email });
    await page.goto('/');
    await context.storageState({ path: storageStatePath(role) });
    await context.close();
  }
});
