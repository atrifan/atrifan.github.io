'use client';

// The chats of one device: a sidebar from 960px, a modal drawer on phones. Each chat
// can be opened, renamed in place or deleted after an inline confirmation.

import { useEffect, useRef, useState } from 'react';
import type { RelaySession } from './frames';
import type { ChatDevice } from './ChatApp';
import { relativeTime } from './model/presence';
import { sessionTitle } from './model/message-groups';

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
      <button
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
      </button>
      <button type="button" className="chat-icon-btn is-danger" aria-label={`Delete chat ${title}`} onClick={() => setMode('confirm')}>
        <TrashIcon />
      </button>
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
      {loading && sessions.length === 0 ? (
        <p className="chat-drawer-note">Loading chats…</p>
      ) : sessions.length === 0 ? (
        <p className="chat-drawer-note">No chats yet. Your conversations with this assistant appear here.</p>
      ) : (
        <ul role="list" className="chat-sessions">
          {sessions.map((s) => (
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
        </ul>
      )}
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
