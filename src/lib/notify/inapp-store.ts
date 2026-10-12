import type { FeedQuery, ReadTarget } from './feed.ts';
import type { ExistingInApp, InAppWritePlan, NewInAppRow } from './inapp.ts';
import type { NotificationType, PreferenceRow } from './types.ts';
import type { Surface } from './urls.ts';

/** A stored in-app item. */
export interface InAppRow {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  surface: Surface;
  url: string;
  count: number;
  readAt: string | null;
  createdAt: string;
  /** Ordering key: the last event (aggregates move up when bumped). Kept as the store returns it. */
  updatedAt: string;
  dedupeKey: string;
}

export type BumpPatch = Extract<InAppWritePlan, { kind: 'bump' }>['patch'];

/**
 * Persistence for the in-app feed. `SupabaseInAppStore` (service role, PostgREST) in production
 * and the Docker harness; `MemoryInAppStore` for unit tests. Every read and write of feed rows
 * is scoped to one user id.
 */
export interface InAppStore {
  getPreferences(userId: string): Promise<PreferenceRow[]>;
  /** Sets the in-app switch for `types` (one group), leaving the email choice alone. */
  setInAppPreferences(userId: string, types: NotificationType[], enabled: boolean): Promise<void>;

  findByDedupe(dedupeKey: string): Promise<ExistingInApp | null>;
  /** Inserts with created/updated = `at`. null when the key already exists (lost a race). */
  insert(row: NewInAppRow, at: string): Promise<ExistingInApp | null>;
  /** Applies the patch only while the stored count is still `expectedCount`; false otherwise. */
  bump(id: string, expectedCount: number, patch: BumpPatch): Promise<boolean>;

  /** Newest first, `query.limit + 1` rows so the caller can tell if there is a next page. */
  list(userId: string, query: FeedQuery): Promise<InAppRow[]>;
  unreadCount(userId: string): Promise<number>;
  /** Marks the user's unread items read; returns how many changed. */
  markRead(userId: string, target: ReadTarget, now?: Date): Promise<number>;
}
