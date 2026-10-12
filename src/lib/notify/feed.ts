/**
 * The notification feed's request parsing, cursors and the bell's text. Pure, shared by the
 * /api/notifications routes and the client (bell, hub /notifications).
 */
import { SURFACES, surfaceUrl, type Surface } from '../surface-url.ts';
import { isNotificationType, type NotificationType } from './types.ts';

export const FEED_DEFAULT_LIMIT = 20;
export const FEED_MAX_LIMIT = 50;
export const READ_MAX_IDS = 100;

export interface FeedCursor {
  /** `updated_at` of the last item on the previous page (ISO). */
  at: string;
  id: string;
}

export interface FeedQuery {
  limit: number;
  cursor: FeedCursor | null;
  unreadOnly: boolean;
  surface: Surface | null;
  type: NotificationType | null;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Cursors are made and read on the server only (the API routes), so Node's base64url is available.
function b64urlDecode(s: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return Buffer.from(s, 'base64url').toString('utf8');
}

export function encodeCursor(c: FeedCursor): string {
  return Buffer.from(`${c.at}|${c.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(s: string): FeedCursor | null {
  const raw = b64urlDecode(s);
  if (!raw) return null;
  const sep = raw.indexOf('|');
  if (sep < 0) return null;
  const at = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!ID_RE.test(id) || Number.isNaN(Date.parse(at))) return null;
  return { at, id };
}

export type FeedQueryResult = { ok: true; query: FeedQuery } | { ok: false; error: string };

export function parseFeedQuery(params: URLSearchParams): FeedQueryResult {
  const n = Number.parseInt(params.get('limit') ?? '', 10);
  const limit = Number.isNaN(n) ? FEED_DEFAULT_LIMIT : Math.min(FEED_MAX_LIMIT, Math.max(1, n));
  const unread = params.get('unread');
  const unreadOnly = unread === '1' || unread === 'true';

  const surfaceRaw = params.get('surface') || '';
  if (surfaceRaw && !(SURFACES as readonly string[]).includes(surfaceRaw)) return { ok: false, error: 'unknown surface' };
  const typeRaw = params.get('type') || '';
  if (typeRaw && !isNotificationType(typeRaw)) return { ok: false, error: 'unknown type' };
  const cursorRaw = params.get('cursor') || '';
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) return { ok: false, error: 'bad cursor' };

  return {
    ok: true,
    query: {
      limit,
      cursor,
      unreadOnly,
      surface: (surfaceRaw || null) as Surface | null,
      type: (typeRaw || null) as NotificationType | null,
    },
  };
}

export type ReadTarget = { ids: string[] } | { all: true };

/** `{ ids: [...] }` (1–100 ids) or `{ all: true }`. */
export function parseReadBody(body: unknown): { ok: true; target: ReadTarget } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be { ids: string[] } or { all: true }' };
  const b = body as Record<string, unknown>;
  if (b.all === true) return { ok: true, target: { all: true } };
  if (Array.isArray(b.ids) && b.ids.length > 0 && b.ids.length <= READ_MAX_IDS && b.ids.every((x) => typeof x === 'string' && ID_RE.test(x))) {
    return { ok: true, target: { ids: [...new Set(b.ids as string[])] } };
  }
  return { ok: false, error: 'Body must be { ids: string[] } (1–100 ids) or { all: true }' };
}

/** Rows fetched with `limit + 1`: the page plus a cursor when there is more. */
export function pageOf<T extends { id: string; updatedAt: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? encodeCursor({ at: last.updatedAt, id: last.id }) : null };
}

export function badgeText(unread: number): string {
  if (unread <= 0) return '';
  return unread > 99 ? '99+' : String(unread);
}

export function bellLabel(unread: number): string {
  return unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
}

/** What the live region says after a poll: only growth, never on the first load. */
export function newItemsMessage(previous: number | null, next: number): string {
  if (previous === null || next <= previous) return '';
  const d = next - previous;
  return d === 1 ? '1 new notification' : `${d} new notifications`;
}

/** The item's link: its path on its surface. A stored absolute or protocol-relative URL is dropped. */
export function itemHref(item: { surface: Surface; url: string }, rootDomain?: string): string {
  const surface = (SURFACES as readonly string[]).includes(item.surface) ? item.surface : 'hub';
  const path = item.url.startsWith('/') && !item.url.startsWith('//') ? item.url : '/';
  return surfaceUrl(surface, path, rootDomain === undefined ? undefined : { rootDomain });
}
