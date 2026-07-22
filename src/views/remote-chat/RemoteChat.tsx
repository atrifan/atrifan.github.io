'use client';

// RemoteChat — the assistant's rich GUI chat (ported from plugin `Chat.tsx`),
// wired to a RelayPort instead of a Chrome runtime Port. It renders a live turn
// driven by a remote device: streamed text, thinking, steps/actions, render
// blocks (charts/maps/html/…), plans, forms, proposals, approvals, brain
// questions, and sub-agents — all over the same PanelToWorker / WorkerToPanel
// frame contract the device already speaks.
//
// Differences from the plugin panel:
//  - transport is a RelayPort (server relay) not a Chrome Port;
//  - drafts persist to localStorage (no chrome.storage.session);
//  - tab-scoping gates are dropped (a relay session already targets one device
//    stream — there is no multi-tab panel here);
//  - device-only affordances with no inbound frame in the relay contract
//    (screenshot/record, MCP-server management UI) are omitted.

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatBubble } from './panel/components/ChatBubble';
import { ContextIndicator } from './panel/components/ContextIndicator';
import { RenderBlockView } from './panel/components/RenderBlockView';
import { PlanView } from './panel/components/PlanView';
import { InteractiveFormView } from './panel/components/InteractiveFormView';
import { ProposalTable } from './panel/components/ProposalTable';
import { ActionApprovalCard } from './panel/components/ActionApprovalCard';
import { ReplayNetworkCard } from './panel/components/ReplayNetworkCard';
import { BrainQuestionsCard } from './panel/components/BrainQuestionsCard';
import { SubAgentCard, type SubAgentEntry, type SubAgentGroup } from './panel/components/SubAgentCard';
import { TokenFooter } from './panel/components/TokenFooter';
import type {
  ChatEntry,
  AnyModel,
  PanelToWorker,
  WorkerToPanel,
  SessionUsage,
  TaskPlan,
  InteractiveForm,
  ProposalItem,
  FormResponse,
  ActionApprovalPayload,
  ReplayNetworkPayload,
  BrainQuestion,
  InteractionBlock,
} from './shared/types';
import { calcCost, isEmptyAssistantBubble, DEFAULT_MODEL } from './shared/types';
import { applyDelta } from './shared/stream-parse';
import { nextPausedState, shouldAutoScroll, pausedAfterSend } from './shared/autoscroll';
import { createRelayPort, type RelayPortLike } from './relay-port';
import type { RelayMessage } from './frames';
import './RemoteChat.css';

// ── Draft persistence (localStorage, per base sessionId) ─────────────────────

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

// ── Interaction Block (history rendering of resolved/expired cards) ───────────

