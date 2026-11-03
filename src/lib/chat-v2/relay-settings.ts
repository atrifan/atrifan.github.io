import { createHmac, randomBytes } from 'node:crypto';
import { serviceSupabase } from '../service-supabase';

/**
 * The three server-wide values the v2 chat relay needs. The `chat_relay_settings` table (service role only) is the main
 * source; the CHAT_* environment variables are the per-field fallback. One set serves every user: users are separated by
 * the signed tokens and per-device channels, not by separate credentials.
 */
export interface RelaySettings {
  tokenSecret?: string;
  realtimeAnonKey?: string;
  brokerJwt?: string;
}

export const BROKER_ROLE = 'tulzo_chat_broker';
const BROKER_JWT_LIFETIME_S = 2 * 365 * 24 * 3600;
const RENEW_WITHIN_S = 30 * 24 * 3600;
const CACHE_MS = 30_000;
const TABLE = 'chat_relay_settings';

export function relaySettingsFromEnv(env: NodeJS.ProcessEnv = process.env): RelaySettings {
  return { tokenSecret: env.CHAT_RELAY_TOKEN_SECRET, realtimeAnonKey: env.CHAT_REALTIME_ANON_KEY, brokerJwt: env.CHAT_BROKER_JWT };
}

export function jwtPayload(value: string): Record<string, unknown> | null {
  const parts = value.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch { return null; }
}

/** Seconds since the epoch when the JWT expires, or null when it carries no usable `exp`. */
export function jwtExpiry(value: string | undefined): number | null {
  const exp = value ? jwtPayload(value)?.exp : undefined;
  return typeof exp === 'number' && Number.isSafeInteger(exp) ? exp : null;
}

export function signBrokerJwt(secret: string, now = Math.floor(Date.now() / 1000), lifetimeS = BROKER_JWT_LIFETIME_S): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ role: BROKER_ROLE, iss: 'tulzo', iat: now, exp: now + lifetimeS })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function newTokenSecret(): string {
  return randomBytes(32).toString('base64url');
}

function tableConfigured(): boolean {
  if (process.env.CHAT_RELAY_SETTINGS_SOURCE === 'env') return false;
  return !!(process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
}

interface Row {
  token_secret: string | null;
  realtime_anon_key: string | null;
  broker_jwt: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

async function readRow(): Promise<Row | null> {
  if (!tableConfigured()) return null;
  try {
    const read = serviceSupabase()
      .from(TABLE)
      .select('token_secret, realtime_anon_key, broker_jwt, updated_at, updated_by')
      .eq('id', 1)
      .abortSignal(AbortSignal.timeout(2000))
      .maybeSingle();
    const { data, error } = await read;
    return error ? null : (data as Row | null);
  } catch { return null; }
}

let cache: { at: number; value: RelaySettings } | null = null;

export function resetRelaySettingsCache(): void {
  cache = null;
}

/** The effective settings: table first, environment per missing field. A broker JWT close to expiry is renewed in place. */
export async function loadRelaySettings(): Promise<RelaySettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const env = relaySettingsFromEnv();
  const row = await readRow();
  let value: RelaySettings = {
    tokenSecret: row?.token_secret || env.tokenSecret,
    realtimeAnonKey: row?.realtime_anon_key || env.realtimeAnonKey,
    brokerJwt: row?.broker_jwt || env.brokerJwt,
  };
  const exp = jwtExpiry(value.brokerJwt);
  if (row?.broker_jwt && exp !== null && exp - Math.floor(Date.now() / 1000) < RENEW_WITHIN_S) {
    const renewed = await renewBrokerJwt().catch(() => null);
    if (renewed) value = { ...value, brokerJwt: renewed };
  }
  cache = { at: Date.now(), value };
  return value;
}

function jwtSigningSecret(): string | null {
  return process.env.STORAGE_SUPABASE_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || null;
}

function publicKey(): string | null {
  return process.env.STORAGE_SUPABASE_PUBLISHABLE_KEY || process.env.STORAGE_SUPABASE_ANON_KEY || null;
}

async function renewBrokerJwt(): Promise<string | null> {
  const secret = jwtSigningSecret();
  if (!secret) return null;
  const jwt = signBrokerJwt(secret);
  const { error } = await serviceSupabase()
    .from(TABLE)
    .update({ broker_jwt: jwt, updated_at: new Date().toISOString(), updated_by: 'auto-renew' })
    .eq('id', 1);
  return error ? null : jwt;
}

/** Generate and store all three values. Rotating the token secret only drops tokens that are at most 45 seconds old. */
export async function generateRelaySettings(updatedBy: string): Promise<{ expiresAt: string }> {
  const signing = jwtSigningSecret();
  const anon = publicKey();
  if (!signing) throw new Error('STORAGE_SUPABASE_JWT_SECRET is not set');
  if (!anon) throw new Error('STORAGE_SUPABASE_PUBLISHABLE_KEY or STORAGE_SUPABASE_ANON_KEY is not set');
  const now = Math.floor(Date.now() / 1000);
  const next: RelaySettings = { tokenSecret: newTokenSecret(), realtimeAnonKey: anon, brokerJwt: signBrokerJwt(signing, now) };
  // Imported lazily: broker.ts imports this module.
  const { brokerConfig } = await import('./broker');
  brokerConfig(next);
  const { error } = await serviceSupabase().from(TABLE).upsert({
    id: 1,
    token_secret: next.tokenSecret,
    realtime_anon_key: next.realtimeAnonKey,
    broker_jwt: next.brokerJwt,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  });
  if (error) throw new Error('Could not store the relay settings');
  resetRelaySettingsCache();
  return { expiresAt: new Date((now + BROKER_JWT_LIFETIME_S) * 1000).toISOString() };
}

export interface RelayStatus {
  tokenSecret: 'table' | 'env' | 'missing';
  realtimeAnonKey: 'table' | 'env' | 'missing';
  brokerJwt: 'table' | 'env' | 'missing';
  brokerJwtExpiresAt: string | null;
  canGenerate: { jwtSecret: boolean; publicKey: boolean; serviceRole: boolean };
  updatedAt: string | null;
  updatedBy: string | null;
  allowedOrigins: string[];
}

/** What is configured and where from. Never returns a value. */
export async function relayStatus(allowedOrigins: string[]): Promise<RelayStatus> {
  const row = await readRow();
  const env = relaySettingsFromEnv();
  const source = (fromRow: string | null | undefined, fromEnv: string | undefined) => (fromRow ? 'table' : fromEnv ? 'env' : 'missing') as 'table' | 'env' | 'missing';
  const jwt = row?.broker_jwt || env.brokerJwt;
  const exp = jwtExpiry(jwt);
  return {
    tokenSecret: source(row?.token_secret, env.tokenSecret),
    realtimeAnonKey: source(row?.realtime_anon_key, env.realtimeAnonKey),
    brokerJwt: source(row?.broker_jwt, env.brokerJwt),
    brokerJwtExpiresAt: exp === null ? null : new Date(exp * 1000).toISOString(),
    canGenerate: { jwtSecret: !!jwtSigningSecret(), publicKey: !!publicKey(), serviceRole: tableConfigured() },
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
    allowedOrigins,
  };
}
