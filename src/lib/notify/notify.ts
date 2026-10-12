import { waitUntil } from '@vercel/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { createSupabaseClient } from '@/src/lib/supabase';
import { createEnqueue, type ChannelsResult } from './channels.ts';
import { contactFromClerkUser } from './contacts.ts';
import { SupabaseInAppStore } from './inapp-supabase-store.ts';
import type { InAppStore } from './inapp-store.ts';
import { createNotifier, type DispatchSummary, type Notifier } from './notifier.ts';
import { PgNotifyStore } from './pg-store.ts';
import type { NotifyStore } from './store.ts';
import { createResendTransport } from './transport.ts';
import type { NotificationType, PayloadInput } from './types.ts';

/**
 * Production wiring: Postgres outbox + Resend + waitUntil.
 *
 * Env: STORAGE_POSTGRES_URL_NON_POOLING (or STORAGE_POSTGRES_URL), RESEND_API_KEY,
 * NOTIFY_FROM, NOTIFY_UNSUBSCRIBE_SECRET, optional NOTIFY_DB_SCHEMA (default "public").
 */

export const DEFAULT_FROM = 'Tulzo <notifications@tulzo.online>';

let pool: Pool | null = null;
let store: NotifyStore | null = null;
let notifier: Notifier | null = null;

function connectionString(): string {
  // Session-mode (5432) first: the transaction-mode pooler (6543) hung on connect in local testing.
  const url = process.env.STORAGE_POSTGRES_URL_NON_POOLING || process.env.STORAGE_POSTGRES_URL;
  if (!url) throw new Error('STORAGE_POSTGRES_URL_NON_POOLING is not configured');
  // Supabase serves a cert chain node doesn't trust by default; TLS stays on, verification is off.
  const parsed = new URL(url);
  parsed.searchParams.delete('sslmode');
  return parsed.toString();
}

export function getNotifyStore(): NotifyStore {
  if (!store) {
    pool = new Pool({
      connectionString: connectionString(),
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => console.error('[notify] pg pool error', err.message));
    store = new PgNotifyStore(pool, process.env.NOTIFY_DB_SCHEMA || 'public');
  }
  return store;
}

export function getUnsubscribeSecret(): string {
  const secret = process.env.NOTIFY_UNSUBSCRIBE_SECRET;
  if (!secret) throw new Error('NOTIFY_UNSUBSCRIBE_SECRET is not configured');
  return secret;
}

export function getNotifier(): Notifier {
  if (!notifier) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
    notifier = createNotifier({
      store: getNotifyStore(),
      transport: createResendTransport(apiKey),
      from: process.env.NOTIFY_FROM || DEFAULT_FROM,
      unsubscribeSecret: getUnsubscribeSecret(),
      schedule: (work) => waitUntil(work),
    });
  }
  return notifier;
}

let inAppStore: InAppStore | null = null;

/** The in-app feed store (service-role Supabase, STORAGE_SUPABASE_URL). Throws if not configured. */
export function getInAppStore(): InAppStore {
  if (!inAppStore) inAppStore = new SupabaseInAppStore(createSupabaseClient({ noStore: true }) as unknown as SupabaseClient);
  return inAppStore;
}

function getInAppStoreOrNull(): InAppStore | null {
  try {
    return getInAppStore();
  } catch (err) {
    console.error('[notify] in-app not configured:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

const enqueueBoth = createEnqueue({ notifier: getNotifierOrNull, inApp: getInAppStoreOrNull });

/**
 * Notify `userId` of an event on both channels: the in-app feed (the header bell, hub
 * /notifications) and email. The email is queued and sent right away (via waitUntil); the cron
 * at /api/notifications/dispatch picks up anything that didn't go out. Preferences apply per
 * channel (src/lib/notify/preferences.ts).
 *
 * - Throws on programmer errors: unknown type, invalid payload, empty dedupeKey.
 * - Never throws on infrastructure errors (DB down, env missing): it logs and returns
 *   `{ status: 'error' }` (and `inApp.status: 'error'`), so a failed notification never breaks
 *   the caller's main flow.
 */
export async function enqueue<T extends NotificationType>(
  userId: string,
  type: T,
  payload: PayloadInput<T>,
  dedupeKey: string,
): Promise<ChannelsResult> {
  return enqueueBoth(userId, type, payload, dedupeKey);
}

/** Drain due rows from the outbox (used by the cron route). */
export async function dispatchQueued(limit = 50): Promise<DispatchSummary> {
  return getNotifier().dispatch(limit);
}

function getNotifierOrNull(): Notifier | null {
  try {
    return getNotifier();
  } catch (err) {
    console.error('[notify] not configured:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Upsert the contact for a Clerk user (webhook payload or Backend SDK object). */
export async function syncContactFromClerk(user: unknown, notifyStore: NotifyStore = getNotifyStore()): Promise<boolean> {
  const contact = contactFromClerkUser(user);
  if (!contact) return false;
  await notifyStore.upsertContact(contact);
  return true;
}

export async function deleteContact(userId: string, notifyStore: NotifyStore = getNotifyStore()): Promise<void> {
  await notifyStore.deleteContact(userId);
}
