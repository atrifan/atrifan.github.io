'use client';

// The chats of one device: a sidebar from 960px, a modal drawer on phones. Each chat
// can be opened, renamed in place or deleted after an inline confirmation.

import { useEffect, useRef, useState } from 'react';
import type { RelaySession } from './frames';
import type { ChatDevice } from './ChatApp';
import { relativeTime } from './model/presence';
import { sessionTitle } from './model/message-groups';
import { historyGroup, lastActivity, liveTime, surfaceLabel } from './model/session-list';
import { INTEGRATION_UNAVAILABLE } from './session-contract';

interface Props {
  devices: ChatDevice[];
  deviceId: string | null;
  onChooseDevice: (id: string) => void;
  sessions: RelaySession[];
  loading: boolean;
  activeId: string | null;
  now: number;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /** Phone layout: a modal dialog that is only rendered while open. */
  modal: boolean;
  open: boolean;
  onClose: () => void;
  tab: 'active' | 'history';
  onTab: (tab: 'active' | 'history') => void;
  nextCursor: string | null;
  incomplete: boolean;
  unavailable: boolean;
  onMore: () => void;
  listError: string | null;
  onRetry: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PencilIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
  </svg>
);
const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

function SessionRow({
  session,
  active,
  now,
  onOpen,
  onRename,
  onDelete,
}: {
  session: RelaySession;
  active: boolean;
  now: number;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<'view' | 'rename' | 'confirm'>('view');
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLButtonElement>(null);
  const title = sessionTitle(session);
  const updated = relativeTime(session.updated_at, now);
  const metaId = `chat-meta-${session.id}`;

  useEffect(() => {
    if (mode === 'rename') inputRef.current?.select();
  }, [mode]);

  const back = () => {
    setMode('view');
    requestAnimationFrame(() => renameRef.current?.focus());
  };

  if (mode === 'rename') {
    return (
      <li className="chat-session is-editing">
        <form
          className="chat-session-edit"
          onSubmit={(e) => {
            e.preventDefault();
            const next = draft.trim();
            if (next && next !== session.title) onRename(next);
            back();
          }}
        >
          <input
            ref={inputRef}
            className="chat-input-text"
            aria-label="Chat title"
            value={draft}
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                back();
              }
            }}
          />
          <div className="chat-session-edit-actions">
            <button type="submit" className="btn btn-primary btn-sm">
              Save
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={back}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  if (mode === 'confirm') {
    return (
      <li className="chat-session is-confirming">
        <p className="chat-session-confirm">Delete this chat?</p>
        <p className="chat-session-confirm-title">{title}</p>
        <div className="chat-session-edit-actions">
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete}>
            Delete
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={back} autoFocus>
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className={`chat-session${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className="chat-session-open"
        aria-label={title}
        aria-current={active ? 'page' : undefined}
        aria-describedby={updated ? metaId : undefined}
        onClick={onOpen}
      >
        <span className="chat-session-title">{title}</span>
        {updated && (
          // Not part of the button name (that is the title); announced as its description.
          <span id={metaId} className="chat-session-meta" aria-hidden="true">
            {updated}
          </span>
        )}
      </button>
      <div className="chat-row-details">
        <span className="chat-session-badge">{session.native ? surfaceLabel(session.native.surface) : 'Web chat'}</span>
        {session.native && <span className="chat-session-badge">{({ running: 'Running', waiting: 'Waiting on you', idle: 'Idle', unknown: 'Status unavailable' })[session.native.state]}</span>}
        {session.snippet && <span className="chat-session-snippet">{session.snippet}</span>}
        {session.domain && <span className="chat-session-badge">{session.domain}</span>}
        {Number.isFinite(lastActivity(session)) && <time dateTime={new Date(lastActivity(session)).toISOString()}>{new Date(lastActivity(session)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>}
      </div>
      {!session.native && <button
        ref={renameRef}
        type="button"
        className="chat-icon-btn"
        aria-label={`Rename chat ${title}`}
        onClick={() => {
          setDraft(session.title ?? '');
          setMode('rename');
        }}
      >
        <PencilIcon />
      </button>}
      {!session.native && <button type="button" className="chat-icon-btn is-danger" aria-label={`Delete chat ${title}`} onClick={() => setMode('confirm')}>
        <TrashIcon />
      </button>}
    </li>
  );
}

export function SessionsDrawer(props: Props) {
  const { devices, deviceId, onChooseDevice, sessions, loading, activeId, now, modal, open, onClose } = props;
  const panelRef = useRef<HTMLDivElement>(null);

  // Modal drawer: focus moves in, Tab stays inside, Escape closes.
  useEffect(() => {
    if (!modal || !open) return;
    const panel = panelRef.current;
    const items = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    (panel?.querySelector<HTMLElement>('.chat-new') ?? items()[0])?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (current === first || !list.includes(current!))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !list.includes(current!))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal, open, onClose]);

  if (!open) return null;

  const body = (
    <>
      <div className="chat-drawer-head">
        <h2 className="chat-drawer-title">Chats</h2>
        {modal && (
          <button type="button" className="chat-icon-btn" aria-label="Close chats" onClick={onClose}>
            <CloseIcon />
          </button>
        )}
      </div>
      {devices.length > 1 && (
        <label className="chat-device-select">
          <span>Assistant</span>
          <select value={deviceId ?? ''} onChange={(e) => onChooseDevice(e.target.value)}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.device_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="btn btn-primary chat-new" onClick={props.onNew}>
        <PlusIcon />
        New chat
      </button>
      <div className="chat-tabs" role="tablist" aria-label="Conversations" onKeyDown={(event) => {
        let next: 'active' | 'history';
        if (event.key === 'Home') next = 'active';
        else if (event.key === 'End') next = 'history';
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = props.tab === 'active' ? 'history' : 'active';
        else return;
        event.preventDefault();
        props.onTab(next);
        document.getElementById(`chat-tab-${next}`)?.focus();
      }}>
        {(['active', 'history'] as const).map((tab) => <button key={tab} type="button" role="tab" id={`chat-tab-${tab}`} aria-controls="chat-list-panel" aria-selected={props.tab === tab} tabIndex={props.tab === tab ? 0 : -1} onClick={() => props.onTab(tab)}>{tab === 'active' ? `Active (${sessions.filter((s) => s.native?.state === 'running' || s.native?.state === 'waiting').length})` : 'History'}</button>)}
      </div>
      <div role="tabpanel" id="chat-list-panel" aria-labelledby={`chat-tab-${props.tab}`}>
      {props.listError && <p role="alert">{props.listError} <button type="button" className="btn btn-secondary" onClick={props.onRetry}>Retry chats</button></p>}
      {props.unavailable && <p className="chat-drawer-note">{INTEGRATION_UNAVAILABLE}</p>}
      {props.incomplete && <p className="chat-drawer-note">Conversation catalog is incomplete. Some chats are unavailable.</p>}
      {loading && sessions.length === 0 ? (
        <p className="chat-drawer-note">Loading chats…</p>
      ) : (props.listError || props.unavailable) && sessions.length === 0 ? null : props.tab === 'active' ? (
        <ul role="list" className="chat-sessions chat-active-sessions">
          {sessions.filter((s) => s.native?.state === 'running' || s.native?.state === 'waiting').map((s) => <li key={s.id} className="chat-active-row">
            <span className="chat-session-title">{sessionTitle(s)}</span>
            <span className="chat-session-badge">{surfaceLabel(s.native?.surface)}</span>
            <span className="chat-live-label"><span className="chat-presence-dot" aria-hidden="true" />{s.native?.state === 'waiting' ? 'Needs you' : 'Streaming'}</span>
            {liveTime(s.native?.startedAt, now) && <span>Started {liveTime(s.native?.startedAt, now)}</span>}
            {liveTime(s.native?.lastChunkAt, now) && <span>Last output {liveTime(s.native?.lastChunkAt, now)}</span>}
            {s.id === activeId && <span>This chat</span>}
            <button type="button" className="btn btn-secondary" onClick={() => props.onOpen(s.id)}>{s.id === activeId ? 'Open' : 'Attach'}</button>
          </li>)}
          {!sessions.some((s) => s.native?.state === 'running' || s.native?.state === 'waiting') && <li className="chat-drawer-note">Nothing is running right now.</li>}
        </ul>
      ) : sessions.length === 0 ? (
        <p className="chat-drawer-note">No chats yet. Your conversations with this assistant appear here.</p>
      ) : (
        <>{(['Today', 'Yesterday', 'This week', 'Older'] as const).map((group) => {
          const rows = sessions.filter((s) => historyGroup(s, now) === group);
          return rows.length > 0 && <section key={group} className="chat-history-group" aria-label={group}><h3>{group}</h3><ul role="list" className="chat-sessions">
          {rows.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={s.id === activeId}
              now={now}
              onOpen={() => props.onOpen(s.id)}
              onRename={(t) => props.onRename(s.id, t)}
              onDelete={() => props.onDelete(s.id)}
            />
          ))}
        </ul></section>;
        })}</>
      )}
      {props.nextCursor && <button type="button" className="btn btn-secondary" disabled={loading} onClick={props.onMore}>Load more chats</button>}
      </div>
    </>
  );

  if (modal) {
    return (
      <div className="chat-drawer-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div ref={panelRef} id="chat-drawer" className="chat-drawer is-modal" role="dialog" aria-modal="true" aria-label="Chats">
          {body}
        </div>
      </div>
    );
  }
  return (
    <nav id="chat-drawer" className="chat-drawer" aria-label="Chats">
      {body}
    </nav>
  );
}
