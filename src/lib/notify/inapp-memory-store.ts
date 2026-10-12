import type { FeedQuery, ReadTarget } from './feed.ts';
import type { ExistingInApp, NewInAppRow } from './inapp.ts';
import type { BumpPatch, InAppRow, InAppStore } from './inapp-store.ts';
import type { NotificationType, PreferenceRow } from './types.ts';

/** In-memory InAppStore for unit tests. Mirrors SupabaseInAppStore's semantics. */
export class MemoryInAppStore implements InAppStore {
  readonly rows: InAppRow[] = [];
  readonly inAppPrefs = new Map<string, Map<NotificationType, boolean>>();
  /** Test hooks: make the next N bumps lose their race, or the next N lookups miss. */
  failNextBumps = 0;
  hideNextFind = 0;
  private seq = 0;

  async getPreferences(userId: string): Promise<PreferenceRow[]> {
    return [...(this.inAppPrefs.get(userId) ?? new Map<NotificationType, boolean>()).entries()].map(([type, inAppEnabled]) => ({
      type,
      emailEnabled: null,
      inAppEnabled,
    }));
  }

  async setInAppPreferences(userId: string, types: NotificationType[], enabled: boolean): Promise<void> {
    const m = this.inAppPrefs.get(userId) ?? new Map<NotificationType, boolean>();
    for (const t of types) m.set(t, enabled);
    this.inAppPrefs.set(userId, m);
  }

  async findByDedupe(dedupeKey: string): Promise<ExistingInApp | null> {
    if (this.hideNextFind > 0) {
      this.hideNextFind -= 1;
      return null;
    }
    const r = this.rows.find((x) => x.dedupeKey === dedupeKey);
    return r ? { id: r.id, count: r.count, readAt: r.readAt } : null;
  }

  async insert(row: NewInAppRow, at: string): Promise<ExistingInApp | null> {
    if (this.rows.some((x) => x.dedupeKey === row.dedupeKey)) return null;
    const stored: InAppRow = {
      id: `i_${++this.seq}`,
      userId: row.userId,
      type: row.type,
      title: row.title,
      body: row.body,
      surface: row.surface,
      url: row.url,
      count: row.count,
      readAt: null,
      createdAt: at,
      updatedAt: at,
      dedupeKey: row.dedupeKey,
    };
    this.rows.push(stored);
    return { id: stored.id, count: stored.count, readAt: null };
  }

  async bump(id: string, expectedCount: number, patch: BumpPatch): Promise<boolean> {
    if (this.failNextBumps > 0) {
      this.failNextBumps -= 1;
      return false;
    }
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.count !== expectedCount) return false;
    Object.assign(r, { count: patch.count, title: patch.title, body: patch.body, readAt: patch.readAt, updatedAt: patch.updatedAt });
    return true;
  }

  async list(userId: string, q: FeedQuery): Promise<InAppRow[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .filter((r) => !q.unreadOnly || r.readAt === null)
      .filter((r) => !q.surface || r.surface === q.surface)
      .filter((r) => !q.type || r.type === q.type)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .filter((r) => !q.cursor || r.updatedAt < q.cursor.at || (r.updatedAt === q.cursor.at && r.id < q.cursor.id))
      .slice(0, q.limit + 1)
      .map((r) => ({ ...r }));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.rows.filter((r) => r.userId === userId && r.readAt === null).length;
  }

  async markRead(userId: string, target: ReadTarget, now = new Date()): Promise<number> {
    const ids = 'ids' in target ? new Set(target.ids) : null;
    let n = 0;
    for (const r of this.rows) {
      if (r.userId !== userId || r.readAt !== null || (ids && !ids.has(r.id))) continue;
      r.readAt = now.toISOString();
      n += 1;
    }
    return n;
  }
}
