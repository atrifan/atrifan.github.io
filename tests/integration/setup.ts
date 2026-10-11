import { hasSupabaseEnv } from '../fixtures/seed';

/**
 * Integration setup. Specs that need the database use `describe.skipIf(!dbReady)`
 * from ./env; this prints one clear line so a skipped run is not mistaken for a pass.
 */
if (!hasSupabaseEnv()) {
  console.warn(
    '[test:int] STORAGE_SUPABASE_URL / STORAGE_SUPABASE_SERVICE_ROLE_KEY are not set ' +
      '(copy .env.local into the repo root). Database-backed integration specs are SKIPPED.',
  );
}
