import { clerkSetup } from '@clerk/testing/playwright';
import { hasClerkTestEnv } from './fixtures/clerk-users';
import { seedMarketplace, seedRelaySession, hasSupabaseEnv } from './fixtures/seed';

/**
 * Seed marketplace fixtures ONCE before the whole run. Individual specs must
 * not clean up between files — with parallel workers that would delete the
 * fixture package out from under other still-running specs. Fixtures are
 * idempotent upserts, so leaving them in place is safe and race-free.
 *
 * With the Clerk development keys, also fetch a Clerk testing token
 * (CLERK_TESTING_TOKEN, inherited by the workers): signed-in specs call
 * `setupClerkTestingToken({ page })` so Clerk can refresh the saved sessions
 * (their tokens last 60s) without bot protection signing them out.
 */
export default async function globalSetup() {
  if (hasClerkTestEnv()) await clerkSetup();
  if (!hasSupabaseEnv()) return;
  await seedMarketplace();
  await seedRelaySession();
}
