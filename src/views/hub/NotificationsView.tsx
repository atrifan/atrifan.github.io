'use client';

/**
 * Hub /notifications: the whole in-app feed with filters (surface, type, unread only), mark
 * read one by one or all, and "Load more" (cursor pagination). A thin client over
 * GET /api/notifications and POST /api/notifications/read; the header bell is told to refresh
 * after a change.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDay } from '@/src/lib/activity/format';
import { itemHref } from '@/src/lib/notify/feed';
import { NOTIFICATION_LABELS, NOTIFICATION_TYPES } from '@/src/lib/notify/types';
import { NOTIFICATIONS_CHANGED, postRead, type BellItem } from '@/src/components/shell/NotificationBell';
import type { Surface } from '@/src/lib/surface-url';
import '@/styles/activity.css';

const SURFACE_OPTIONS: Array<{ value: '' | Surface; label: string }> = [
  { value: '', label: 'All surfaces' },
  { value: 'hub', label: 'Account' },
  { value: 'ai', label: 'AI' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'gigs', label: 'Gigs' },
  { value: 'chat', label: 'Chat' },
];
const SURFACE_LABEL: Record<Surface, string> = { hub: 'Account', ai: 'AI', marketplace: 'Marketplace', gigs: 'Gigs', chat: 'Chat' };

interface FeedItem extends BellItem {
  type: string;
  count?: number;
}

interface Filters {
  surface: string;
  type: string;
  unread: boolean;
}

function feedUrl(f: Filters, cursor?: string | null): string {
  const q = new URLSearchParams();
  if (f.surface) q.set('surface', f.surface);
  if (f.type) q.set('type', f.type);
  if (f.unread) q.set('unread', '1');
  if (cursor) q.set('cursor', cursor);
  const s = q.toString();
  return `/api/notifications${s ? `?${s}` : ''}`;
}

const announce = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

export function NotificationsView() {
  const [filters, setFilters] = useState<Filters>({ surface: '', type: '', unread: false });
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [status, setStatus] = useState('');
  const request = useRef(0);

  const load = useCallback(async (f: Filters) => {
    const id = ++request.current;
    setFailed(false);
    try {
      const res = await fetch(feedUrl(f), { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { items: FeedItem[]; nextCursor: string | null };
      if (id !== request.current) return;
      setItems(body.items);
      setNextCursor(body.nextCursor);
    } catch {
      if (id === request.current) {
        setItems([]);
        setNextCursor(null);
        setFailed(true);
      }
    }
  }, []);

  useEffect(() => {
    void load(filters);
  }, [filters, load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(feedUrl(filters, nextCursor), { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { items: FeedItem[]; nextCursor: string | null };
      setItems((prev) => [...(prev ?? []), ...body.items.filter((i) => !(prev ?? []).some((p) => p.id === i.id))]);
      setNextCursor(body.nextCursor);
    } catch {
      setStatus("Couldn't load more. Try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (item: FeedItem) => {
    const res = await postRead({ ids: [item.id] });
    if (!res) {
      setStatus("Couldn't mark it read. Try again.");
      return;
    }
    const now = new Date().toISOString();
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, readAt: now } : i)) ?? prev);
    setStatus('Marked read');
    announce();
  };

  const markAll = async () => {
    const res = await postRead({ all: true });
    if (!res) {
      setStatus("Couldn't mark everything read. Try again.");
      return;
    }
    const now = new Date().toISOString();
    setItems((prev) => prev?.map((i) => (i.readAt ? i : { ...i, readAt: now })) ?? prev);
    setStatus('All marked read');
    announce();
  };

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = Boolean(filters.surface || filters.type || filters.unread);
  const anyUnread = (items ?? []).some((i) => !i.readAt);

  return (
    <div className="page act-page">
      <header className="act-header">
        <h1>Notifications</h1>
        <p className="act-lede">Everything from Gigs, the Marketplace and your account, newest first.</p>
      </header>

      <section className="act-section" aria-labelledby="nc-filters-title">
        <div className="act-section-head">
          <h2 id="nc-filters-title" className="visually-hidden">
            Filters
          </h2>
        </div>
        <div className="act-filters">
          <div className="act-field">
            <label htmlFor="nc-surface">Surface</label>
            <select id="nc-surface" className="act-input" value={filters.surface} onChange={(e) => set({ surface: e.target.value })}>
              {SURFACE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="act-field">
            <label htmlFor="nc-type">Type</label>
            <select id="nc-type" className="act-input" value={filters.type} onChange={(e) => set({ type: e.target.value })}>
              <option value="">All types</option>
              {NOTIFICATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {NOTIFICATION_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <label className="act-check">
            <input type="checkbox" checked={filters.unread} onChange={(e) => set({ unread: e.target.checked })} />
            Unread only
          </label>
          <div className="act-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void markAll()} disabled={!anyUnread}>
              Mark all read
            </button>
          </div>
        </div>
      </section>

      <p className="visually-hidden" role="status">
        {status}
      </p>

      {items === null ? (
        <p className="act-note">Loading…</p>
      ) : failed ? (
        <p className="act-error">We couldn&apos;t load your notifications. Refresh to try again.</p>
      ) : items.length === 0 ? (
        <p className="act-empty">{filtered ? 'Nothing matches these filters' : 'No notifications yet'}</p>
      ) : (
        <>
          <ul className="nc-list" role="list" aria-label="Notifications">
            {items.map((item) => {
              const at = item.updatedAt ?? item.createdAt;
              return (
                <li key={item.id} className="nc-item" data-unread={item.readAt ? undefined : 'true'}>
                  <span className="nc-dot" aria-hidden="true" />
                  <div className="nc-main">
                    <a className="nc-title" href={itemHref(item)} aria-label={item.readAt ? item.title : `Unread: ${item.title}`}>
                      {item.title}
                    </a>
                    {item.body && <p className="nc-body">{item.body}</p>}
                    <div className="nc-meta">
                      <span className="nc-tag">{SURFACE_LABEL[item.surface] ?? item.surface}</span>
                      <time dateTime={at}>{formatDay(at)}</time>
                    </div>
                  </div>
                  {!item.readAt && (
                    <button type="button" className="nc-mark" aria-label={`Mark read: ${item.title}`} onClick={() => void markRead(item)}>
                      Mark read
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {nextCursor && (
            <div className="nc-more">
              <button type="button" className="btn btn-secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