function InteractionBlockView({ block, resolvedByNext }: { block: InteractionBlock; resolvedByNext: boolean }) {
  const resolved = resolvedByNext;
  const statusLabel = resolved ? '✓ Resolved' : '⚠ Expired';
  const className = `interaction-block ${resolved ? 'resolved' : 'expired'}`;

  if (block.kind === 'plan') {
    return (
      <div className={className}>
        <div className="interaction-block-header">
          <span className="interaction-block-icon">{resolved ? '✓' : '⚠'}</span>
          <span className="interaction-block-title">Plan: {block.plan.title}</span>
          <span className="interaction-block-status">{statusLabel}</span>
        </div>
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
        <div className="interaction-block-header">
          <span className="interaction-block-icon">{resolved ? '✓' : '⚠'}</span>
          <span className="interaction-block-title">{block.form.title}</span>
          <span className="interaction-block-status">{statusLabel}</span>
        </div>
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
        <div className="interaction-block-header">
          <span className="interaction-block-icon">{resolved ? '✓' : '⚠'}</span>
          <span className="interaction-block-title">{block.title ?? 'Proposed changes'}</span>
          <span className="interaction-block-status">{block.resolved === 'dismissed' ? '✕ Dismissed' : statusLabel}</span>
        </div>
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
        <div className="interaction-block-header">
          <span className="interaction-block-icon">{resolved ? '✓' : '⚠'}</span>
          <span className="interaction-block-title">
            Action: {block.action.actionType} → {block.action.target}
          </span>
          <span className="interaction-block-status">{statusLabel}</span>
        </div>
        {block.action.reasoning && <div className="interaction-block-reasoning">{block.action.reasoning}</div>}
      </div>
    );
  }

  if (block.kind === 'replay-network') {
    return (
      <div className={className}>
        <div className="interaction-block-header">
          <span className="interaction-block-icon">{resolved ? '✓' : '⚠'}</span>
          <span className="interaction-block-title">
            Replay: {block.payload.method} {block.payload.url}
          </span>
          <span className="interaction-block-status">{statusLabel}</span>
        </div>
        {block.payload.reasoning && <div className="interaction-block-reasoning">{block.payload.reasoning}</div>}
      </div>
    );
  }

  if (block.kind === 'brain-questions') {
    return (
      <div className={className}>
        <div className="interaction-block-header">
          <span className="interaction-block-icon">{resolved ? '✓' : '⚠'}</span>
          <span className="interaction-block-title">Questions</span>
          <span className="interaction-block-status">{statusLabel}</span>
        </div>
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

// ── Props ────────────────────────────────────────────────────────────────────

interface RemoteChatProps {
  sessionId: string;
  deviceName: string;
  deviceOnline: boolean;
  /** The device's currently-configured model (from its heartbeat), if known. */
  deviceModel?: string | null;
  onBack: () => void;
}

function fromRelayMessage(m: RelayMessage): ChatEntry {
  const c = m.content ?? {};
  return {
    id: String(m.id),
    role: m.role,
    content: typeof c.text === 'string' ? c.text : '',
    steps: Array.isArray(c.steps) ? (c.steps as string[]) : undefined,
    actions: Array.isArray(c.actions) ? (c.actions as string[]) : undefined,
    streaming: false,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function RemoteChat({ sessionId, deviceName, deviceOnline, deviceModel, onBack }: RemoteChatProps) {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef('');
  // Seed the composer model from the device's actual configured model so it
  // matches what the device will run; fall back to DEFAULT_MODEL if unknown.
  const [model, setModel] = useState<AnyModel>((deviceModel as AnyModel) || DEFAULT_MODEL);
  // The user may switch models in the composer; once they do, stop auto-syncing
  // from the device so we don't clobber their choice on the next presence poll.
  const userPickedModel = useRef(false);
  const [usage, setUsage] = useState<SessionUsage>({ inputTokens: 0, outputTokens: 0, cost: 0 });
  const [streaming, setStreaming] = useState(false);
  const [waitingForUser, setWaitingForUser] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<TaskPlan | null>(null);
  const [activeForm, setActiveForm] = useState<InteractiveForm | null>(null);
  const [activeProposals, setActiveProposals] = useState<{ title?: string; items: ProposalItem[] } | null>(null);
  const [activeSubAgents, setActiveSubAgents] = useState<SubAgentEntry[]>([]);
  const [activeGroups, setActiveGroups] = useState<SubAgentGroup[]>([]);
  const activeGroupsRef = useRef<SubAgentGroup[]>([]);
  const [currentLoopId, setCurrentLoopId] = useState<string | null>(null);
  const [contextUsage, setContextUsage] = useState<{ used: number; total: number }>({ used: 0, total: 0 });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [expandedPastes, setExpandedPastes] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ActionApprovalPayload | null>(null);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [pendingReplay, setPendingReplay] = useState<ReplayNetworkPayload | null>(null);
  const [pendingReplayId, setPendingReplayId] = useState<string | null>(null);
  const [brainQuestions, setBrainQuestions] = useState<{ questionId: string; questions: BrainQuestion[] } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Keep the composer model in sync with the device's configured model as the
  // parent refreshes it (presence poll), until the user explicitly picks one.
  useEffect(() => {
    if (userPickedModel.current) return;
    if (deviceModel && deviceModel !== model) setModel(deviceModel as AnyModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceModel]);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const portRef = useRef<RelayPortLike | null>(null);
  const draftsRef = useRef<Record<string, string>>({});

  const stashDraft = useCallback((baseId: string, text: string) => {
    if (text) draftsRef.current[baseId] = text;
    else delete draftsRef.current[baseId];
    persistDrafts(draftsRef.current);
  }, []);

  // Hydrate persisted drafts on mount.
  useEffect(() => {
    draftsRef.current = loadDrafts();
    const restored = draftsRef.current[sessionId];
    if (restored && !inputRef.current) {
      inputRef.current = restored;
      setInput(restored);
    }
  }, [sessionId]);

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

  const post = useCallback((frame: PanelToWorker) => {
    portRef.current?.postMessage(frame);
  }, []);

  // ── Wire the relay port + frame handler ─────────────────────────────────────
  useEffect(() => {
    const port = createRelayPort(sessionId);
    portRef.current = port;

    const handler = (msg: WorkerToPanel) => {
      if (msg.type === 'THINKING_CHUNK') {
        const id = streamingIdRef.current;
        if (!id) return;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, thinking: (m.thinking ?? '') + msg.delta } : m)));
      } else if (msg.type === 'STREAM_VERIFY') {
        const id = streamingIdRef.current;
        if (!id) return;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, verifyState: msg.state } : m)));
      } else if (msg.type === 'STREAM_CHUNK') {
        const id = streamingIdRef.current;
        if (!id) return;
        const delta = msg.delta;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            const acc = { content: m.content, actions: [...(m.actions ?? [])], steps: [...(m.steps ?? [])] };
            applyDelta(acc, delta);
            return { ...m, content: acc.content, actions: acc.actions, steps: acc.steps };
          })
        );
      } else if (msg.type === 'STREAM_RESET') {
        const id = streamingIdRef.current;
        if (!id) return;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: '', thinking: '', actions: [], steps: [] } : m)));
      } else if (msg.type === 'STREAM_DONE') {
        const id = streamingIdRef.current;
        setMessages((prev) => {
          let next = id ? prev.map((m) => (m.id === id ? { ...m, streaming: false } : m)) : prev;
          next = next.filter((m) => !(m.streaming && isEmptyAssistantBubble(m)));
          return next;
        });
        streamingIdRef.current = null;
        setStreaming(false);
        setCurrentLoopId(null);
        setActiveSubAgents((prev) => prev.filter((a) => a.status === 'running'));
        if (msg.inputTokens > 0 || msg.outputTokens > 0) {
          setUsage((u) => ({
            inputTokens: u.inputTokens + msg.inputTokens,
            outputTokens: u.outputTokens + msg.outputTokens,
            cost: u.cost + calcCost(model, msg.inputTokens, msg.outputTokens),
          }));
        }
      } else if (msg.type === 'STREAM_ERROR') {
        const id = streamingIdRef.current;
        const errText = msg.error || 'The request failed.';
        setMessages((prev) => {
          if (id && prev.some((m) => m.id === id)) {
            return prev.map((m) => (m.id === id ? { ...m, content: m.content || errText, streaming: false, error: true } : m));
          }
          const lastIdx = findLastIndex(prev, (m) => m.role === 'assistant');
          const last = lastIdx >= 0 ? prev[lastIdx] : null;
          const isBlank =
            last &&
            !last.content &&
            !last.thinking &&
            !last.actions?.length &&
            !last.steps?.length &&
            !last.interactionBlock &&
            !last.renderBlock &&
            !last.renderBlocks?.length;
          if (last && isBlank) {
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
          if (lastUserIdx >= 0 && filtered[lastUserIdx].content === msg.text) {
            return [...filtered, assistantEntry];
          }
          const userEntry: ChatEntry = { id: uuid(), role: 'user', content: msg.text };
          return [...filtered, userEntry, assistantEntry];
        });
        streamingIdRef.current = newAssistantId;
      } else if (msg.type === 'BACKGROUND_DONE') {
        const entry: ChatEntry = {
          id: uuid(),
          role: 'assistant',
          content: `✅ **Background task complete**\n\n${msg.title ?? ''}\n\n${msg.result ?? ''}`,
        };
        setMessages((prev) => [...prev, entry]);
      } else if (msg.type === 'SCHEDULE_RESULT') {
        setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: msg.markdown }]);
      } else if (msg.type === 'PLAN_CREATED') {
        setActivePlan(msg.plan);
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: 'assistant', content: '', interactionBlock: { kind: 'plan', plan: msg.plan } },
        ]);
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
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: 'assistant', content: '', interactionBlock: { kind: 'form', form: msg.form } },
        ]);
      } else if (msg.type === 'INTERACTIVE_PROPOSALS') {
        setActiveProposals({ title: msg.title, items: msg.items });
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: 'assistant', content: '', interactionBlock: { kind: 'proposals', title: msg.title, items: msg.items } },
        ]);
      } else if (msg.type === 'ACTION_APPROVAL_REQUEST') {
        setPendingApproval(msg.action);
        setPendingApprovalId(msg.actionId);
        setMessages((prev) => [
          ...prev,
          { id: uuid(), role: 'assistant', content: '', interactionBlock: { kind: 'approval', action: msg.action } },
        ]);
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
        const groupId = group?.groupId;
        setActiveSubAgents((prev) => [
          ...prev,
          {
            agentId: msg.agentId,
            subagentId: msg.subagentId,
            name: msg.name,
            status: 'running',
            loopId: msg.loopId,
            groupId,
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
      } else if (msg.type === 'USAGE_UPDATE' && msg.contextUsed && msg.contextTotal) {
        setContextUsage({ used: msg.contextUsed, total: msg.contextTotal });
      } else if (msg.type === 'SESSION_USAGE') {
        if ((!msg.sessionId || msg.sessionId === sessionId) && msg.context_used && msg.context_total) {
          setContextUsage({ used: msg.context_used, total: msg.context_total });
        }
      }
    };

    port.onMessage.addListener(handler);
    return () => {
      port.onMessage.removeListener(handler);
      port.disconnect();
      portRef.current = null;
    };
    // model is read inside STREAM_DONE for cost; re-subscribing on model change is cheap and correct.
  }, [sessionId, model]);

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
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (listRef.current && shouldAutoScroll(autoscrollPaused.current)) {
      programmaticScroll.current = true;
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, activePlan]);

  // ── Attachment handling ─────────────────────────────────────────────────────

  const addImageAttachment = useCallback(async (file: File) => {
    const data = await fileToBase64(file);
    const attachment: ImageAttachment = {
      id: uuid(),
      type: 'image',
      name: file.name,
      mediaType: file.type,
      data,
      thumbnail: `data:${file.type};base64,${data}`,
    };
    setAttachments((prev) => [...prev, attachment]);
  }, []);

  const addFileAttachment = useCallback(async (file: File) => {
    const data = await fileToBase64(file);
    let textContent: string | undefined;
    if (isTextFile(file.name)) textContent = await fileToText(file);
    const attachment: FileAttachment = {
      id: uuid(),
      type: 'file',
      name: file.name,
      mediaType: file.type || 'application/octet-stream',
      data,
      textContent,
    };
    setAttachments((prev) => [...prev, attachment]);
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
    if (!portRef.current) return;
    autoscrollPaused.current = pausedAfterSend();
    setInput('');
    inputRef.current = '';
    stashDraft(sessionId, '');

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
      autoscrollPaused.current = false;
      post({ type: 'SEND_MESSAGE', text: wire, model, sessionId });
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
    post({ type: 'SEND_MESSAGE', text: wire, model, sessionId });
  }, [
    streaming,
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
    sessionId,
    post,
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
    streamingIdRef.current = null;
    setStreaming(false);
  }

  function clearContext() {
    post({ type: 'CLEAR_SESSION_CONTEXT', sessionId });
    setContextUsage({ used: 0, total: 0 });
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
    post({ type: 'SEND_MESSAGE', text: lastUser.content, model, sessionId });
  }, [streaming, messages, model, sessionId, post]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    inputRef.current = val;
    setInput(val);
    stashDraft(sessionId, val);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
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
      const attachment: TextPasteAttachment = {
        id: uuid(),
        type: 'text_paste',
        name: `Pasted text (${sizeStr}, ${lineCount} line${lineCount > 1 ? 's' : ''})`,
        textContent: text,
        charCount: text.length,
        lineCount,
      };
      setAttachments((prev) => [...prev, attachment]);
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
    const lines = formSteps.flatMap((step) =>
      (step.fields ?? []).map((f) => {
        const val = data[f.id];
        return `${f.label}: ${Array.isArray(val) ? val.join(', ') : (val ?? '')}`;
      })
    );
    const userText =
      formSteps.length > 1
        ? formSteps
            .map((step) => {
              const stepLines = (step.fields ?? [])
                .map((f) => {
                  const val = data[f.id];
                  return `${f.label}: ${Array.isArray(val) ? val.join(', ') : (val ?? '')}`;
                })
                .join('\n');
              return `${step.title}:\n${stepLines}`;
            })
            .join('\n\n')
        : lines.join('\n');
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
      } else if (streaming) {
        setMessages((prev) => [...prev, userEntry]);
        post({ type: 'SEND_MESSAGE', text: value, model, sessionId });
      } else {
        const assistantId = uuid();
        setMessages((prev) => [...prev, userEntry, { id: assistantId, role: 'assistant', content: '', streaming: true }]);
        streamingIdRef.current = assistantId;
        setStreaming(true);
        post({ type: 'SEND_MESSAGE', text: value, model, sessionId });
      }
    },
    [waitingForUser, streaming, model, sessionId, post]
  );

  const openFile = useCallback((path: string) => post({ type: 'OPEN_FILE', path }), [post]);
  const openFolder = useCallback((path: string) => post({ type: 'OPEN_FOLDER', path }), [post]);
  const openLink = useCallback((url: string) => post({ type: 'OPEN_LINK', url }), [post]);

  return (
    <div className="rc-root chat-view" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <div className="rc-header">
        <button
          className="rc-back"
          onClick={onBack}
          aria-label="Back to devices"
          type="button"
        >
          ‹
        </button>
        <span className="rc-title">{deviceName}</span>
        <span className={`rc-status ${deviceOnline ? 'online' : 'offline'}`}>{deviceOnline ? 'online' : 'offline'}</span>
      </div>

      <div className="message-list rc-messages" ref={listRef} role="log" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && (
          <div className="rc-empty">Send a message to drive this device&apos;s browser.</div>
        )}
        {messages.map((m, idx) =>
          m.renderBlock ? (
            <RenderBlockView
              key={m.id}
              block={m.renderBlock}
              onProposalsRespond={handleProposalsRespond}
              onOpenFile={openFile}
              onOpenFolder={openFolder}
              onButtonClick={handleButtonClick}
            />
          ) : m.interactionBlock && !isInteractionLive(m.interactionBlock) ? (
            <InteractionBlockView
              key={m.id}
              block={m.interactionBlock}
              resolvedByNext={idx < messages.length - 1 && messages[idx + 1]?.role === 'user'}
            />
          ) : m.interactionBlock ? null : (
            <ChatBubble
              key={m.id}
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
              onRetry={m.error && idx === messages.length - 1 ? retryLastTurn : undefined}
              onOpenFile={openFile}
              onOpenFolder={openFolder}
              onOpenLink={openLink}
              feedback={undefined}
              onFeedback={undefined}
              verifyState={m.role === 'assistant' ? m.verifyState : undefined}
            />
          )
        )}

        {activePlan && <PlanView plan={activePlan} onApprove={handlePlanApprove} onReject={handlePlanReject} />}
        {activeForm && <InteractiveFormView form={activeForm} onSubmit={handleFormSubmit} onDismiss={handleFormDismiss} />}
        {activeProposals && (
          <ProposalTable
            title={activeProposals.title}
            items={activeProposals.items}
            onRespond={handleProposalsRespond}
            onDismiss={handleProposalsDismiss}
          />
        )}
        {pendingApproval && (
          <ActionApprovalCard
            action={pendingApproval}
            onDecision={(_actionId, decision) => {
              const label =
                decision === 'approve'
                  ? 'Approved'
                  : decision === 'deny'
                    ? 'Denied'
                    : decision === 'guide'
                      ? 'Guide me'
                      : decision === 'allow_always'
                        ? 'Always allow'
                        : 'Queued';
              setMessages((prev) => [
                ...prev,
                {
                  id: uuid(),
                  role: 'user',
                  content: `Action ${pendingApproval.actionType} on ${pendingApproval.target}: ${label}`,
                },
              ]);
              post({ type: 'ACTION_APPROVAL_RESPONSE', actionId: pendingApprovalId ?? _actionId, decision });
              setPendingApproval(null);
              setPendingApprovalId(null);
            }}
          />
        )}
        {pendingReplay && (
          <ReplayNetworkCard
            payload={pendingReplay}
            onDecision={(_actionId, decision) => {
              const label = decision === 'approve' ? 'Approved replay' : 'Denied replay';
              setMessages((prev) => [
                ...prev,
                { id: uuid(), role: 'user', content: `${pendingReplay.method} ${pendingReplay.url}: ${label}` },
              ]);
              post({
                type: 'ACTION_APPROVAL_RESPONSE',
                actionId: pendingReplayId ?? _actionId,
                decision: decision as 'approve' | 'deny',
              });
              setPendingReplay(null);
              setPendingReplayId(null);
            }}
          />
        )}
        {brainQuestions && (
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
              setMessages((prev) => [
                ...prev,
                { id: uuid(), role: 'user', content: "(skipped the questions — I'll answer in my own words)" },
              ]);
              post({ type: 'BRAIN_QUESTIONS_RESPONSE', questionId, answers: { __cancelled: 'true' } });
              setBrainQuestions(null);
            }}
          />
        )}
      </div>

      {currentLoopId && activeSubAgents.filter((a) => a.loopId === currentLoopId).length > 0 && (
        <div className="subagent-sticky">
          <SubAgentCard
            agents={activeSubAgents.filter((a) => a.loopId === currentLoopId)}
            groups={activeGroups.filter((g) => g.loopId === currentLoopId)}
            onStop={(agentId) => post({ type: 'STOP_SUBAGENT', agentId })}
          />
        </div>
      )}

      <div className={`input-area rc-composer ${dragOver ? 'drag-over' : ''}`}>
        {waitingForUser && (
          <div className="wait-for-user-banner">
            <span className="wfu-label">⏸ The assistant needs your help</span>
            <span className="wfu-message">{waitingForUser}</span>
          </div>
        )}

        {!deviceOnline && !waitingForUser && (
          <div className="rc-banner">Device appears offline — messages will queue until it reconnects.</div>
        )}
        {banner && <div className="rc-banner">{banner}</div>}

        {attachments.length > 0 && (
          <div className="attachments-bar">
            {attachments.map((att) => (
              <div key={att.id} className={`attachment-badge${att.type === 'text_paste' ? ' text-paste-badge' : ''}`}>
                {att.type === 'image' ? (
                  <img src={(att as ImageAttachment).thumbnail} alt={att.name} />
                ) : att.type === 'text_paste' ? (
                  <span
                    className="attachment-icon"
                    onClick={() =>
                      setExpandedPastes((prev) => {
                        const next = new Set(prev);
                        if (next.has(att.id)) next.delete(att.id);
                        else next.add(att.id);
                        return next;
                      })
                    }
                  >
                    📋
                  </span>
                ) : (
                  <span className="attachment-icon">📄</span>
                )}
                <span
                  className="attachment-name"
                  onClick={
                    att.type === 'text_paste'
                      ? () =>
                          setExpandedPastes((prev) => {
                            const next = new Set(prev);
                            if (next.has(att.id)) next.delete(att.id);
                            else next.add(att.id);
                            return next;
                          })
                      : undefined
                  }
                  style={att.type === 'text_paste' ? { cursor: 'pointer' } : undefined}
                >
                  {att.name.length > 20 ? att.name.slice(0, 18) + '...' : att.name}
                </span>
                <span className="remove" onClick={() => removeAttachment(att.id)}>
                  ✕
                </span>
                {att.type === 'text_paste' && expandedPastes.has(att.id) && (
                  <div className="text-paste-preview">
                    <pre>{(att as TextPasteAttachment).textContent}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="input-row">
          <button
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            aria-label="Attach file"
            type="button"
          >
            +
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.html,.css,.yaml,.yml,.xml,.log"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              className="input-field"
              placeholder={waitingForUser ? 'Type your reply...' : 'Message...'}
              aria-label="Message"
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
            />
          </div>
          {streaming || waitingForUser ? (
            <button className="send-btn stop-btn" onClick={stop} aria-label="Stop" type="button">
              ■
            </button>
          ) : (
            <button
              className="send-btn"
              onClick={send}
              disabled={!input.trim() && attachments.length === 0}
              aria-label="Send"
              type="button"
            >
              ↑
            </button>
          )}
          <ContextIndicator used={contextUsage.used} total={contextUsage.total} onClear={clearContext} />
        </div>

        <TokenFooterRow
          model={model}
          usage={usage}
          onModelChange={(m) => {
            userPickedModel.current = true;
            setModel(m);
          }}
        />
      </div>
    </div>
  );
}

// Thin wrapper so the model selector + cumulative usage render below the composer.
function TokenFooterRow({
  model,
  usage,
  onModelChange,
}: {
  model: AnyModel;
  usage: SessionUsage;
  onModelChange: (m: AnyModel) => void;
}) {
  return <TokenFooter model={model} usage={usage} onModelChange={onModelChange} sessionCost={usage.cost} />;
}
