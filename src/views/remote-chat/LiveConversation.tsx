'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LiveRelayClient } from './live-relay-client';
import type { Command, LogicalFrame, SessionRow, Snapshot, WatchEvent } from './live-relay-contract';

type Projection = { snapshot: Snapshot; through: number; messages: Snapshot['messages'] };
type Props = { row: SessionRow | null; client: LiveRelayClient | null; retry: () => void; creating: boolean };
const MAX_TRANSCRIPT = 32 * 1024 * 1024;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function LiveConversation({ row, client, retry, creating }: Props) {
  const [projection, setProjection] = useState<Projection | null>(null);
  const projectionRef = useRef<Projection | null>(null);
  const [status, setStatus] = useState('Assistant unavailable. Retry to connect.');
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const [pending, setPending] = useState<Command['kind'] | null>(null);
  const [watchAttempt, setWatchAttempt] = useState(0);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRevision = useRef<string | null>(null);
  const pendingRef = useRef<{ kind: Command['kind'] } | null>(null);
  const watchRef = useRef<{ id: string; requestId: string; lease: number } | null>(null);
  const currentClient = useRef(client); currentClient.current = client;
  const logRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const scrollTarget = useRef<number | null>(null);

  useEffect(() => {
    projectionRef.current = null; setProjection(null);
    draftRef.current = ''; setDraft('');
    setHistoryCursor(null); historyRevision.current = null;
  }, [row?.sessionId]);

  useEffect(() => {
    if (!client || !row || !row.capabilities.watch) { setStatus('Assistant unavailable. Retry to connect.'); return; }
    let active = true;
    let watchRequest = '';
    const watchId = crypto.randomUUID();
    let leaseTimer: ReturnType<typeof setTimeout> | undefined;
    let renewal: ReturnType<typeof setInterval> | undefined;
    let buffer: WatchEvent[] = [];
    let bufferBytes = 0;
    projectionRef.current = null;
    watchRef.current = null;
    pendingRef.current = null; setPending(null);
    setStatus('Attaching to conversation…');

    const fail = (message: string) => {
      if (!active) return;
      clearTimeout(leaseTimer); clearInterval(renewal);
      watchRef.current = null; pendingRef.current = null; setPending(null);
      setStatus(message);
    };
    const lease = (time: string) => {
      const expiry = Date.parse(time);
      const now = client.upperNow();
      if (!client.authorized() || expiry <= now || expiry > client.expiresAt() || expiry > now + 15000) throw new Error('invalid_watch_lease');
      const current = watchRef.current;
      if (!current) throw new Error('missing_watch');
      current.lease = expiry;
      clearTimeout(leaseTimer);
      leaseTimer = setTimeout(() => fail('Watch expired. Reattach to control this conversation.'), Math.max(0, expiry - now));
    };
    const apply = (current: Projection, event: WatchEvent): Projection => {
      if (event.eventSeq <= current.through) return current;
      if (event.eventSeq !== current.through + 1) throw new Error('event_gap');
      if (event.change.kind === 'state') return { ...current, through: event.eventSeq, snapshot: { ...current.snapshot, ...event.change } };
      const item = event.change.message;
      const messages = [...current.messages.filter((message) => message.id !== item.id), item].sort((a, b) => a.position - b.position);
      if (bytes(messages) > MAX_TRANSCRIPT) throw new Error('transcript_limit');
      return { ...current, through: event.eventSeq, messages };
    };
    const frame = (value: LogicalFrame) => {
      if (!active || currentClient.current !== client || !client.authorized()) return;
      try {
        if (value.type === 'WATCH_EVENT') {
          if (projectionRef.current && (!watchRef.current || client.upperNow() >= watchRef.current.lease)) throw new Error('expired_watch');
          if (!projectionRef.current) {
            const existing = buffer.find((item) => item.eventSeq === value.eventSeq);
            if (existing && JSON.stringify(existing) !== JSON.stringify(value)) throw new Error('conflicting_event');
            if (!existing) { bufferBytes += bytes(value); if (buffer.length >= 1000 || bufferBytes > 8 * 1024 * 1024) throw new Error('event_limit'); buffer.push(value); }
            return;
          }
          const next = apply(projectionRef.current, value);
          projectionRef.current = next; setProjection(next);
          if (value.eventSeq === next.through && value.change.kind === 'state' && value.change.state === 'idle' && pendingRef.current?.kind === 'stop') {
            pendingRef.current = null; setPending(null);
          }
        } else if (value.type === 'WATCH_SNAPSHOT') {
          if (projectionRef.current || value.sessionId !== row.sessionId || value.watchId !== watchId) return;
          if (bytes(value.messages) > MAX_TRANSCRIPT) throw new Error('transcript_limit');
          watchRequest = value.requestId;
          watchRef.current = { id: watchId, requestId: watchRequest, lease: 0 };
          lease(value.leaseExpiresAt);
          let next: Projection = { snapshot: value, through: value.through, messages: [...value.messages].sort((a, b) => a.position - b.position) };
          for (const event of buffer.sort((a, b) => a.eventSeq - b.eventSeq)) next = apply(next, event);
          buffer = []; bufferBytes = 0;
          projectionRef.current = next; setProjection(next);
          setHistoryCursor(value.historyCursor); historyRevision.current = null;
          setStatus(value.historyComplete ? 'Attached to conversation' : 'Some conversation history is unavailable. Controls are read-only.');
          renewal = setInterval(() => {
            if (!active || !watchRef.current || !client.authorized() || client.upperNow() >= watchRef.current.lease) { fail('Watch expired. Reattach to control this conversation.'); return; }
            void client.request({ kind: 'watch.renew', sessionId: row.sessionId, watchId }).then((result) => {
              if (!active || result.type !== 'WATCH_RENEWED') return;
              try { lease(result.leaseExpiresAt); } catch { fail('Watch expired. Reattach to control this conversation.'); }
            }).catch(() => fail('Watch renewal failed. Reattach to control this conversation.'));
          }, 5000);
        }
      } catch { fail('Conversation is out of sync. Reattach to control it.'); }
    };
    queueMicrotask(() => {
      if (!active) return;
      void client.request({ kind: 'watch.attach', sessionId: row.sessionId, watchId }, frame).then((result) => {
        if (!active && result.type === 'WATCH_SNAPSHOT') {
          client.forgetWatch(result.requestId);
          if (client.authorized()) void client.request({ kind: 'watch.detach', sessionId: row.sessionId, watchId }).catch(() => {});
        }
      }).catch(() => fail('Could not attach to this conversation.'));
    });
    return () => {
      active = false;
      clearTimeout(leaseTimer); clearInterval(renewal);
      buffer = []; bufferBytes = 0;
      watchRef.current = null; pendingRef.current = null;
      if (watchRequest) {
        client.forgetWatch(watchRequest);
        if (client.authorized()) void client.request({ kind: 'watch.detach', sessionId: row.sessionId, watchId }).catch(() => {});
      }
    };
  }, [client, row, watchAttempt]);

  useLayoutEffect(() => {
    const element = logRef.current;
    if (!followRef.current || !element) return;
    const target = Math.max(0, element.scrollHeight - element.clientHeight);
    if (Math.abs(element.scrollTop - target) > 1) {
      scrollTarget.current = target;
      element.scrollTop = target;
    }
  }, [projection]);

  const allowed = (action: 'reply' | 'answer' | 'stop') => {
    const current = projectionRef.current?.snapshot;
    const watch = watchRef.current;
    if (!row || !client || currentClient.current !== client || !client.authorized() || !watch || client.upperNow() >= watch.lease || !current?.historyComplete || pendingRef.current || !row.capabilities[action]) return false;
    if (action === 'stop') return current.state === 'running' && !!current.loopId;
    if (action === 'answer') return current.state === 'waiting' && !!current.pending;
    return (current.state === 'running' || current.state === 'idle') && !current.pending;
  };
  async function issue(command: Command, expectedVersion: string | undefined) {
    const action = command.kind === 'answer' ? 'answer' : command.kind;
    const current = projectionRef.current?.snapshot;
    const watch = watchRef.current;
    if (!client || !row || !current || !watch || !allowed(action) || !expectedVersion || expectedVersion !== current.stateVersion) return;
    if (command.kind === 'answer' && command.requestId !== current.pending?.requestId) return;
    if (command.kind === 'stop' && command.loopId !== current.loopId) return;
    if ('text' in command && (!command.text.trim() || new TextEncoder().encode(command.text).byteLength > 32768)) return;
    const issued = { kind: command.kind };
    pendingRef.current = issued; setPending(command.kind);
    const sentDraft = draftRef.current;
    try {
      const result = await client.request({ kind: 'command', sessionId: row.sessionId, watchId: watch.id, commandId: crypto.randomUUID(), stateVersion: current.stateVersion, command });
      if (currentClient.current !== client || watchRef.current !== watch || pendingRef.current !== issued) return;
      if (result.type !== 'COMMAND_RESULT' || result.outcome !== 'applied') throw new Error('rejected');
      if (command.kind !== 'stop' && draftRef.current === sentDraft) { draftRef.current = ''; setDraft(''); }
      pendingRef.current = null; setPending(null);
    } catch {
      if (currentClient.current === client && watchRef.current === watch && pendingRef.current === issued) {
        watchRef.current = null; pendingRef.current = null; setPending(null);
        setStatus('Command outcome unavailable. Reattach before trying again.');
      }
    }
  }
  function send() {
    const text = draftRef.current.trim();
    const current = projectionRef.current?.snapshot;
    if (!text || !current) return;
    const expectedVersion = projection?.snapshot.stateVersion;
    if (current.state === 'waiting' && current.pending?.kind === 'question') void issue({ kind: 'answer', requestId: current.pending.requestId, text }, expectedVersion);
    else void issue({ kind: 'reply', text }, expectedVersion);
  }
  async function loadHistory() {
    const watch = watchRef.current;
    const cursor = historyCursor;
    if (!client || !row || !watch || !cursor || historyLoading || !client.authorized() || client.upperNow() >= watch.lease) return;
    setHistoryLoading(true);
    try {
      const result = await client.request({ kind: 'history.read', sessionId: row.sessionId, cursor, limit: 100 });
      if (currentClient.current !== client || watchRef.current !== watch || result.type !== 'HISTORY_RESULT') return;
      if (historyRevision.current && historyRevision.current !== result.revision) throw new Error('history_changed');
      historyRevision.current = result.revision;
      const current = projectionRef.current;
      if (!current) return;
      const merged = [...result.messages.filter((entry) => !current.messages.some((item) => item.id === entry.id)), ...current.messages].sort((a, b) => a.position - b.position);
      if (bytes(merged) > MAX_TRANSCRIPT) throw new Error('transcript_limit');
      const next = { ...current, messages: merged };
      projectionRef.current = next; setProjection(next); setHistoryCursor(result.nextCursor);
    } catch { setStatus('Could not load history. Conversation remains read-only.'); }
    finally { setHistoryLoading(false); }
  }
  const current = projection?.snapshot;
  const canSend = allowed(current?.state === 'waiting' ? 'answer' : 'reply') && current?.pending?.kind !== 'approval';

  return <div className="chat-view native-session-chat">
    <div className="chat-banner" role="status">{status}{current?.state === 'idle' && watchRef.current && <> · <span>Idle</span></>}{!client && <button type="button" className="btn btn-secondary" onClick={retry}>Retry</button>}{client && row && !watchRef.current && status !== 'Attaching to conversation…' && <button type="button" className="btn btn-secondary" onClick={() => setWatchAttempt((value) => value + 1)}>Reattach</button>}</div>
    <div className="message-list chat-log" role="log" aria-label="Conversation" aria-live="polite" ref={logRef} onScroll={(event) => {
      const element = event.currentTarget;
      if (scrollTarget.current !== null && Math.abs(element.scrollTop - scrollTarget.current) <= 1) { scrollTarget.current = null; return; }
      scrollTarget.current = null;
      followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60;
    }}>
      {historyCursor && <button type="button" className="btn btn-secondary" disabled={historyLoading || !client} onClick={() => void loadHistory()}>Load earlier messages</button>}
      {projection?.messages.map((message) => <article key={message.id} className={`chat-message is-${message.role}`} aria-label={message.role === 'user' ? 'You' : 'Assistant'}>
        <div className={`bubble-wrap ${message.role}`}><div className={`bubble ${message.role}`}>
          {message.role === 'user' ? message.text : <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ alt }) => <span>{alt || 'Image unavailable in this transcript'}</span> }}>{message.text}</ReactMarkdown>}
        </div></div>
      </article>)}
      {current?.pending && <section className={`chat-card native-pending${current.pending.kind === 'approval' ? ' is-approval' : ''}`} aria-label={current.pending.kind === 'approval' ? 'Approval needed' : 'Question'}>
        <div className="native-pending-body"><p>{current.pending.prompt}</p>
          {current.pending.kind === 'approval' && <div className="action-approval-actions">{(['approve', 'deny'] as const).map((decision) => <button key={decision} className={`action-approval-btn action-approval-btn-${decision}`} type="button" disabled={!allowed('answer')} onClick={() => { const target = current.pending; if (target?.kind === 'approval') void issue({ kind: 'answer', requestId: target.requestId, decision }, current.stateVersion); }}>{decision === 'approve' ? 'Approve' : 'Deny'}</button>)}</div>}
        </div>
      </section>}
    </div>
    <div className="input-area chat-composer">
      {pending && <p role="status">{pending === 'stop' ? 'Stopping…' : 'Sent, awaiting assistant'}</p>}
      <div className="chat-composer-box">
        <textarea className="input-field" aria-label="Message" placeholder="Message your assistant…" rows={1} value={draft} disabled={creating || (!!row && (!client || !watchRef.current))} onChange={(event) => { draftRef.current = event.target.value; setDraft(event.target.value); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
        <div className="chat-composer-tools"><span className="chat-spacer" />
          {current?.state === 'running' && <button className="btn btn-secondary" type="button" disabled={!allowed('stop')} onClick={() => { const loopId = current.loopId; if (loopId) void issue({ kind: 'stop', loopId }, current.stateVersion); }}>Stop</button>}
          <button className="send-btn" type="button" aria-label="Send" disabled={!draft.trim() || !canSend} onClick={send}>↑</button>
        </div>
      </div>
    </div>
  </div>;
}
