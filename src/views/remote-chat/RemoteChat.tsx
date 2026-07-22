'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { applyDelta, type StreamAccumulator } from './shared/stream-parse';
import { nextPausedState, shouldAutoScroll, pausedAfterSend } from './shared/autoscroll';
import { createRelayPort, type RelayPortLike } from './relay-port';
import type { WorkerToPanel, RelayMessage } from './frames';
import './RemoteChat.css';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps: string[];
  actions: string[];
  streaming?: boolean;
  thinking?: string;
  verify?: 'verifying' | 'verified' | 'unverified';
}

interface RemoteChatProps {
  sessionId: string;
  deviceName: string;
  deviceOnline: boolean;
  onBack: () => void;
}

let msgCounter = 0;
const newId = () => `m${Date.now()}_${msgCounter++}`;

function fromRelayMessage(m: RelayMessage): ChatMessage {
  return {
    id: String(m.id),
    role: m.role,
    content: typeof m.content?.text === 'string' ? m.content.text : '',
    steps: Array.isArray(m.content?.steps) ? (m.content.steps as string[]) : [],
    actions: Array.isArray(m.content?.actions) ? (m.content.actions as string[]) : [],
  };
}

export function RemoteChat({ sessionId, deviceName, deviceOnline, onBack }: RemoteChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const portRef = useRef<RelayPortLike | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const programmaticRef = useRef(false);
  // The streaming assistant message id currently accumulating deltas.
  const activeIdRef = useRef<string | null>(null);
  const accRef = useRef<StreamAccumulator>({ content: '', actions: [], steps: [] });

  // Hydrate durable history.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/plugin/chat/sessions/${sessionId}/messages`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((body) => {
        if (cancelled) return;
        const hist = (body.messages as RelayMessage[] | undefined) ?? [];
        setMessages(hist.map(fromRelayMessage));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Update the streaming assistant bubble from the current accumulator.
  const flushActive = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    const acc = accRef.current;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, content: acc.content, steps: [...acc.steps], actions: [...acc.actions] } : m
      )
    );
  }, []);

  const ensureActive = useCallback(() => {
    if (activeIdRef.current) return;
    const id = newId();
    activeIdRef.current = id;
    accRef.current = { content: '', actions: [], steps: [] };
    setMessages((prev) => [
      ...prev,
      { id, role: 'assistant', content: '', steps: [], actions: [], streaming: true },
    ]);
  }, []);

  const patchActive = useCallback((patch: Partial<ChatMessage>) => {
    const id = activeIdRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  // Wire the relay port.
  useEffect(() => {
    const port = createRelayPort(sessionId);
    portRef.current = port;

    const handler = (frame: WorkerToPanel) => {
      switch (frame.type) {
        case 'STREAM_CHUNK':
          ensureActive();
          applyDelta(accRef.current, frame.delta);
          flushActive();
          break;
        case 'THINKING_CHUNK':
          ensureActive();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === activeIdRef.current ? { ...m, thinking: (m.thinking ?? '') + frame.delta } : m
            )
          );
          break;
        case 'STREAM_VERIFY':
          ensureActive();
          patchActive({ verify: frame.state ?? 'verifying' });
          break;
        case 'STREAM_ERROR':
          ensureActive();
          setMessages((prev) =>
            prev.map((m) =>
              m.id === activeIdRef.current
                ? { ...m, content: m.content || `⚠️ ${frame.error}`, streaming: false }
                : m
            )
          );
          activeIdRef.current = null;
          setStreaming(false);
          break;
        case 'STREAM_DONE':
          patchActive({ streaming: false });
          activeIdRef.current = null;
          setStreaming(false);
          break;
        case 'WAIT_FOR_USER_PROMPT':
          setBanner(frame.message);
          break;
        case 'WAIT_FOR_USER_DONE':
          setBanner(null);
          break;
      }
    };

    port.onMessage.addListener(handler);
    return () => {
      port.onMessage.removeListener(handler);
      port.disconnect();
      portRef.current = null;
    };
  }, [sessionId, ensureActive, flushActive, patchActive]);

  // Autoscroll.
  useEffect(() => {
    if (!shouldAutoScroll(pausedRef.current)) return;
    const el = listRef.current;
    if (!el) return;
    programmaticRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => {
      programmaticRef.current = false;
    });
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    pausedRef.current = nextPausedState(
      pausedRef.current,
      { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight },
      programmaticRef.current
    );
  }, []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || !portRef.current) return;
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: 'user', content: text, steps: [], actions: [] },
    ]);
    setInput('');
    pausedRef.current = pausedAfterSend();
    setStreaming(true);
    portRef.current.postMessage({ type: 'SEND_MESSAGE', text, sessionId });
  }, [input, sessionId]);

  const stop = useCallback(() => {
    portRef.current?.postMessage({ type: 'STOP_STREAM' });
    patchActive({ streaming: false });
    activeIdRef.current = null;
    setStreaming(false);
  }, [patchActive]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const statusLabel = useMemo(() => (deviceOnline ? 'online' : 'offline'), [deviceOnline]);

  return (
    <div className="rc-root">
      <div className="rc-header">
        <button
          className="rc-logo"
          onClick={onBack}
          aria-label="Back to devices"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ◆
        </button>
        <span className="rc-title">{deviceName}</span>
        <span className={`rc-status ${statusLabel}`}>{statusLabel}</span>
      </div>

      <div className="rc-messages" ref={listRef} onScroll={onScroll} role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="rc-empty">Send a message to drive this device&apos;s browser.</div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`rc-bubble ${m.role}`}>
            {m.role === 'assistant' && m.thinking && <div className="rc-thinking">{m.thinking}</div>}
            {m.actions.length > 0 && (
              <div className="rc-actions">
                {m.actions.map((a, i) => (
                  <span className="rc-action" key={i}>
                    {a}
                  </span>
                ))}
              </div>
            )}
            {m.role === 'assistant' ? (
              <div className="rc-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                {m.streaming && <span className="rc-cursor" />}
              </div>
            ) : (
              m.content
            )}
            {m.steps.length > 0 && (
              <details className="rc-steps">
                <summary>{m.steps.length} step{m.steps.length > 1 ? 's' : ''}</summary>
                <ol>
                  {m.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </details>
            )}
            {m.verify && (
              <span className={`rc-verify ${m.verify}`}>
                {m.verify === 'verified' ? '✓ Verified' : '🛡 Verifying'}
              </span>
            )}
          </div>
        ))}
      </div>

      {banner && <div className="rc-banner">{banner}</div>}

      <div className="rc-composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={deviceOnline ? 'Message the device…' : 'Device is offline'}
          rows={1}
          aria-label="Message"
          disabled={!deviceOnline}
        />
        {streaming ? (
          <button onClick={stop} aria-label="Stop">
            ■
          </button>
        ) : (
          <button onClick={send} disabled={!input.trim() || !deviceOnline} aria-label="Send">
            ↑
          </button>
        )}
      </div>
    </div>
  );
}
