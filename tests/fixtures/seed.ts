/**
 * Test seed helpers.
 *
 * Marketplace discovery/publish/install are gated by a Tulzo API key (Bearer),
 * not by Clerk. To exercise those routes we seed a real `api_keys` row whose
 * hash matches a known plaintext test key, on a paid plan.
 *
 * Requires STORAGE_SUPABASE_URL + STORAGE_SUPABASE_SERVICE_ROLE_KEY in the env
 * (same vars the app uses). Skips gracefully if they're absent so the suite can
 * still run partial checks locally.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const TEST_PRO_KEY = process.env.TEST_MARKETPLACE_KEY || 'tlz_test_pro_marketplace_key_0001';
export const TEST_USER_ID = process.env.TEST_MARKETPLACE_USER || 'test_user_marketplace';
export const TEST_PACKAGE_ID = 'test-mcp-weather';

// Remote chat relay fixtures. A relay session is normally created via the
// Clerk-gated route; for device-side (Bearer) tests we seed one directly so
// poll/emit can be exercised with the fixture API key alone.
export const TEST_RELAY_SESSION_ID = '00000000-0000-4000-8000-00000000c0de';
export const TEST_RELAY_DEVICE_NAME = 'e2e';

function hash(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function hasSupabaseEnv(): boolean {
  return !!(
    (process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL) &&
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY
  );
}

function client(): SupabaseClient {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Insert (or refresh) the paid fixture API key and a public fixture package. */
export async function seedMarketplace(): Promise<void> {
  const db = client();

  await db.from('api_keys').upsert(
    {
      user_id: TEST_USER_ID,
      api_key_hash: hash(TEST_PRO_KEY),
      api_key_suffix: TEST_PRO_KEY.slice(-4),
      name: 'e2e-marketplace',
      server_name: 'default',
      device_name: 'e2e',
      provider: 'custom',
      plan: 'pro',
      is_active: true,
    },
    { onConflict: 'api_key_hash' }
  );

  await db.from('packages').upsert({
    id: TEST_PACKAGE_ID,
    name: 'Test Weather MCP',
    description: 'Fixture MCP package for e2e tests',
    type: 'mcp',
    latest_version: '1.0.0',
    blob_url: '',
    visibility: 'public',
    config_json: { transport: 'http', url: 'https://example.com/mcp' },
    created_by: TEST_USER_ID,
    owner_user_id: TEST_USER_ID,
  });
}

/** Remove fixtures created by seedMarketplace. */
export async function cleanupMarketplace(): Promise<void> {
  const db = client();
  await db.from('packages').delete().eq('id', TEST_PACKAGE_ID);
  await db.from('api_keys').delete().eq('api_key_hash', hash(TEST_PRO_KEY));
}

/**
 * Seed a relay session owned by the fixture user + fixture device (api key),
 * so device Bearer routes (poll/emit) can be tested without Clerk. Requires the
 * fixture api_keys row to exist (seedMarketplace runs first in global-setup).
 * Idempotent: upserts by fixed session id and clears any leftover frames.
 */
export async function seedRelaySession(): Promise<void> {
  const db = client();
  const { data: key } = await db
    .from('api_keys')
    .select('id')
    .eq('api_key_hash', hash(TEST_PRO_KEY))
    .single();
  if (!key) return;

  await db.from('chat_relay_sessions').upsert(
    {
      id: TEST_RELAY_SESSION_ID,
      user_id: TEST_USER_ID,
      api_key_id: (key as { id: string }).id,
      device_name: TEST_RELAY_DEVICE_NAME,
      title: 'e2e relay session',
    },
    { onConflict: 'id' }
  );

  // Start each run with a clean frame/message slate for this session.
  await db.from('chat_relay_frames').delete().eq('session_id', TEST_RELAY_SESSION_ID);
  await db.from('chat_relay_messages').delete().eq('session_id', TEST_RELAY_SESSION_ID);
}
