import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client for route handlers. The deployed env names are STORAGE_SUPABASE_*
 * (see src/lib/supabase.ts); NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are older names that
 * are not set on Vercel, so routes that read only those crashed with "supabaseUrl is required"
 * (seen on /api/plugin/config in production, 2026-10-15). Kept as fallbacks for older .env files.
 */
export function serviceSupabase(): SupabaseClient {
  const url =
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url!, key!, { auth: { autoRefreshToken: false, persistSession: false } });
}
