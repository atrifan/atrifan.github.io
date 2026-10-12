'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { badgeText, bellLabel, itemHref, newItemsMessage } from '@/src/lib/notify/feed';
import { surfaceUrl } from '@/src/lib/surface-url';
import { formatDay } from '@/src/lib/activity/format';
import type { Surface } from '@/src/lib/surface-url';

/**
 * The header bell (signed-in users, every surface): unread badge, a dropdown with the latest
 * 10 items, "Mark all read" and "See all" (hub /notifications).
 *
 * - The count is polled every 30s while the tab is visible (and on becoming visible); a
 *   growing count is announced in a polite live region.
 * - The dropdown is a non-modal dialog: focus moves into it on open, Escape closes it and
 *   returns focus to the bell, clicking or tabbing outside closes it.
 * - Below 960px it is a full-width sheet under the header.
 * - Other views (hub /notifications) dispatch `tulzo:notifications-changed` after marking
 *   items read, so the badge follows.
 */

export interface BellItem {
  id: string;
  title: string;
  body: string | null;
  surface: Surface;
  url: string;
  readAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export const NOTIFICATIONS_CHANGED = 'tulzo:notifications-changed';
const POLL_MS = 30_000;
const LIMIT = 10;

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function postRead(body: { ids: string[] } | { all: true }): Promise<{ unreadCount: number } | null> {
  try {
    const res = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    return res.ok ? ((await res.json()) as { unreadCount: number }) : null;
  } catch {
    return null;
  }
}

export function NotificationBell() {
  const [count, setCount] = useState<number | null>(null);
  const [items, setItems] = useState<BellItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const lastCount = useRef<number | null>(null);
  const openRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const headingId = useId();

  const loadList = useCallback(async () => {
    const body = await getJson<{ items: BellItem[]; unreadCount: number }>(`/api/notifications?limit=${LIMIT}`);
    if (!body) {
      setItems((prev) => prev ?? []);
      return;
    }
    setItems(body.items.slice(0, LIMIT));
    lastCount.current = body.unreadCount;
    setCount(body.unreadCount);
  }, []);

  const poll = useCallback(async () => {
    const body = await getJson<{ count: number }>('/api/notifications/unread-count');
    if (!body || typeof body.count !== 'number') return;
    const message = newItemsMessage(lastCount.current, body.count);
    if (message) {
      setAnnouncement(message);
      if (openRef.current) void loadList();
    }
    lastCount.current = body.count;
    setCount(body.count);
  }, [loadList]);

  // Poll while visible; refresh on becoming visible and when another view marks items read.
  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    const onChanged = () => {
      void poll();
      if (openRef.current) void loadList();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    };
  }, [poll, loadList]);

  const close = useCallback((restoreFocus: boolean) => {
    openRef.current = false;
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  const toggle = () => {
    if (openRef.current) {
      close(false);
      return;
    }
    openRef.current = true;
    setOpen(true);
    void loadList();
  };

  // Focus into the dialog on open; Escape, outside clicks and focus leaving close it.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    // The dialog itself takes focus (it is labelled "Notifications"); Tab then walks its items.
    dialog?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    const onFocus = (e: FocusEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open, close]);

  const unread = count ?? 0;
  const anyUnread = unread > 0 || (items ?? []).some((i) => !i.readAt);

  const markAll = async () => {
    const res = await postRead({ all: true });
    if (!res) return;
    const now = new Date().toISOString();
    setItems((prev) => prev?.map((i) => (i.readAt ? i : { ...i, readAt: now })) ?? prev);
    lastCount.current = res.unreadCount;
    setCount(res.unreadCount);
  };

  const openItem = async (e: React.MouseEvent<HTMLAnchorElement>, item: BellItem) => {
    if (item.readAt || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const href = e.currentTarget.href;
    await Promise.race([postRead({ ids: [item.id] }), new Promise((r) => setTimeout(r, 1500))]);
    window.location.assign(href);
  };

  return (
    <div className="notif" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="notif-button"
        aria-label={bellLabel(unread)}
        aria-expanded={open}
        aria-controls={dialogId}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {badgeText(unread)}
          </span>
        )}
      </button>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      <div
        id={dialogId}
        ref={dialogRef}
        role="dialog"
        aria-labelledby={headingId}
        className="notif-panel"
        tabIndex={-1}
        hidden={!open}
      >
        <div className="notif-head">
          <h2 id={headingId} className="notif-title">
            Notifications
          </h2>
          <button type="button" className="notif-link-button" onClick={() => void markAll()} disabled={!anyUnread}>
            Mark all read
          </button>
        </div>
        {items === null ? (
          <p className="notif-empty">Loading…</p>
        ) : items.length === 0 ? (
          <p className="notif-empty">You&apos;re all caught up.</p>
        ) : (
          <ul className="notif-list" role="list">
            {items.map((item) => {
              const bodyId = `${dialogId}-${item.id}`;
              return (
                <li key={item.id}>
                  <a
                    href={itemHref(item)}
                    className="notif-item"
                    data-unread={item.readAt ? undefined : 'true'}
                    aria-label={item.readAt ? item.title : `Unread: ${item.title}`}
                    aria-describedby={item.body ? bodyId : undefined}
                    onClick={(e) => void openItem(e, item)}
                  >
                    <span className="notif-dot" aria-hidden="true" />
                    <span className="notif-text">
                      <span className="notif-item-title">{item.title}</span>
                      {item.body && (
                        <span id={bodyId} className="notif-item-body">
                          {item.body}
                        </span>
                      )}
                      <time className="notif-time" dateTime={item.updatedAt ?? item.createdAt}>
                        {formatDay(item.updatedAt ?? item.createdAt)}
                      </time>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        <div className="notif-foot">
          <a href={surfaceUrl('hub', '/notifications')} className="notif-all">
            See all notifications
          </a>
        </div>
      </div>
    </div>
  );
}
