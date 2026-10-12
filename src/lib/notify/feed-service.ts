/**
 * The in-app feed for the /api/notifications routes. Every call is scoped to one user.
 */
import { pageOf, type FeedQuery, type ReadTarget } from './feed.ts';
import type { InAppRow, InAppStore } from './inapp-store.ts';
import { getInAppStore } from './notify.ts';

/** What the API returns per item (no user id, no dedupe key). */
export interface FeedItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  surface: InAppRow['surface'];
  url: string;
  count: number;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const toItem = (r: InAppRow): FeedItem => ({
  id: r.id,
  type: r.type,
  title: r.title,
  body: r.body,
  surface: r.surface,
  url: r.url,
  count: r.count,
  readAt: r.readAt,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export async function listFeed(
  userId: string,
  query: FeedQuery,
  store: InAppStore = getInAppStore(),
): Promise<{ items: FeedItem[]; nextCursor: string | null; unreadCount: number }> {
  const [rows, unreadCount] = await Promise.all([store.list(userId, query), store.unreadCount(userId)]);
  const page = pageOf(rows, query.limit);
  return { items: page.items.map(toItem), nextCursor: page.nextCursor, unreadCount };
}

export async function markFeedRead(userId: string, target: ReadTarget, store: InAppStore = getInAppStore()): Promise<{ updated: number; unreadCount: number }> {
  const updated = await store.markRead(userId, target);
  return { updated, unreadCount: await store.unreadCount(userId) };
}

export async function feedUnreadCount(userId: string, store: InAppStore = getInAppStore()): Promise<number> {
  return store.unreadCount(userId);
}
