import { seedMarketplace, hasSupabaseEnv } from './fixtures/seed';

/**
 * Seed marketplace fixtures ONCE before the whole run. Individual specs must
 * not clean up between files — with parallel workers that would delete the
 * fixture package out from under other still-running specs. Fixtures are
 * idempotent upserts, so leaving them in place is safe and race-free.
 */
export default async function globalSetup() {
  if (!hasSupabaseEnv()) return;
  await seedMarketplace();
}
