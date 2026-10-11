import type { Contact, NotificationRow, NotificationStatus, NotificationType, PreferenceRow } from './types.ts';

export interface NewNotification {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  dedupeKey: string;
  status: Extract<NotificationStatus, 'queued' | 'skipped'>;
  lastError?: string | null;
}

/**
 * Persistence for contacts, preferences and the notifications outbox.
 * `PgNotifyStore` is the production implementation; `MemoryNotifyStore` is for tests.
 */
export interface NotifyStore {
  upsertContact(contact: Contact): Promise<void>;
  deleteContact(userId: string): Promise<void>;
  getContact(userId: string): Promise<Contact | null>;

  getPreferences(userId: string): Promise<PreferenceRow[]>;
  setPreferences(userId: string, prefs: Partial<Record<NotificationType, boolean>>): Promise<void>;

  /** Inserts a row; returns null when `dedupeKey` already exists. */
  insertNotification(row: NewNotification): Promise<NotificationRow | null>;
  /** Leases one queued, due row and bumps `attempts`; null if not claimable. */
  claimById(id: string, leaseMs: number): Promise<NotificationRow | null>;
  /** Leases up to `limit` queued, due rows (oldest first) and bumps `attempts`. */
  claimDue(limit: number, leaseMs: number): Promise<NotificationRow[]>;
  markSent(id: string, providerMessageId: string | null): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  /** `retryAt` null means a terminal failure (status `failed`); otherwise it stays queued until then. */
  markFailed(id: string, error: string, retryAt: Date | null): Promise<void>;
}
