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

/**
 * `next dev` compiles a route the first time it is requested. With every project's workers asking for
 * new pages at once, those first requests outlast the specs' waits, and concurrent first compiles can
 * race (a 500 "Cannot read properties of null (reading 'useContext')"). So, against the local dev
 * server only, open every page once, one at a time, as the admin (who may open every page), and let
 * each page's own API calls compile too. A production server (`next start`, CI) has nothing to compile.
 */
const WARM_PATHS = [
  '/',
  '/pricing',
  '/docs',
  '/legal',
  '/legal/terms',
  '/sign-in',
  '/sign-up',
  '/profile',
  '/profile/account',
  '/credits',
  '/notifications',
  '/admin/qa',
  '/admin/inbox',
  '/admin/disputes',
  '/admin/activity',
  '/dashboard/admin/packages',
  '/ai',
  '/chat',
  '/marketplace',
  '/marketplace/publish',
  '/marketplace/admin',
  '/marketplace/publisher/activity',
  '/marketplace/warm-up',
  '/gigs',
  '/gigs/post',
  '/gigs/offers/new',
  '/gigs/activity',
  '/gigs/docs/mcp',
  '/gigs/docs/admin-qa',
  '/gigs/jobs/warm-up',
  '/gigs/contracts/warm-up',
  '/gigs/contracts/warm-up/delivery',
];

setup('compile every page once (next dev only)', async ({ browser, baseURL }) => {
  setup.skip(!!process.env.CI || !!process.env.PLAYWRIGHT_BASE_URL, 'production server: nothing to compile');
  setup.setTimeout(15 * 60_000);
  const context = await browser.newContext({ baseURL, storageState: hasClerkTestEnv() ? storageStatePath('admin') : undefined });
  const page = await context.newPage();
  await page.route(/(iubenda|googletagmanager|google-analytics|googlesyndication|doubleclick|adservice)/, (route) =>
    route.abort('blockedbyclient'),
  );
  try {
    for (const path of WARM_PATHS) {
      // Any status will do: a 404 for a placeholder id still compiles the route.
      await page.goto(path, { waitUntil: 'load', timeout: 180_000 });
      // The page's own API requests compile while it loads them. Pages that poll never go fully idle,
      // so this is bounded; the next goto is what matters.
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    }
  } finally {
    await context.close();
  }
});
