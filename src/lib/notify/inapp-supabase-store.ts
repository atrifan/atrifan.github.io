import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeedQuery, ReadTarget } from './feed.ts';
import type { ExistingInApp, NewInAppRow } from './inapp.ts';
import type { BumpPatch, InAppRow, InAppStore } from './inapp-store.ts';
import { isNotificationType, type NotificationType, type PreferenceRow } from './types.ts';
import type { Surface } from './urls.ts';

const TABLE = 'user_notifications';
const PREFS = 'notification_preferences';
const COLUMNS = 'id, user_id, type, title, body, surface, url, count, read_at, created_at, updated_at, dedupe_key';

interface DbRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  surface: string;
  url: string;
  count: number;
  read_at: string | null;
  created_at: string;
  updated_at: string;
  dedupe_key: string;
}

function toRow(r: DbRow): InAppRow {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type as NotificationType,
    title: r.title,
    body: r.body,
    surface: r.surface as Surface,
    url: r.url,
    count: r.count,
    readAt: r.read_at,
    createdAt: r.created_at,
    // Kept verbatim (microseconds) so the cursor compares exactly.
    updatedAt: r.updated_at,
    dedupeKey: r.dedupe_key,
  };
}

function fail(what: string, error: { message: string; code?: string }): never {
  throw new Error(`[notify] in-app ${what} failed: ${error.code ?? ''} ${error.message}`.trim());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quote a PostgREST filter value (timestamps carry `:` and `+`). */
const q = (v: string) => `"${v.replace(/"/g, '')}"`;

/** In-app feed over PostgREST with the service-role client. Every query filters by user_id. */
export class SupabaseInAppStore implements InAppStore {
  constructor(private readonly db: SupabaseClient) {}

  async getPreferences(userId: string): Promise<PreferenceRow[]> {
    const { data, error } = await this.db.from(PREFS).select('type, email_enabled, inapp_enabled').eq('user_id', userId);
    if (error) fail('preferences read', error);
    return ((data ?? []) as Array<{ type: string; email_enabled: boolean | null; inapp_enabled: boolean | null }>)
      .filter((r) => isNotificationType(r.type))
      .map((r) => ({ type: r.type as NotificationType, emailEnabled: r.email_enabled, inAppEnabled: r.inapp_enabled }));
  }

  async setInAppPreferences(userId: string, types: NotificationType[], enabled: boolean): Promise<void> {
    if (types.length === 0) return;
    const now = new Date().toISOString();
    const { error } = await this.db
      .from(PREFS)
      .upsert(types.map((type) => ({ user_id: userId, type, inapp_enabled: enabled, updated_at: now })), { onConflict: 'user_id,type' });
    if (error) fail('preferences write', error);
  }

  async findByDedupe(dedupeKey: string): Promise<ExistingInApp | null> {
    const { data, error } = await this.db.from(TABLE).select('id, count, read_at').eq('dedupe_key', dedupeKey).maybeSingle();
    if (error) fail('lookup', error);
    const r = data as { id: string; count: number; read_at: string | null } | null;
    return r ? { id: r.id, count: r.count, readAt: r.read_at } : null;
  }

  async insert(row: NewInAppRow, at: string): Promise<ExistingInApp | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .insert({
        user_id: row.userId,
        type: row.type,
        title: row.title,
        body: row.body,
        surface: row.surface,
        url: row.url,
        payload: row.payload,
        dedupe_key: row.dedupeKey,
        count: row.count,
        created_at: at,
        updated_at: at,
      })
      .select('id, count')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') return null;
      fail('insert', error);
    }
    const r = data as { id: string; count: number } | null;
    return r ? { id: r.id, count: r.count, readAt: null } : null;
  }

  async bump(id: string, expectedCount: number, patch: BumpPatch): Promise<boolean> {
    const { data, error } = await this.db
      .from(TABLE)
      .update({ count: patch.count, title: patch.title, body: patch.body, read_at: patch.readAt, updated_at: patch.updatedAt })
      .eq('id', id)
      .eq('count', expectedCount)
      .select('id');
    if (error) fail('bump', error);
    return (data ?? []).length > 0;
  }

  async list(userId: string, query: FeedQuery): Promise<InAppRow[]> {
    let req = this.db.from(TABLE).select(COLUMNS).eq('user_id', userId);
    if (query.unreadOnly) req = req.is('read_at', null);
    if (query.surface) req = req.eq('surface', query.surface);
    if (query.type) req = req.eq('type', query.type);
    if (query.cursor) {
      const { at, id } = query.cursor;
      if (!UUID_RE.test(id)) return [];
      req = req.or(`updated_at.lt.${q(at)},and(updated_at.eq.${q(at)},id.lt.${q(id)})`);
    }
    const { data, error } = await req.order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(query.limit + 1);
    if (error) fail('list', error);
    return ((data ?? []) as DbRow[]).map(toRow);
  }

  async unreadCount(userId: string): Promise<number> {
    const { count, error } = await this.db.from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null);
    if (error) fail('count', error);
    return count ?? 0;
  }

  async markRead(userId: string, target: ReadTarget, now = new Date()): Promise<number> {
    // Ids are uuids; anything else can't match (and would be a Postgres cast error).
    const ids = 'ids' in target ? target.ids.filter((id) => UUID_RE.test(id)) : null;
    if (ids && ids.length === 0) return 0;
    let req = this.db.from(TABLE).update({ read_at: now.toISOString() }).eq('user_id', userId).is('read_at', null);
    if (ids) req = req.in('id', ids);
    const { data, error } = await req.select('id');
    if (error) fail('mark read', error);
    return (data ?? []).length;
  }
}
