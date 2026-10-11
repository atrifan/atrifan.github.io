import type { NewNotification, NotifyStore } from './store.ts';
import { isNotificationType, type Contact, type NotificationRow, type NotificationType, type PreferenceRow } from './types.ts';

/** Minimal query surface, satisfied by `pg.Pool` and `pg.Client`. */
export interface Queryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

const SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;

interface DbNotification extends Record<string, unknown> {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  status: NotificationRow['status'];
  attempts: number;
  last_error: string | null;
  created_at: Date;
  sent_at: Date | null;
  provider_message_id: string | null;
}

const COLUMNS =
  'id, user_id, type, payload, dedupe_key, status, attempts, last_error, created_at, sent_at, provider_message_id';

function toRow(r: DbNotification): NotificationRow {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type as NotificationType,
    payload: r.payload,
    dedupeKey: r.dedupe_key,
    status: r.status,
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: new Date(r.created_at).toISOString(),
    sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    providerMessageId: r.provider_message_id,
  };
}

/**
 * Postgres-backed store. Uses SQL directly (not PostgREST) for the outbox so that
 * claims can use `FOR UPDATE SKIP LOCKED` and dedupe can use `ON CONFLICT DO NOTHING`.
 */
export class PgNotifyStore implements NotifyStore {
  private readonly db: Queryable;
  private readonly t: { contacts: string; prefs: string; notifications: string };

  constructor(db: Queryable, schema = 'public') {
    if (!SCHEMA_RE.test(schema)) throw new Error(`invalid schema name: ${schema}`);
    this.db = db;
    this.t = {
      contacts: `"${schema}".user_contacts`,
      prefs: `"${schema}".notification_preferences`,
      notifications: `"${schema}".notifications`,
    };
  }

  async upsertContact(c: Contact): Promise<void> {
    await this.db.query(
      `insert into ${this.t.contacts} (user_id, email, name, locale, email_verified)
       values ($1, $2, $3, $4, $5)
       on conflict (user_id) do update set
         email = excluded.email, name = excluded.name, locale = excluded.locale,
         email_verified = excluded.email_verified, updated_at = now()`,
      [c.userId, c.email, c.name, c.locale, c.emailVerified],
    );
  }

  async deleteContact(userId: string): Promise<void> {
    await this.db.query(`delete from ${this.t.contacts} where user_id = $1`, [userId]);
  }

  async getContact(userId: string): Promise<Contact | null> {
    const { rows } = await this.db.query<{
      user_id: string;
      email: string | null;
      name: string | null;
      locale: string | null;
      email_verified: boolean;
    }>(`select user_id, email, name, locale, email_verified from ${this.t.contacts} where user_id = $1`, [userId]);
    const r = rows[0];
    return r ? { userId: r.user_id, email: r.email, name: r.name, locale: r.locale, emailVerified: r.email_verified } : null;
  }

  async getPreferences(userId: string): Promise<PreferenceRow[]> {
    const { rows } = await this.db.query<{ type: string; email_enabled: boolean }>(
      `select type, email_enabled from ${this.t.prefs} where user_id = $1`,
      [userId],
    );
    return rows.filter((r) => isNotificationType(r.type)).map((r) => ({ type: r.type as NotificationType, emailEnabled: r.email_enabled }));
  }

  async setPreferences(userId: string, prefs: Partial<Record<NotificationType, boolean>>): Promise<void> {
    const entries = Object.entries(prefs).filter(([type, v]) => isNotificationType(type) && typeof v === 'boolean');
    if (entries.length === 0) return;
    await this.db.query(
      `insert into ${this.t.prefs} (user_id, type, email_enabled)
       select $1, t, e from unnest($2::text[], $3::boolean[]) as x(t, e)
       on conflict (user_id, type) do update set email_enabled = excluded.email_enabled, updated_at = now()`,
      [userId, entries.map(([t]) => t), entries.map(([, v]) => v)],
    );
  }

  async insertNotification(n: NewNotification): Promise<NotificationRow | null> {
    const { rows } = await this.db.query<DbNotification>(
      `insert into ${this.t.notifications} (user_id, type, payload, dedupe_key, status, last_error)
       values ($1, $2, $3::jsonb, $4, $5, $6)
       on conflict (dedupe_key) do nothing
       returning ${COLUMNS}`,
      [n.userId, n.type, JSON.stringify(n.payload), n.dedupeKey, n.status, n.lastError ?? null],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async claimById(id: string, leaseMs: number): Promise<NotificationRow | null> {
    const { rows } = await this.db.query<DbNotification>(
      `update ${this.t.notifications}
         set attempts = attempts + 1, next_attempt_at = now() + ($2::bigint * interval '1 millisecond')
       where id = (
         select id from ${this.t.notifications}
         where id = $1 and status = 'queued' and next_attempt_at <= now()
         for update skip locked
       )
       returning ${COLUMNS}`,
      [id, leaseMs],
    );
    return rows[0] ? toRow(rows[0]) : null;
  }

  async claimDue(limit: number, leaseMs: number): Promise<NotificationRow[]> {
    const { rows } = await this.db.query<DbNotification>(
      `update ${this.t.notifications}
         set attempts = attempts + 1, next_attempt_at = now() + ($2::bigint * interval '1 millisecond')
       where id in (
         select id from ${this.t.notifications}
         where status = 'queued' and next_attempt_at <= now()
         order by next_attempt_at, created_at
         limit $1
         for update skip locked
       )
       returning ${COLUMNS}`,
      [limit, leaseMs],
    );
    return rows.map(toRow).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async markSent(id: string, providerMessageId: string | null): Promise<void> {
    await this.db.query(
      `update ${this.t.notifications}
         set status = 'sent', sent_at = now(), provider_message_id = $2, last_error = null
       where id = $1`,
      [id, providerMessageId],
    );
  }

  async markSkipped(id: string, reason: string): Promise<void> {
    await this.db.query(`update ${this.t.notifications} set status = 'skipped', last_error = $2 where id = $1`, [id, reason]);
  }

  async markFailed(id: string, error: string, retryAt: Date | null): Promise<void> {
    await this.db.query(
      `update ${this.t.notifications}
         set status = case when $3::timestamptz is null then 'failed' else 'queued' end,
             last_error = $2,
             next_attempt_at = coalesce($3::timestamptz, next_attempt_at)
       where id = $1`,
      [id, error, retryAt ? retryAt.toISOString() : null],
    );
  }
}
