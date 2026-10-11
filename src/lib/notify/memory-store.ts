import type { NewNotification, NotifyStore } from './store.ts';
import type { Contact, NotificationRow, NotificationType, PreferenceRow } from './types.ts';

interface MemoryRow extends NotificationRow {
  nextAttemptAt: number;
}

/** In-memory NotifyStore for unit tests. Mirrors the SQL store's semantics. */
export class MemoryNotifyStore implements NotifyStore {
  readonly contacts = new Map<string, Contact>();
  readonly prefs = new Map<string, Map<NotificationType, boolean>>();
  readonly rows: MemoryRow[] = [];
  now: () => number;
  private seq = 0;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  async upsertContact(contact: Contact): Promise<void> {
    this.contacts.set(contact.userId, { ...contact });
  }

  async deleteContact(userId: string): Promise<void> {
    this.contacts.delete(userId);
  }

  async getContact(userId: string): Promise<Contact | null> {
    return this.contacts.get(userId) ?? null;
  }

  async getPreferences(userId: string): Promise<PreferenceRow[]> {
    return [...(this.prefs.get(userId) ?? new Map()).entries()].map(([type, emailEnabled]) => ({ type, emailEnabled }));
  }

  async setPreferences(userId: string, prefs: Partial<Record<NotificationType, boolean>>): Promise<void> {
    const current = this.prefs.get(userId) ?? new Map<NotificationType, boolean>();
    for (const [type, enabled] of Object.entries(prefs)) {
      if (typeof enabled === 'boolean') current.set(type as NotificationType, enabled);
    }
    this.prefs.set(userId, current);
  }

  async insertNotification(row: NewNotification): Promise<NotificationRow | null> {
    if (this.rows.some((r) => r.dedupeKey === row.dedupeKey)) return null;
    const stored: MemoryRow = {
      id: `n_${++this.seq}`,
      userId: row.userId,
      type: row.type,
      payload: row.payload,
      dedupeKey: row.dedupeKey,
      status: row.status,
      attempts: 0,
      lastError: row.lastError ?? null,
      createdAt: new Date(this.now()).toISOString(),
      sentAt: null,
      providerMessageId: null,
      nextAttemptAt: this.now(),
    };
    this.rows.push(stored);
    return strip(stored);
  }

  private claim(row: MemoryRow, leaseMs: number): NotificationRow {
    row.attempts += 1;
    row.nextAttemptAt = this.now() + leaseMs;
    return strip(row);
  }

  private due(row: MemoryRow): boolean {
    return row.status === 'queued' && row.nextAttemptAt <= this.now();
  }

  async claimById(id: string, leaseMs: number): Promise<NotificationRow | null> {
    const row = this.rows.find((r) => r.id === id);
    return row && this.due(row) ? this.claim(row, leaseMs) : null;
  }

  async claimDue(limit: number, leaseMs: number): Promise<NotificationRow[]> {
    return this.rows.filter((r) => this.due(r)).slice(0, limit).map((r) => this.claim(r, leaseMs));
  }

  async markSent(id: string, providerMessageId: string | null): Promise<void> {
    const row = this.find(id);
    row.status = 'sent';
    row.sentAt = new Date(this.now()).toISOString();
    row.providerMessageId = providerMessageId;
    row.lastError = null;
  }

  async markSkipped(id: string, reason: string): Promise<void> {
    const row = this.find(id);
    row.status = 'skipped';
    row.lastError = reason;
  }

  async markFailed(id: string, error: string, retryAt: Date | null): Promise<void> {
    const row = this.find(id);
    row.lastError = error;
    if (retryAt) {
      row.status = 'queued';
      row.nextAttemptAt = retryAt.getTime();
    } else {
      row.status = 'failed';
    }
  }

  private find(id: string): MemoryRow {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error(`notification ${id} not found`);
    return row;
  }
}

function strip(row: MemoryRow): NotificationRow {
  const { nextAttemptAt: _ignored, ...rest } = row;
  return { ...rest };
}
