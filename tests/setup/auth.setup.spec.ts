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

setup('clerk users and sessions', async ({ page }) => {
  setup.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  await clerkSetup();
  await ensureE2EUsers();
  for (const role of Object.keys(E2E_USERS) as E2ERole[]) {
    await page.goto('/');
    await clerk.signIn({ page, emailAddress: E2E_USERS[role].email });
    await page.goto('/');
    await page.context().storageState({ path: storageStatePath(role) });
    await clerk.signOut({ page });
    await page.context().clearCookies();
  }
});
