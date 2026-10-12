'use client';

// RemoteChat — the assistant's rich GUI chat (ported from plugin `Chat.tsx`),
// wired to a RelayPort instead of a Chrome runtime Port. It renders a live turn
// driven by a remote device: streamed text, thinking, steps/actions, render
// blocks (charts/maps/html/…), plans, forms, proposals, approvals, brain
// questions — over the PanelToWorker / WorkerToPanel frames the device speaks.
//
// Differences from the plugin panel:
//  - transport is a RelayPort (server relay) not a Chrome Port;
//  - a new chat has no session yet: the first send creates it (onCreateSession);
//  - drafts persist to localStorage (no chrome.storage.session);
//  - it only posts frames the device accepts on the remote channel
//    (REMOTE_INBOUND_FRAME_TYPES in assistant/plugin/src/background/remote-fanout.ts):
//    links open here on the phone; device-local file/folder links, context clearing,
//    sub-agent stop and the model picker are left out because the device ignores them
//    (it runs its own configured model).

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatBubble } from './panel/components/ChatBubble';
import { RenderBlockView } from './panel/components/RenderBlockView';
import { PlanView } from './panel/components/PlanView';
import { InteractiveFormView } from './panel/components/InteractiveFormView';
import { ProposalTable } from './panel/components/ProposalTable';
import { ActionApprovalCard } from './panel/components/ActionApprovalCard';
import { ReplayNetworkCard } from './panel/components/ReplayNetworkCard';
import { BrainQuestionsCard } from './panel/components/BrainQuestionsCard';
import { SubAgentCard, type SubAgentEntry, type SubAgentGroup } from './panel/components/SubAgentCard';
import type {
  AnyModel,
  ChatEntry,
  PanelToWorker,
  WorkerToPanel,
  TaskPlan,
  InteractiveForm,
  ProposalItem,
  FormResponse,
  ActionApprovalPayload,
  ReplayNetworkPayload,
  BrainQuestion,
  InteractionBlock,
} from './shared/types';
import { isEmptyAssistantBubble, DEFAULT_MODEL } from './shared/types';
import { nextPausedState, shouldAutoScroll, pausedAfterSend } from './shared/autoscroll';
import { createRelayPort, type RelayPortLike } from './relay-port';
import type { RelayMessage } from './frames';
import { applyStreamFrame, contentText, doneText } from './model/frame-assembly';
import { groupMessages } from './model/message-groups';
import { VoiceRobot } from './panel/components/VoiceRobot';
import { useSpeechSynthesis } from './panel/voice/useSpeechSynthesis';
import { useVoiceCapture } from './panel/voice/useVoiceCapture';
import { voiceInit, voiceReduce, type VoiceView, type VoiceEvent } from './shared/voice-state';
import { speakableText } from './shared/speakable-text';
import './RemoteChat.css';
import './ChatApp.css';

// Speak-back (TTS) preference persists per browser; default OFF (matches the plugin).
const VOICE_SPEAKBACK_KEY = 'remoteChatVoiceSpeakBack';

function loadSpeakBack(): boolean {
  try {
    return localStorage.getItem(VOICE_SPEAKBACK_KEY) === '1';
  } catch {
    return false;
  }
}

// ── Draft persistence (localStorage, per session; a new chat drafts under "new") ──

const DRAFTS_STORAGE_KEY = 'remoteChatDrafts';

function loadDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function persistDrafts(drafts: Record<string, string>): void {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    /* storage unavailable — in-memory map still works */
  }
}

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random()}`;

// Array.prototype.findLastIndex isn't in the project's ES2020 lib target — local shim.
function findLastIndex<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

// ── Attachment types ─────────────────────────────────────────────────────────

interface ImageAttachment {
  id: string;
  type: 'image';
  name: string;
  mediaType: string;
  data: string; // base64
  thumbnail: string; // data URL for preview
}

interface FileAttachment {
  id: string;
  type: 'file';
  name: string;
  mediaType: string;
  data: string; // base64
  textContent?: string;
}

interface TextPasteAttachment {
  id: string;
  type: 'text_paste';
  name: string;
  textContent: string;
  charCount: number;
  lineCount: number;
}

type Attachment = ImageAttachment | FileAttachment | TextPasteAttachment;

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string }; title?: string };

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const TEXT_EXTENSIONS = [
  '.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx',
  '.py', '.html', '.css', '.yaml', '.yml', '.xml', '.log',
];

function isImageType(mime: string): boolean {
  return IMAGE_TYPES.includes(mime);
}

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ── Icons (currentColor, decorative) ──────────────────────────────────────────

const AttachIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
  </svg>
);
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);
const SpeakerIcon = ({ on }: { on: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="M17 9l5 6M22 9l-5 6" />}
  </svg>
);

// ── Interaction Block (history rendering of resolved/expired cards) ───────────

function InteractionBlockView({ block, resolvedByNext }: { block: InteractionBlock; resolvedByNext: boolean }) {
  const resolved = resolvedByNext;
  const statusLabel = resolved ? '✓ Resolved' : '⚠ Expired';
  const className = `interaction-block ${resolved ? 'resolved' : 'expired'}`;
  const header = (title: React.ReactNode, status: string = statusLabel) => (
    <div className="interaction-block-header">
      <span className="interaction-block-icon" aria-hidden="true">{resolved ? '✓' : '⚠'}</span>
      <span className="interaction-block-title">{title}</span>
      <span className="interaction-block-status">{status}</span>
    </div>
  );

  if (block.kind === 'plan') {
    return (
      <div className={className}>
        {header(<>Plan: {block.plan.title}</>)}
        <ol className="interaction-block-steps">
          {block.plan.steps.map((s) => (
            <li key={s.id}>{s.label}</li>
          ))}
        </ol>
      </div>
    );
  }
  if (block.kind === 'form') {
    return (
      <div className={className}>
        {header(block.form.title)}
        <div className="interaction-block-fields">
          {(block.form.steps ?? []).flatMap((step) =>
            (step.fields ?? []).map((f) => (
              <span key={f.id} className="interaction-block-field">
                {f.label}
              </span>
            ))
          )}
        </div>
      </div>
    );
  }
  if (block.kind === 'proposals') {
    return (
      <div className={className}>
        {header(block.title ?? 'Proposed changes', block.resolved === 'dismissed' ? '✕ Dismissed' : statusLabel)}
        <div className="interaction-block-fields">
          {block.items.map((it) => (
            <span key={it.id} className="interaction-block-field">
              {it.label}: {it.current ?? '—'} → {it.proposed}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (block.kind === 'approval') {
    return (
      <div className={className}>
        {header(<>Action: {block.action.actionType} → {block.action.target}</>)}
        {block.action.reasoning && <div className="interaction-block-reasoning">{block.action.reasoning}</div>}
      </div>
    );
  }
  if (block.kind === 'replay-network') {
    return (
      <div className={className}>
        {header(<>Replay: {block.payload.method} {block.payload.url}</>)}
        {block.payload.reasoning && <div className="interaction-block-reasoning">{block.payload.reasoning}</div>}
      </div>
    );
  }
  if (block.kind === 'brain-questions') {
    return (
      <div className={className}>
        {header('Questions')}
        <ol className="interaction-block-questions">
          {block.questions.map((q) => (
            <li key={q.id}>{q.question}</li>
          ))}
        </ol>
      </div>
    );
  }
  return null;
}

/** A live card that needs the user (approval, form, plan, …): a labelled region. */
function Card({ label, title, approval, children }: { label: string; title?: string; approval?: boolean; children: React.ReactNode }) {
  return (
    <section className={`chat-card${approval ? ' is-approval' : ''}`} aria-label={label}>
      {title && <p className="chat-card-label">{title}</p>}
      {children}
    </section>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface RemoteChatProps {
  /** The open chat, or null for a new chat that gets its session on the first send. */
  sessionId: string | null;
  /** True when the session was just created by this chat's first send (no history to load). */
  freshSession: boolean;
  deviceName: string;
  deviceOnline: boolean;
  /** The device's configured model (heartbeat or live bridge), shown for reference. */
  deviceModel?: string | null;
  onCreateSession: () => Promise<string | null>;
  /** A message reached the relay (the chat list may have a new title/order). */
  onSent?: () => void;
}

function fromRelayMessage(m: RelayMessage): ChatEntry {
  const c = m.content ?? {};
  const obj = !Array.isArray(c) && typeof c === 'object' ? (c as { steps?: unknown; actions?: unknown }) : {};
  return {
    id: String(m.id),
    role: m.role,
    content: contentText(c),
    steps: Array.isArray(obj.steps) ? (obj.steps as string[]) : undefined,
    actions: Array.isArray(obj.actions) ? (obj.actions as string[]) : undefined,
    streaming: false,
  };
}

type Decision = 'approve' | 'deny' | 'guide' | 'queue' | 'allow_always';
const DECISION_LABEL: Record<Decision, string> = {
  approve: 'Approved',
  deny: 'Denied',
  guide: 'Guide me',
  queue: 'Queued',
  allow_always: 'Always allow',
};

// ── Component ────────────────────────────────────────────────────────────────

export function RemoteChat({
  sessionId,
  freshSession,
  deviceName,
  deviceOnline,
  deviceModel,
  onCreateSession,
  onSent,
}: RemoteChatProps) {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef('');
  // The device runs its own configured model; this only labels SEND_MESSAGE frames.
  const model = (deviceModel || DEFAULT_MODEL) as AnyModel;
  const [usage, setUsage] = useState({ inputTokens: 0, outputTokens: 0 });
  const [streaming, setStreaming] = useState(false);
  const [waitingForUser, setWaitingForUser] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<TaskPlan | null>(null);
  const [activeForm, setActiveForm] = useState<InteractiveForm | null>(null);
  const [activeProposals, setActiveProposals] = useState<{ title?: string; items: ProposalItem[] } | null>(null);
  const [activeSubAgents, setActiveSubAgents] = useState<SubAgentEntry[]>([]);
  const [activeGroups, setActiveGroups] = useState<SubAgentGroup[]>([]);
  const activeGroupsRef = useRef<SubAgentGroup[]>([]);
  const [currentLoopId, setCurrentLoopId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [expandedPastes, setExpandedPastes] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ActionApprovalPayload | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [pendingReplay, setPendingReplay] = useState<ReplayNetworkPayload | null>(null);
  const [pendingReplayId, setPendingReplayId] = useState<string | null>(null);
  const [brainQuestions, setBrainQuestions] = useState<{ questionId: string; questions: BrainQuestion[] } | null>(null);
  const draftKey = sessionId ?? 'new';

  // ── Voice (STT/TTS) ──────────────────────────────────────────────────────────
  // Ported from the plugin panel. A normal web page runs recognition in-page via
  // useVoiceCapture (the plugin relayed it from a content script). The pure
  // voice-state machine drives the composer mini-robot and the listening orb;
  // verified answers can be read aloud (opt-in, default off).
  const [voiceView, setVoiceView] = useState<VoiceView>(voiceInit);
  const [voiceAmplitude, setVoiceAmplitude] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakBack, setSpeakBack] = useState(false);
  const tts = useSpeechSynthesis();
  const dispatchVoice = useCallback((e: VoiceEvent) => setVoiceView((v) => voiceReduce(v, e)), []);
  // The frame handler is a useEffect closure with a narrow dep array; mirror live values into refs.
  const speakBackRef = useRef(false);
  const ttsRef = useRef(tts);
  const onSentRef = useRef(onSent);
  speakBackRef.current = speakBack;
  ttsRef.current = tts;
  onSentRef.current = onSent;

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portRef = useRef<RelayPortLike | null>(null);
  // Frames posted before a new chat has its session; flushed once the port exists.
  const pendingFramesRef = useRef<PanelToWorker[]>([]);
  const creatingRef = useRef(false);
  const draftsRef = useRef<Record<string, string>>({});
  // Latest messages, readable SYNCHRONOUSLY from the frame handler.
  const messagesRef = useRef<ChatEntry[]>(messages);
  messagesRef.current = messages;
  const freshRef = useRef(freshSession);
  freshRef.current = freshSession;

  // Watchdog: if nothing on the device consumes the frames, no reply ever streams
  // back. Arm a timer on send; ANY inbound frame clears it; on timeout, fail the
  // pending turn with a clear message instead of an endless spinner.
  const NO_RESPONSE_TIMEOUT_MS = 45000;
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);
  const armWatchdog = useCallback(() => {
    clearWatchdog();
    watchdogRef.current = setTimeout(() => {
      watchdogRef.current = null;
      const id = streamingIdRef.current;
      const errText =
        "Your assistant didn't respond. It may be offline or not running; the message is queued and will be delivered when it reconnects.";
      setMessages((prev) =>
        id && prev.some((m) => m.id === id)
          ? prev.map((m) => (m.id === id ? { ...m, content: m.content || errText, streaming: false, error: true } : m))
          : prev
      );
      streamingIdRef.current = null;
      setStreaming(false);
      dispatchVoice({ type: 'TURN_DONE', verified: false });
    }, NO_RESPONSE_TIMEOUT_MS);
  }, [clearWatchdog, dispatchVoice]);

  const stashDraft = useCallback((key: string, text: string) => {
    if (text) draftsRef.current[key] = text;
    else delete draftsRef.current[key];
    persistDrafts(draftsRef.current);
  }, []);

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  };

  // Drop transcribed voice text into the composer at the cursor. No auto-send.
  const appendToComposer = useCallback(
    (text: string) => {
      if (!text) return;
      const el = textareaRef.current;
      const cur = inputRef.current;
      let next: string;
      if (el && el.selectionStart != null) {
        const pos = el.selectionStart;
        const needsSpace = pos > 0 && !/\s$/.test(cur.slice(0, pos));
        next = cur.slice(0, pos) + (needsSpace ? ' ' : '') + text + cur.slice(pos);
      } else {
        next = cur ? `${cur} ${text}` : text;
      }
      inputRef.current = next;
      setInput(next);
      if (el) {
        el.value = next;
        resize(el);
        el.focus();
      }
      stashDraft(draftKey, next);
    },
    [stashDraft, draftKey]
  );

  const voice = useVoiceCapture({
    onInterim: (text) => dispatchVoice({ type: 'INTERIM', text }),
    onFinal: (text) => {
      if (text) appendToComposer(text);
      dispatchVoice({ type: 'FINALIZE' });
    },
    onAmplitude: (level) => setVoiceAmplitude(level),
    onError: (message) => {
      setVoiceError(message);
      dispatchVoice({ type: 'CANCEL_LISTENING' });
    },
    onEnded: () => dispatchVoice({ type: 'FINALIZE' }),
  });

  const toggleMic = useCallback(() => {
    if (!voice.supported) return;
    if (voice.listening) {
      voice.stop();
      return;
    }
    setVoiceError(null);
    dispatchVoice({ type: 'START_LISTENING' });
    voice.start();
  }, [voice, dispatchVoice]);

  const cancelMic = useCallback(() => {
    voice.stop();
    dispatchVoice({ type: 'CANCEL_LISTENING' });
  }, [voice, dispatchVoice]);

  useEffect(() => {
    if (voiceView.effect === 'cancel-speech') tts.cancel();
  }, [voiceView.effect, tts]);

  useEffect(() => {
    if (voiceView.state !== 'listening') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelMic();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [voiceView.state, cancelMic]);

  // Hydrate the persisted draft on mount (a new chat keeps its draft when it gets an id).
  useEffect(() => {
    draftsRef.current = loadDrafts();
    const restored = draftsRef.current[sessionId ?? 'new'];
    if (restored && !inputRef.current) {
      inputRef.current = restored;
      setInput(restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSpeakBack(loadSpeakBack());
  }, []);

  const setSpeakBackPersisted = useCallback((on: boolean) => {
    setSpeakBack(on);
    try {
      localStorage.setItem(VOICE_SPEAKBACK_KEY, on ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Hydrate durable history (not for a chat this component just created).
  useEffect(() => {
    if (!sessionId || freshRef.current) return;
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

  const afterPost = useCallback((frame: PanelToWorker, ok: boolean) => {
    if (ok && frame.type === 'SEND_MESSAGE') onSentRef.current?.();
  }, []);

  const post = useCallback(
    (frame: PanelToWorker) => {
      const port = portRef.current;
      if (port) {
        void port.postMessage(frame).then((ok) => afterPost(frame, ok));
        return;
      }
      // A new chat: queue the frame and create the session once.
      pendingFramesRef.current.push(frame);
      if (creatingRef.current) return;
      creatingRef.current = true;
      void onCreateSession().then((id) => {
        if (id) return; // the port effect for the new session flushes the queue
        creatingRef.current = false;
        pendingFramesRef.current = [];
        clearWatchdog();
        const errText = "Couldn't start the chat. Check your connection and try again.";
        const sid = streamingIdRef.current;
        setMessages((prev) => prev.map((m) => (m.id === sid ? { ...m, content: errText, streaming: false, error: true } : m)));
        streamingIdRef.current = null;
        setStreaming(false);
      });
    },
    [onCreateSession, afterPost, clearWatchdog]
  );

  // ── Wire the relay port + frame handler ─────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    // A chat created by this component's first send has no earlier frames: read from the start
    // so a reply that lands before the first poll is not skipped.
    const port = createRelayPort(sessionId, { fromStart: freshRef.current });
    portRef.current = port;

    const handler = (msg: WorkerToPanel) => {
      // Any inbound frame means the device is responding — cancel the no-response watchdog.
      clearWatchdog();
      if (
        msg.type === 'THINKING_CHUNK' ||
        msg.type === 'STREAM_VERIFY' ||
        msg.type === 'STREAM_CHUNK' ||
        msg.type === 'STREAM_RESET'
      ) {
        const id = streamingIdRef.current;
        if (!id) return;
        setMessages((prev) => prev.map((m) => (m.id === id ? applyStreamFrame(m, msg) : m)));
      } else if (msg.type === 'STREAM_DONE') {
        const id = streamingIdRef.current;
        // Some turns stream nothing and deliver the whole answer only in the terminal
        // frame's `message.content` (remote-chat.ts adds it; the shared type doesn't declare it).
        const finalText = doneText(msg);
        const finishedRaw = id ? messagesRef.current.find((m) => m.id === id) : undefined;
        const finished = finishedRaw && !finishedRaw.content && finalText ? { ...finishedRaw, content: finalText } : finishedRaw;
        setMessages((prev) => {
          let next = id ? prev.map((m) => (m.id === id ? applyStreamFrame(m, msg) : m)) : prev;
          if (!id && finalText) next = [...next, { id: uuid(), role: 'assistant', content: finalText }];
          return next.filter((m) => !(m.streaming && isEmptyAssistantBubble(m)));
        });
        // Voice: happy on a clean answer, sad only when verification explicitly failed.
        if (finished) {
          const ok = finished.verifyState !== 'unverified';
          dispatchVoice({ type: 'TURN_DONE', verified: ok });
          const spoken = typeof finished.content === 'string' ? speakableText(finished.content) : '';
          if (ok && speakBackRef.current && ttsRef.current.supported && spoken) {
            dispatchVoice({ type: 'SPEAK_START' });
            ttsRef.current.speak(spoken, { onEnd: () => dispatchVoice({ type: 'SPEAK_END' }) });
          }
        }
        streamingIdRef.current = null;
        setStreaming(false);
        setWaitingForUser(null);
        setCurrentLoopId(null);
        setActiveSubAgents((prev) => prev.filter((a) => a.status === 'running'));
        if (msg.inputTokens > 0 || msg.outputTokens > 0) {
          setUsage((u) => ({ inputTokens: u.inputTokens + msg.inputTokens, outputTokens: u.outputTokens + msg.outputTokens }));
        }
      } else if (msg.type === 'STREAM_ERROR') {
        const id = streamingIdRef.current;
        const errText = msg.error || 'The request failed.';
        setMessages((prev) => {
          if (id && prev.some((m) => m.id === id)) {
            return prev.map((m) => (m.id === id ? applyStreamFrame(m, msg) : m));
          }
          const lastIdx = findLastIndex(prev, (m) => m.role === 'assistant');
          const last = lastIdx >= 0 ? prev[lastIdx] : null;
          if (last && isEmptyAssistantBubble(last)) {
            const updated = [...prev];
            updated[lastIdx] = { ...last, content: errText, streaming: false, error: true };
            return updated;
          }
          return [...prev, { id: uuid(), role: 'assistant', content: errText, error: true }];
        });
        streamingIdRef.current = null;
        setStreaming(false);
        setWaitingForUser(null);
        setActiveForm(null);
        setActiveProposals(null);
        setActivePlan(null);
        setPendingApproval(null);
        setPendingReplay(null);
        setBrainQuestions(null);
      } else if (msg.type === 'RENDER_BLOCK') {
        const streamId = streamingIdRef.current;
        setMessages((prev) => {
          if (streamId && prev.some((m) => m.id === streamId)) {
            return prev.map((m) => (m.id === streamId ? { ...m, renderBlocks: [...(m.renderBlocks ?? []), msg.block] } : m));
          }
          return [...prev, { id: uuid(), role: 'assistant', content: '', renderBlock: msg.block }];
        });
      } else if (msg.type === 'WAIT_FOR_USER_PROMPT') {
        setWaitingForUser(msg.message);
      } else if (msg.type === 'WAIT_FOR_USER_DONE') {
        setWaitingForUser(null);
      } else if (msg.type === 'USER_MESSAGE_INJECTED') {
        const oldId = streamingIdRef.current;
        const newAssistantId = uuid();
        const assistantEntry: ChatEntry = { id: newAssistantId, role: 'assistant', content: '', streaming: true };
        setMessages((prev) => {
          const filtered = oldId
            ? prev
                .filter((m) => !(m.id === oldId && isEmptyAssistantBubble(m)))
                .map((m) => (m.id === oldId && m.streaming ? { ...m, streaming: false } : m))
            : prev;
          const lastUserIdx = findLastIndex(filtered, (m) => m.role === 'user');
          if (lastUserIdx >= 0 && filtered[lastUserIdx].content === msg.text) return [...filtered, assistantEntry];
          return [...filtered, { id: uuid(), role: 'user', content: msg.text }, assistantEntry];
        });
        streamingIdRef.current = newAssistantId;
      } else if (msg.type === 'BACKGROUND_DONE') {
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: 'assistant', content: `✅ **Background task complete**\n\n${msg.title ?? ''}\n\n${msg.result ?? ''}` },
        ]);
      } else if (msg.type === 'SCHEDULE_RESULT') {
        setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: msg.markdown }]);
      } else if (msg.type === 'PLAN_CREATED') {
        setActivePlan(msg.plan);
        setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: '', interactionBlock: { kind: 'plan', plan: msg.plan } }]);
      } else if (msg.type === 'PLAN_STEP_UPDATE') {
        setActivePlan((prev) => {
          if (!prev || prev.id !== msg.planId) return prev;
          return {
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === msg.stepId ? { ...s, status: msg.status as TaskPlan['steps'][number]['status'], result: msg.result } : s
            ),
          };
        });
      } else if (msg.type === 'PLAN_COMPLETE') {
        setActivePlan((prev) => (!prev || prev.id !== msg.planId ? prev : { ...prev, status: 'done' }));
      } else if (msg.type === 'INTERACTIVE_FORM') {
        setActiveForm(msg.form);
        setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: '', interactionBlock: { kind: 'form', form: msg.form } }]);
      } else if (msg.type === 'INTERACTIVE_PROPOSALS') {
        setActiveProposals({ title: msg.title, items: msg.items });
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: 'assistant', content: '', interactionBlock: { kind: 'proposals', title: msg.title, items: msg.items } },
        ]);
      } else if (msg.type === 'ACTION_APPROVAL_REQUEST') {
        setPendingApproval(msg.action);
        setPendingApprovalId(msg.actionId);
        setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: '', interactionBlock: { kind: 'approval', action: msg.action } }]);
      } else if (msg.type === 'REPLAY_NETWORK_APPROVAL_REQUEST') {
        setPendingReplay(msg.action);
        setPendingReplayId(msg.actionId);
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: 'assistant', content: '', interactionBlock: { kind: 'replay-network', payload: msg.action } },
        ]);
      } else if (msg.type === 'BRAIN_QUESTIONS_REQUEST') {
        setBrainQuestions({ questionId: msg.questionId, questions: msg.questions });
        setMessages((prev) => [
          ...prev,
          {
            id: uuid(),
            role: 'assistant',
            content: '',
            interactionBlock: { kind: 'brain-questions', questionId: msg.questionId, questions: msg.questions },
          },
        ]);
      } else if (msg.type === 'SUBAGENT_STARTED') {
        setCurrentLoopId(msg.loopId);
        const group = activeGroupsRef.current.find(
          (g) => !g.done && g.loopId === msg.loopId && g.agents.some((a) => a.subagentId === msg.subagentId)
        );
        setActiveSubAgents((prev) => [
          ...prev,
          {
            agentId: msg.agentId,
            subagentId: msg.subagentId,
            name: msg.name,
            status: 'running',
            loopId: msg.loopId,
            groupId: group?.groupId,
            model: msg.model,
            prompt: msg.prompt,
            parentAgentId: msg.parentAgentId,
            depth: msg.depth,
            steps: [],
            actions: [],
          },
        ]);
      } else if (msg.type === 'SUBAGENT_PROGRESS') {
        setActiveSubAgents((prev) => {
          if (prev.some((a) => a.agentId === msg.agentId)) setCurrentLoopId(msg.loopId);
          return prev.map((a) =>
            a.agentId === msg.agentId ? { ...a, turn: msg.turn, maxTurns: msg.maxTurns, lastAction: msg.lastAction } : a
          );
        });
      } else if (msg.type === 'SUBAGENT_STEP') {
        setActiveSubAgents((prev) => {
          if (prev.some((a) => a.agentId === msg.agentId)) setCurrentLoopId(msg.loopId);
          return prev.map((a) => (a.agentId === msg.agentId ? { ...a, steps: [...a.steps, msg.step] } : a));
        });
      } else if (msg.type === 'SUBAGENT_ACTION') {
        setActiveSubAgents((prev) => {
          if (prev.some((a) => a.agentId === msg.agentId)) setCurrentLoopId(msg.loopId);
          return prev.map((a) =>
            a.agentId === msg.agentId ? { ...a, actions: [...a.actions, { action: msg.action, input: msg.input, ok: msg.ok }] } : a
          );
        });
      } else if (msg.type === 'SUBAGENT_DONE') {
        setActiveSubAgents((prev) =>
          prev.map((a) =>
            a.agentId === msg.agentId
              ? { ...a, status: msg.ok ? 'done' : 'error', ok: msg.ok, summary: msg.summary, durationMs: msg.durationMs }
              : a
          )
        );
      } else if (msg.type === 'SUBAGENT_GROUP_STARTED') {
        setCurrentLoopId(msg.loopId);
        const newGroup: SubAgentGroup = { groupId: msg.groupId, loopId: msg.loopId, agents: msg.agents };
        activeGroupsRef.current = [...activeGroupsRef.current, newGroup];
        setActiveGroups((prev) => [...prev, newGroup]);
      } else if (msg.type === 'SUBAGENT_GROUP_DONE') {
        activeGroupsRef.current = activeGroupsRef.current.map((g) =>
          g.groupId === msg.groupId ? { ...g, done: true, results: msg.results } : g
        );
        setActiveGroups((prev) => prev.map((g) => (g.groupId === msg.groupId ? { ...g, done: true, results: msg.results } : g)));
      } else if (msg.type === 'ACTION_QUEUED') {
        setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: `⏸ Action queued: ${msg.summary}` }]);
      }
    };

    port.onMessage.addListener(handler);

    // Flush what a new chat posted before it had a session.
    const queued = pendingFramesRef.current;
    pendingFramesRef.current = [];
    creatingRef.current = false;
    for (const f of queued) {
      const frame: PanelToWorker = f.type === 'SEND_MESSAGE' ? { ...f, sessionId } : f;
      void port.postMessage(frame).then((ok) => afterPost(frame, ok));
    }

    return () => {
      port.onMessage.removeListener(handler);
      port.disconnect();
      portRef.current = null;
      clearWatchdog();
    };
  }, [sessionId, clearWatchdog, dispatchVoice, afterPost]);

  // ── Autoscroll ───────────────────────────────────────────────────────────────
  const autoscrollPaused = useRef(false);
  const programmaticScroll = useRef(false);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const wasProgrammatic = programmaticScroll.current;
      programmaticScroll.current = false;
      autoscrollPaused.current = nextPausedState(
        autoscrollPaused.current,
        { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight },
        wasProgrammatic
      );
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    // When the log shrinks (the on-screen keyboard opens), keep the latest message in view.
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            if (shouldAutoScroll(autoscrollPaused.current)) {
              programmaticScroll.current = true;
              el.scrollTop = el.scrollHeight;
            }
          })
        : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (listRef.current && shouldAutoScroll(autoscrollPaused.current)) {
      programmaticScroll.current = true;
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, activePlan, activeForm, pendingApproval, pendingReplay, brainQuestions, activeProposals]);

  // ── Attachment handling ─────────────────────────────────────────────────────

  const addImageAttachment = useCallback(async (file: File) => {
    const data = await fileToBase64(file);
    setAttachments((prev) => [
      ...prev,
      { id: uuid(), type: 'image', name: file.name, mediaType: file.type, data, thumbnail: `data:${file.type};base64,${data}` },
    ]);
  }, []);

  const addFileAttachment = useCallback(async (file: File) => {
    const data = await fileToBase64(file);
    const textContent = isTextFile(file.name) ? await fileToText(file) : undefined;
    setAttachments((prev) => [
      ...prev,
      { id: uuid(), type: 'file', name: file.name, mediaType: file.type || 'application/octet-stream', data, textContent },
    ]);
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        if (isImageType(file.type)) await addImageAttachment(file);
        else await addFileAttachment(file);
      }
    },
    [addImageAttachment, addFileAttachment]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const togglePaste = useCallback((id: string) => {
    setExpandedPastes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function buildMessageContent(text: string, atts: Attachment[]): string | ContentBlock[] {
    if (atts.length === 0) return text;
    const blocks: ContentBlock[] = [];
    for (const att of atts) {
      if (att.type === 'text_paste') {
        blocks.push({ type: 'text', text: att.textContent });
      } else if (att.type === 'image') {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: att.mediaType, data: att.data } });
      } else if (att.textContent) {
        blocks.push({ type: 'text', text: `[File: ${att.name}]\n${att.textContent}` });
      } else if (att.mediaType === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: att.mediaType, data: att.data }, title: att.name });
      } else {
        blocks.push({ type: 'text', text: `[Attached file: ${att.name} (${att.mediaType})]` });
      }
    }
    if (text) blocks.push({ type: 'text', text });
    return blocks;
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  const send = useCallback(() => {
    const text = inputRef.current.trim();
    if (!text && attachments.length === 0) return;
    autoscrollPaused.current = pausedAfterSend();
    setInput('');
    inputRef.current = '';
    stashDraft(draftKey, '');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const messageContent = buildMessageContent(text, attachments);
    const wire = typeof messageContent === 'string' ? messageContent : JSON.stringify(messageContent);
    const displayText =
      text + (attachments.length > 0 ? `\n[${attachments.length} attachment${attachments.length > 1 ? 's' : ''}]` : '');
    setAttachments([]);
    setExpandedPastes(new Set());

    // A pending interaction: typed text resolves it via USER_RESPONSE.
    if (
      waitingForUser ||
      activeForm ||
      activeProposals ||
      activePlan?.status === 'pending' ||
      pendingApproval ||
      pendingReplay ||
      brainQuestions
    ) {
      setMessages((prev) => [...prev, { id: uuid(), role: 'user', content: displayText }]);
      post({ type: 'USER_RESPONSE', text: wire });
      // The device never sends WAIT_FOR_USER_DONE on the remote channel: the reply ends the wait.
      setWaitingForUser(null);
      if (activeForm) setActiveForm(null);
      if (activeProposals) {
        setMessages((prev) =>
          prev.map((m) =>
            m.interactionBlock?.kind === 'proposals'
              ? { ...m, interactionBlock: { ...m.interactionBlock, resolved: 'submitted' as const } }
              : m
          )
        );
        setActiveProposals(null);
      }
      if (activePlan?.status === 'pending') setActivePlan(null);
      if (pendingApproval) setPendingApproval(null);
      if (pendingReplay) setPendingReplay(null);
      if (brainQuestions) setBrainQuestions(null);
      return;
    }

    if (streaming) {
      // The device injects it into the running turn; it doesn't echo it back, so show it here.
      autoscrollPaused.current = false;
      setMessages((prev) => [...prev, { id: uuid(), role: 'user', content: displayText }]);
      post({ type: 'SEND_MESSAGE', text: wire, model, sessionId: sessionId ?? undefined });
      armWatchdog();
      return;
    }

    autoscrollPaused.current = false;
    const assistantId = uuid();
    setMessages((prev) => [
      ...prev,
      { id: uuid(), role: 'user', content: displayText },
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ]);
    streamingIdRef.current = assistantId;
    setStreaming(true);
    setActiveSubAgents((prev) => prev.filter((a) => a.status === 'running'));
    setActiveGroups((prev) => {
      const kept = prev.filter((g) => !g.done);
      activeGroupsRef.current = kept;
      return kept;
    });
    setCurrentLoopId(null);
    dispatchVoice({ type: 'TURN_START' });
    post({ type: 'SEND_MESSAGE', text: wire, model, sessionId: sessionId ?? undefined });
    armWatchdog();
  }, [
    streaming,
    armWatchdog,
    waitingForUser,
    activeForm,
    activeProposals,
    activePlan,
    pendingApproval,
    pendingReplay,
    brainQuestions,
    model,
    attachments,
    stashDraft,
    draftKey,
    sessionId,
    post,
    dispatchVoice,
  ]);

  function stop() {
    post({ type: 'STOP_STREAM' });
    const streamId = streamingIdRef.current;
    setMessages((prev) => {
      const idx = streamId ? prev.findIndex((m) => m.id === streamId) : findLastIndex(prev, (m) => m.role === 'assistant');
      if (idx < 0) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], streaming: false, interrupted: true };
      return updated;
    });
    clearWatchdog();
    streamingIdRef.current = null;
    setStreaming(false);
    setWaitingForUser(null);
  }

  const retryLastTurn = useCallback(() => {
    if (streaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser?.content) return;
    const assistantId = uuid();
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      const trimmed = last?.role === 'assistant' && last?.error ? prev.slice(0, -1) : prev;
      return [...trimmed, { id: assistantId, role: 'assistant', content: '', streaming: true }];
    });
    autoscrollPaused.current = false;
    streamingIdRef.current = assistantId;
    setStreaming(true);
    setCurrentLoopId(null);
    post({ type: 'SEND_MESSAGE', text: lastUser.content, model, sessionId: sessionId ?? undefined });
    armWatchdog();
  }, [streaming, messages, model, sessionId, post, armWatchdog]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    // Alt+Enter inserts a newline (browsers don't do this natively for Alt); Shift+Enter already does.
    if (e.altKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const next = el.value.slice(0, start) + '\n' + el.value.slice(end);
      // Write the DOM value and caret now: the next keystroke may land before React re-renders.
      el.value = next;
      el.selectionStart = el.selectionEnd = start + 1;
      inputRef.current = next;
      setInput(next);
      stashDraft(draftKey, next);
      resize(el);
      return;
    }
    if (!e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    inputRef.current = val;
    setInput(val);
    stashDraft(draftKey, val);
    resize(e.target);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) addImageAttachment(file);
        return;
      }
    }
    const text = e.clipboardData.getData('text/plain');
    if (text && text.length >= 200) {
      e.preventDefault();
      const lineCount = text.split('\n').length;
      const sizeStr = text.length >= 1024 ? `${(text.length / 1024).toFixed(1)}KB` : `${text.length} chars`;
      setAttachments((prev) => [
        ...prev,
        {
          id: uuid(),
          type: 'text_paste',
          name: `Pasted text (${sizeStr}, ${lineCount} line${lineCount > 1 ? 's' : ''})`,
          textContent: text,
          charCount: text.length,
          lineCount,
        },
      ]);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) handleFiles(files);
  }

  function handleProposalsRespond(approved: string[], rejected: string[]) {
    const items = activeProposals?.items ?? [];
    const nameOf = (id: string) => items.find((it) => it.id === id)?.label ?? id;
    const summary =
      `Proposals: approved ${approved.length}` +
      (approved.length ? ` (${approved.map(nameOf).join(', ')})` : '') +
      `, rejected ${rejected.length}` +
      (rejected.length ? ` (${rejected.map(nameOf).join(', ')})` : '');
    setMessages((prev) =>
      prev
        .map((m) =>
          m.interactionBlock?.kind === 'proposals'
            ? { ...m, interactionBlock: { ...m.interactionBlock, resolved: 'submitted' as const } }
            : m
        )
        .concat({ id: uuid(), role: 'user', content: summary })
    );
    post({ type: 'PROPOSALS_RESPONSE', approved, rejected });
    setActiveProposals(null);
  }

  function handleProposalsDismiss() {
    setMessages((prev) =>
      prev
        .map((m) =>
          m.interactionBlock?.kind === 'proposals'
            ? { ...m, interactionBlock: { ...m.interactionBlock, resolved: 'dismissed' as const } }
            : m
        )
        .concat({ id: uuid(), role: 'user', content: '(dismissed the proposals)' })
    );
    post({ type: 'PROPOSALS_RESPONSE', approved: [], rejected: [], dismissed: true });
    setActiveProposals(null);
  }

  function handlePlanApprove() {
    if (!activePlan) return;
    setMessages((prev) => [...prev, { id: uuid(), role: 'user', content: `Plan "${activePlan.title}": Approved` }]);
    post({ type: 'PLAN_RESPONSE', planId: activePlan.id, approved: true });
    setActivePlan((prev) => (prev ? { ...prev, status: 'approved' } : null));
  }

  function handlePlanReject() {
    if (!activePlan) return;
    setMessages((prev) => [...prev, { id: uuid(), role: 'user', content: `Plan "${activePlan.title}": Rejected` }]);
    post({ type: 'PLAN_RESPONSE', planId: activePlan.id, approved: false });
    setActivePlan(null);
  }

  function handleFormSubmit(formId: string, data: FormResponse) {
    const form = activeForm!;
    const formSteps = form.steps ?? [];
    const line = (f: { id: string; label: string }) => {
      const val = data[f.id];
      return `${f.label}: ${Array.isArray(val) ? val.join(', ') : (val ?? '')}`;
    };
    const userText =
      formSteps.length > 1
        ? formSteps.map((step) => `${step.title}:\n${(step.fields ?? []).map(line).join('\n')}`).join('\n\n')
        : formSteps.flatMap((step) => (step.fields ?? []).map(line)).join('\n');
    setMessages((prev) => [...prev, { id: uuid(), role: 'user', content: userText }]);
    post({ type: 'FORM_RESPONSE', formId, data });
    setActiveForm(null);
  }

  function handleFormDismiss() {
    const form = activeForm;
    if (form) {
      post({ type: 'FORM_RESPONSE', formId: form.id, data: { __dismissed: 'true' } });
      setMessages((prev) => [...prev, { id: uuid(), role: 'user', content: '(dismissed the form)' }]);
    }
    setActiveForm(null);
  }

  function isInteractionLive(block: InteractionBlock): boolean {
    if (block.kind === 'plan' && activePlan) return true;
    if (block.kind === 'form' && activeForm) return true;
    if (block.kind === 'approval' && pendingApproval) return true;
    if (block.kind === 'replay-network' && pendingReplay) return true;
    if (block.kind === 'brain-questions' && brainQuestions) return true;
    if (block.kind === 'proposals' && activeProposals) return true;
    return false;
  }

  const handleButtonClick = useCallback(
    (value: string) => {
      const userEntry: ChatEntry = { id: uuid(), role: 'user', content: value };
      if (waitingForUser) {
        setMessages((prev) => [...prev, userEntry]);
        post({ type: 'USER_RESPONSE', text: value });
        setWaitingForUser(null);
      } else if (streaming) {
        setMessages((prev) => [...prev, userEntry]);
        post({ type: 'SEND_MESSAGE', text: value, model, sessionId: sessionId ?? undefined });
      } else {
        const assistantId = uuid();
        setMessages((prev) => [...prev, userEntry, { id: assistantId, role: 'assistant', content: '', streaming: true }]);
        streamingIdRef.current = assistantId;
        setStreaming(true);
        post({ type: 'SEND_MESSAGE', text: value, model, sessionId: sessionId ?? undefined });
        armWatchdog();
      }
    },
    [waitingForUser, streaming, model, sessionId, post, armWatchdog]
  );

  // Links open here, on the phone. Paths on the device's disk can't be opened remotely.
  const openLink = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const decide = (decision: Decision) => {
    if (!pendingApproval) return;
    setMessages((prev) => [
      ...prev,
      { id: uuid(), role: 'user', content: `Action ${pendingApproval.actionType} on ${pendingApproval.target}: ${DECISION_LABEL[decision]}` },
    ]);
    post({ type: 'ACTION_APPROVAL_RESPONSE', actionId: pendingApprovalId ?? pendingApproval.actionId, decision });
    setPendingApproval(null);
    setPendingApprovalId(null);
  };

  const groups = groupMessages(messages);
  const lastIndex = messages.length - 1;
  const indexOf = new Map(messages.map((m, i) => [m.id, i]));

  const renderEntry = (m: ChatEntry) => {
    const idx = indexOf.get(m.id) ?? 0;
    if (m.renderBlock) {
      return <RenderBlockView key={m.id} block={m.renderBlock} onProposalsRespond={handleProposalsRespond} onButtonClick={handleButtonClick} />;
    }
    if (m.interactionBlock) {
      if (isInteractionLive(m.interactionBlock)) return null;
      return (
        <InteractionBlockView key={m.id} block={m.interactionBlock} resolvedByNext={idx < lastIndex && messages[idx + 1]?.role === 'user'} />
      );
    }
    return (
      <article key={m.id} className={`chat-message is-${m.role}`} aria-label={m.role === 'user' ? 'You' : 'Assistant'}>
        <ChatBubble
          role={m.role}
          content={m.content}
          thinking={m.thinking}
          streaming={m.streaming}
          error={m.error}
          interrupted={m.interrupted}
          actions={m.actions}
          steps={m.steps}
          renderBlocks={m.renderBlocks}
          onButtonClick={handleButtonClick}
          onRetry={m.error && idx === lastIndex ? retryLastTurn : undefined}
          onOpenLink={openLink}
          verifyState={m.role === 'assistant' ? m.verifyState : undefined}
        />
      </article>
    );
  };

  const busy = streaming || !!waitingForUser;
  const canSend = !!input.trim() || attachments.length > 0;

  return (
    <div className="chat-view" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {voiceView.orbVisible && (
        <div className="voice-orb-overlay" data-testid="voice-orb" onClick={cancelMic}>
          <VoiceRobot face={voiceView.robotFace} size="orb" amplitude={voiceAmplitude} ariaLabel="Listening" />
          <div className="voice-transcript" aria-live="polite">
            {voiceView.transcript}
          </div>
          <div className="voice-orb-hint">Tap or press Esc to stop · your words drop into the message box</div>
        </div>
      )}

      <div className="message-list chat-log" ref={listRef} role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && (
          <div className="chat-empty">
            <strong>Send a message to your assistant</strong>
            It runs in the browser on {deviceName} and can browse, fill in forms and look things up for you. It asks
            before doing anything sensitive.
          </div>
        )}
        {groups.map((g) => (
          <div key={g.key} className={`chat-group is-${g.role}`}>
            {g.items.map(renderEntry)}
          </div>
        ))}

        {activePlan && (
          <Card label={activePlan.title || 'Plan'}>
            <PlanView plan={activePlan} onApprove={handlePlanApprove} onReject={handlePlanReject} />
          </Card>
        )}
        {activeForm && (
          <Card label={activeForm.title || 'Form'}>
            <InteractiveFormView form={activeForm} onSubmit={handleFormSubmit} onDismiss={handleFormDismiss} />
          </Card>
        )}
        {activeProposals && (
          <Card label={activeProposals.title ?? 'Proposed changes'}>
            <ProposalTable
              title={activeProposals.title}
              items={activeProposals.items}
              onRespond={handleProposalsRespond}
              onDismiss={handleProposalsDismiss}
            />
          </Card>
        )}
        {pendingApproval && (
          <Card label="Approval needed" title="Approval needed" approval>
            <ActionApprovalCard action={pendingApproval} onDecision={(_id, decision) => decide(decision)} />
          </Card>
        )}
        {pendingReplay && (
          <Card label="Approval needed" title="Approval needed" approval>
            <ReplayNetworkCard
              payload={pendingReplay}
              onDecision={(actionId, decision) => {
                const label = decision === 'approve' ? 'Approved replay' : 'Denied replay';
                setMessages((prev) => [...prev, { id: uuid(), role: 'user', content: `${pendingReplay.method} ${pendingReplay.url}: ${label}` }]);
                post({ type: 'ACTION_APPROVAL_RESPONSE', actionId: pendingReplayId ?? actionId, decision });
                setPendingReplay(null);
                setPendingReplayId(null);
              }}
            />
          </Card>
        )}
        {brainQuestions && (
          <Card label="Questions">
            <BrainQuestionsCard
              questionId={brainQuestions.questionId}
              questions={brainQuestions.questions}
              onSubmit={(questionId, answers) => {
                const lines = brainQuestions.questions.map((q, i) => `${i + 1}. ${q.question} → ${answers[q.id]}`);
                setMessages((prev) => [...prev, { id: uuid(), role: 'user', content: lines.join('\n') }]);
                post({ type: 'BRAIN_QUESTIONS_RESPONSE', questionId, answers });
                setBrainQuestions(null);
              }}
              onCancel={(questionId) => {
                setMessages((prev) => [...prev, { id: uuid(), role: 'user', content: "(skipped the questions — I'll answer in my own words)" }]);
                post({ type: 'BRAIN_QUESTIONS_RESPONSE', questionId, answers: { __cancelled: 'true' } });
                setBrainQuestions(null);
              }}
            />
          </Card>
        )}
      </div>

      {currentLoopId && activeSubAgents.some((a) => a.loopId === currentLoopId) && (
        <div className="subagent-sticky">
          <SubAgentCard
            agents={activeSubAgents.filter((a) => a.loopId === currentLoopId)}
            groups={activeGroups.filter((g) => g.loopId === currentLoopId)}
          />
        </div>
      )}

      <div className={`input-area chat-composer${dragOver ? ' drag-over' : ''}`}>
        {waitingForUser && (
          <div className="wait-for-user-banner" role="status">
            <span className="wfu-label">Your assistant needs you</span>
            <span className="wfu-message">{waitingForUser}</span>
          </div>
        )}
        {!deviceOnline && !waitingForUser && (
          <p className="chat-composer-note">Messages will be delivered when your assistant reconnects.</p>
        )}

        {voiceError && (
          <div className="voice-error" role="alert" data-testid="voice-error">
            <span className="voice-error-msg">{voiceError}</span>
            <button className="voice-error-dismiss" onClick={() => setVoiceError(null)} aria-label="Dismiss microphone error" type="button">
              ✕
            </button>
          </div>
        )}

        {voiceView.pillVisible && (
          <div className="voice-speaking-pill" role="status" aria-live="polite" data-testid="voice-speaking-pill">
            <span className="dot" />
            <span>Speaking…</span>
            <button
              className="voice-stop-btn"
              onClick={() => {
                tts.cancel();
                dispatchVoice({ type: 'SPEAK_END' });
              }}
              aria-label="Stop speaking"
              type="button"
            >
              Stop
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="attachments-bar">
            {attachments.map((att) => (
              <div key={att.id} className={`attachment-badge${att.type === 'text_paste' ? ' text-paste-badge' : ''}`}>
                {att.type === 'image' ? (
                  <img src={att.thumbnail} alt={att.name} />
                ) : att.type === 'text_paste' ? (
                  <button type="button" className="attachment-name" onClick={() => togglePaste(att.id)} aria-expanded={expandedPastes.has(att.id)}>
                    {att.name}
                  </button>
                ) : (
                  <span className="attachment-name">{att.name.length > 20 ? att.name.slice(0, 18) + '…' : att.name}</span>
                )}
                <button type="button" className="remove" onClick={() => removeAttachment(att.id)} aria-label={`Remove ${att.name}`}>
                  ✕
                </button>
                {att.type === 'text_paste' && expandedPastes.has(att.id) && (
                  <div className="text-paste-preview">
                    <pre>{att.textContent}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="chat-composer-box">
          <textarea
            ref={textareaRef}
            className="input-field"
            placeholder={waitingForUser ? 'Type your reply…' : 'Message your assistant…'}
            aria-label="Message"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            enterKeyHint="send"
          />
          <div className="chat-composer-tools">
            <button className="chat-icon-btn" onClick={() => fileInputRef.current?.click()} aria-label="Attach file" type="button">
              <AttachIcon />
            </button>
            {voice.supported && (
              <VoiceRobot
                face={voiceView.robotFace}
                size="mini"
                pressed={voiceView.state === 'listening'}
                ariaLabel={voiceView.state === 'listening' ? 'Stop listening' : 'Start voice input'}
                onClick={toggleMic}
              />
            )}
            {voice.supported && tts.supported && (
              <button
                className="chat-icon-btn"
                onClick={() => setSpeakBackPersisted(!speakBack)}
                aria-pressed={speakBack}
                aria-label={speakBack ? 'Mute spoken answers' : 'Read answers aloud'}
                type="button"
              >
                <SpeakerIcon on={speakBack} />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.yaml,.yml,.xml,.log"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <span className="chat-spacer" />
            {busy && !canSend ? (
              <button className="send-btn stop-btn" onClick={stop} aria-label="Stop" type="button">
                <StopIcon />
              </button>
            ) : (
              <button className="send-btn" onClick={send} disabled={!canSend} aria-label="Send" type="button">
                <SendIcon />
              </button>
            )}
          </div>
        </div>
        {(usage.inputTokens > 0 || usage.outputTokens > 0) && (
          <p className="chat-usage">
            {deviceModel ? `${deviceModel} · ` : ''}
            {(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens this chat
          </p>
        )}
      </div>
    </div>
  );
}
