import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/src/lib/supabase';

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client for the gigs tables. Untyped, because these tables are
 * not in the generated `Database` type yet. Every query on user data filters by user_id.
 */
export function jobsDb(): SupabaseClient {
  if (!client) client = createSupabaseClient({ noStore: true }) as unknown as SupabaseClient;
  return client;
}
