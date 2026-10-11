/**
 * Supabase Client
 *
 * Server-side Supabase client using service role key.
 * Use this for API routes that need full database access.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

// Use existing env var names from .env.local
const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
const supabaseServiceKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing STORAGE_SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  throw new Error('Missing STORAGE_SUPABASE_SERVICE_ROLE_KEY environment variable');
}

/**
 * Server-side Supabase client with service role access.
 * This bypasses RLS - use only in server-side code (API routes).
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Create a Supabase client for a specific request.
 * Useful if you need request-scoped clients.
 *
 * `noStore` sends every request with `cache: 'no-store'`, so Next.js never serves a
 * PostgREST read from its fetch data cache (Next 14 caches GET fetches by default when a
 * route has not called headers()/cookies() first).
 */
export function createSupabaseClient(options: { noStore?: boolean } = {}) {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables not configured');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...(options.noStore
      ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: 'no-store' }) } }
      : {}),
  });
}

