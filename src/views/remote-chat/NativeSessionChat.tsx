'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RelaySession } from './frames';
import { INTEGRATION_UNAVAILABLE, matchesWatch, parseNativeFrame, record, type NativeCommand } from './session-contract';
import { canControl, initialAttachment, reduceAttachment } from './model/session-attachment';
import { surfaceLabel } from './model/session-list';
import { watchNativeSession } from './native-session-port';

interface Props { session: RelaySession; deviceOnline: boolean; supported: boolean }
type Watch = ReturnType<typeof watchNativeSession>;
interface PendingCommand { id: string; kind: NativeCommand['kind']; text: string }

export function NativeSessionChat({ session, deviceOnline, supported }: Props) {
  const native = session.native!;
  const [projection, setProjection] = useState(initialAttachment);
  const stateRef = useRef(projection);
  const [status, setStatus] = useState<'attaching' | 'attached' | 'detached' | 'error'>('attaching');
  const statusRef = useRef(status);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const pendingRef = useRef<PendingCommand | null>(null);
  const watchRef = useRef<Watch | null>(null);
  const onlineRef = useRef(deviceOnline);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const draftKey = `nativeChatDraft:${session.api_key_id}:${session.id}:${native.sessionId}`;
  const logRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const commandTimer = useRef<ReturnType<typeof setTimeout>>();
  const attachTimer = useRef<ReturnType<typeof setTimeout>>();
  onlineRef.current = deviceOnline;

  function changeDraft(text: string) {
    draftRef.current = text;
    setDraft(text);
    try { if (text) localStorage.setItem(draftKey, text); else localStorage.removeItem(draftKey); } catch { /* private browsing */ }
  }
  function update(next: typeof projection) { stateRef.current = next; setProjection(next); }
  function changeStatus(next: typeof status) { statusRef.current = next; setStatus(next); }
  function clearCommand() { clearTimeout(commandTimer.current); pendingRef.current = null; setPending(null); }
  function fail(message: string) {
    clearTimeout(attachTimer.current);
    clearCommand();
    update({ ...stateRef.current, buffer: [], error: message });
    changeStatus('error');
    watchRef.current?.release(onlineRef.current);
    watchRef.current = null;
  }

  useEffect(() => {
    try { const text = localStorage.getItem(draftKey) ?? ''; draftRef.current = text; setDraft(text); } catch { /* unavailable */ }
  }, [draftKey]);

  useEffect(() => {
    if (!supported || !onlineRef.current) { changeStatus('detached'); return; }
    let active = true;
    update(initialAttachment());
    changeStatus('attaching');
    clearCommand();
    const watch = watchNativeSession({
      relayId: session.id, nativeSessionId: native.sessionId,
      onError: (message) => { if (active) fail(message); },
      onFrame: (raw) => {
        if (!active || statusRef.current === 'detached' || statusRef.current === 'error' || !matchesWatch(raw, watch.identity)) return;
        const frame = parseNativeFrame(raw);
        if (!frame) {
          if (record(raw) && ['SESSION_SNAPSHOT', 'SESSION_EVENT', 'SESSION_COMMAND_RESULT', 'SESSION_ERROR'].includes(String(raw.type))) fail('Could not attach to this conversation: malformed response.');
          return;
        }
        if (frame.type === 'SESSION_COMMAND_RESULT') {
          const current = pendingRef.current;
          if (!current || frame.commandId !== current.id) return;
          if (frame.outcome === 'rejected') { fail(`Command rejected: ${frame.reason || 'stale target'}. Reattach to review the current state.`); return; }
          clearCommand();
          if (current.kind !== 'stop' && draftRef.current === current.text) changeDraft('');
          return;
        }
        const next = reduceAttachment(stateRef.current, frame);
        update(next);
        if (next.error) { fail(next.error); return; }
        if (frame.type === 'SESSION_EVENT' && frame.change.kind === 'state' && frame.eventSeq === next.through && next.snapshot?.state === 'idle' && pendingRef.current?.kind === 'stop') clearCommand();
        if (next.snapshot) { clearTimeout(attachTimer.current); changeStatus('attached'); }
      },
    });
    watchRef.current = watch;
    attachTimer.current = setTimeout(() => { if (active) fail('Could not attach to this conversation: attachment timed out.'); }, 15_000);
    void watch.start();
    const unload = () => watch.release(onlineRef.current);
    window.addEventListener('pagehide', unload);
    return () => {
      active = false;
      clearTimeout(attachTimer.current);
      clearTimeout(commandTimer.current);
      watch.release(onlineRef.current);
      if (watchRef.current === watch) watchRef.current = null;
      window.removeEventListener('pagehide', unload);
    };
    // Metadata refreshes must not create another watch. A retry explicitly changes attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, session.api_key_id, native.sessionId, supported, attempt]);

  useEffect(() => {
    if (!deviceOnline && (statusRef.current === 'attached' || statusRef.current === 'attaching')) fail('Assistant offline. Reattach when it reconnects to control this conversation.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceOnline]);
  useEffect(() => {
    const el = logRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [projection.messages]);

  function allowed(action: 'reply' | 'answer' | 'stop') {
    return canControl(stateRef.current, native, onlineRef.current, statusRef.current === 'attached', !!pendingRef.current, action);
  }
  async function issue(command: NativeCommand) {
    const action = command.kind === 'answer' ? 'answer' : command.kind;
    const watch = watchRef.current;
    const current = stateRef.current.snapshot;
    // A handler from the previously rendered card must not act on a newly arrived turn.
    if (!watch || !current || current.stateVersion !== projection.snapshot?.stateVersion || !allowed(action)) return;
    if (command.kind === 'answer' && (current.pending?.requestId !== command.requestId || (!command.text?.trim() && !command.decision))) return;
    if (command.kind === 'stop' && current.loopId !== command.loopId) return;
    if (command.kind === 'reply' && !command.text.trim()) return;
    const id = crypto.randomUUID();
    const issued = { id, kind: command.kind, text: draftRef.current };
    pendingRef.current = issued;
    setPending(issued);
    commandTimer.current = setTimeout(() => {
      if (watchRef.current === watch && pendingRef.current?.id === id) fail('Command timed out. Reattach to check the assistant before trying again.');
    }, 10_000);
    try {
      await watch.send({ type: 'SESSION_COMMAND', ...watch.identity, commandId: id,
        expiresAt: new Date(Date.now() + 10_000).toISOString(), stateVersion: current.stateVersion, command });
    } catch {
      if (watchRef.current === watch && pendingRef.current?.id === id) fail('Could not send command. Reattach before trying again.');
    }
  }
  function send() {
    const text = draftRef.current.trim();
    const current = projection.snapshot;
    if (!text || !current) return;
    if (current.state === 'waiting' && current.pending?.kind === 'question') void issue({ kind: 'answer', requestId: current.pending.requestId, text });
    else void issue({ kind: 'reply', text });
  }
  function detach() {
    watchRef.current?.release(onlineRef.current);
    watchRef.current = null;
    clearTimeout(attachTimer.current);
    clearCommand();
    changeStatus('detached');
  }
  const current = projection.snapshot;
  const ready = status === 'attached';
  const canSend = allowed(current?.state === 'waiting' ? 'answer' : 'reply') && current?.pending?.kind !== 'approval';
  const explanation = !supported ? INTEGRATION_UNAVAILABLE : !deviceOnline ? 'Assistant offline. Reconnect before attaching or controlling this conversation.'
    : projection.error || (status === 'detached' ? 'Detached. Transcript is read-only.' : status === 'attaching' ? 'Attaching to conversation…' : current?.state === 'unknown' ? 'Status unavailable. This conversation is read-only.' : null);

  return <div className="chat-view native-session-chat">
    <div className="chat-banner" role="status">
      {ready && <><span>Attached to {surfaceLabel(native.surface)} session</span><button type="button" className="btn btn-secondary" onClick={detach}>Detach</button></>}
      {explanation && <p>{explanation}</p>}
      {ready && current?.state === 'running' && <span>Streaming</span>}
      {ready && current?.state === 'waiting' && <span>Needs you</span>}
      {ready && current?.state === 'idle' && <><span>Idle</span>{native.state === 'running' && <span>This turn already finished</span>}</>}
      {status === 'error' && <p>Last transcript may be stale; live controls are unavailable.</p>}
      {supported && (status === 'error' || status === 'detached') && <button type="button" className="btn btn-secondary" disabled={!deviceOnline} onClick={() => setAttempt((value) => value + 1)}>{status === 'error' ? 'Retry attachment' : 'Reattach'}</button>}
    </div>
    <div className="message-list chat-log" role="log" aria-label="Conversation" aria-live="polite" ref={logRef}
      onScroll={(event) => { const el = event.currentTarget; followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      {projection.messages.map((message) => <article key={message.id} className={`chat-message is-${message.role}`} aria-label={message.role === 'user' ? 'You' : 'Assistant'}>
        <div className={`bubble-wrap ${message.role}`}><div className={`bubble ${message.role}`}>
          {message.role === 'user' ? message.text : <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
            a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
            img: ({ alt }) => <span>{alt || 'Image unavailable in this transcript'}</span>,
          }}>{message.text}</ReactMarkdown>}
        </div></div>
      </article>)}
      {current?.pending && <section className={`chat-card native-pending${current.pending.kind === 'approval' ? ' is-approval' : ''}`} aria-label={current.pending.kind === 'approval' ? 'Approval needed' : 'Question'}>
        {current.pending.kind === 'approval' && <p className="chat-card-label">Approval needed</p>}
        <div className="native-pending-body">
        <p>{current.pending.prompt}</p>
        {current.pending.kind === 'approval' && <div className="action-approval-actions">{(['approve', 'deny'] as const).map((decision) => <button key={decision} className={`action-approval-btn action-approval-btn-${decision}`} type="button" disabled={!allowed('answer')} onClick={() => {
          const target = current.pending;
          if (target?.kind === 'approval') void issue({ kind: 'answer', requestId: target.requestId, decision });
        }}>{decision === 'approve' ? 'Approve' : 'Deny'}</button>)}</div>}
        </div>
      </section>}
    </div>
    <div className="input-area chat-composer">
      {pending && <p role="status">{pending.kind === 'stop' ? 'Stopping…' : 'Sent, awaiting assistant'}</p>}
      <div className="chat-composer-box">
        <textarea className="input-field" aria-label="Message" placeholder="Message your assistant…" rows={1} value={draft} disabled={supported && deviceOnline && status === 'attaching'} onChange={(event) => changeDraft(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
        }} />
        <div className="chat-composer-tools"><span className="chat-spacer" />
          {(current?.state === 'running' || (!current && native.state === 'running')) && <button className="btn btn-secondary" type="button" disabled={!allowed('stop')} onClick={() => {
            const loopId = current?.loopId;
            if (loopId) void issue({ kind: 'stop', loopId });
          }}>Stop</button>}
          <button className="send-btn" type="button" aria-label="Send" disabled={!draft.trim() || !canSend} onClick={send}>↑</button>
        </div>
      </div>
    </div>
  </div>;
}
