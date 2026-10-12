/**
 * Typed client for the job room API (app/api/contracts/[id]/**, built by the job-room
 * track) and the pure mappers the contract page uses to render it.
 *
 * Endpoints (all for the contract's two parties; errors are `{ error, message }`):
 *   GET  /api/contracts/:id                → ContractDetail
 *   GET  /api/contracts/:id/messages?since → { messages, next_cursor }  (seq cursor)
 *   POST /api/contracts/:id/messages       { body } → { message }
 *   GET  /api/contracts/:id/activity?since → { events, next_cursor }    (seq cursor)
 *   GET  /api/contracts/:id/milestones?since → { milestones, next_cursor } (updated_at cursor)
 *   GET  /api/contracts/:id/steering?status&since → { steering, next_cursor }
 *   POST /api/contracts/:id/steering       { message, requested_kind?, ... } → { steering, decision }
 *
 * The page only calls these when NEXT_PUBLIC_GIGS_JOB_ROOM is on (jobRoomEnabled); until
 * the endpoints ship it shows empty states.
 */
import { humanize } from './format';

export type PartyRole = 'customer' | 'provider';
type AuthorRole = PartyRole | 'system';

export const ROOM_TABS = [
  { id: 'plan', label: 'Plan' },
  { id: 'status', label: 'Status' },
  { id: 'activity', label: 'Activity' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'messages', label: 'Messages' },
  { id: 'steering', label: 'Steering' },
  { id: 'qa', label: 'QA' },
  { id: 'delivery', label: 'Delivery' },
] as const;
export type RoomTabId = (typeof ROOM_TABS)[number]['id'];

export function jobRoomEnabled(env: Record<string, string | undefined>): boolean {
  const v = (env.NEXT_PUBLIC_GIGS_JOB_ROOM ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

// ---------- API shapes (subset the UI reads) ----------

export interface RoomMessage {
  id: string;
  seq: number;
  author_role: AuthorRole;
  kind: 'message' | 'progress' | 'system';
  body: string;
  created_at: string;
  agent_identity_id: string | null;
}

export interface RoomActivityEvent {
  id: string;
  seq: number;
  actor_role: AuthorRole;
  type: string;
  summary: string;
  created_at: string;
}

export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

export interface RoomMilestone {
  id: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  position: number;
  due_at: string | null;
  completed_at: string | null;
}

export interface RoomSteering {
  id: string;
  kind: string;
  status: string;
  message: string;
  response: string | null;
  credit_cost: number;
  created_at: string;
}

export interface RoomContractDetail {
  contract: { id: string; status: string; [k: string]: unknown };
  role: PartyRole;
  job: { id: string; title: string; status: string } | null;
  work_paused?: boolean;
  steering_credits?: { allowance: number; used: number; remaining: number };
  [k: string]: unknown;
}

export interface CreateSteeringInput {
  message: string;
  requested_kind?: 'clarification' | 'revision' | 'scope_change';
  spec_changes?: string[];
  price_cents?: number;
  deadline?: string;
}

// ---------- client ----------

export class RoomApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'RoomApiError';
    this.status = status;
    this.code = code;
  }
}

export function apiErrorFrom(status: number, body: unknown): RoomApiError {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: unknown; message?: unknown };
  const code = typeof b.error === 'string' ? b.error : `http_${status}`;
  const message = typeof b.message === 'string' ? b.message : `Request failed (${status})`;
  return new RoomApiError(status, code, message);
}

export function createRoomClient({ fetch: fetchImpl = fetch, base = '' }: { fetch?: typeof fetch; base?: string } = {}) {
  const path = (id: string, rest = '') => `${base}/api/contracts/${encodeURIComponent(id)}${rest}`;
  const query = (params: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : '';
  };

  async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(url, { credentials: 'same-origin', cache: 'no-store', ...init });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) throw apiErrorFrom(res.status, body);
    return body as T;
  }
  const post = <T>(url: string, data: unknown) =>
    call<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

  return {
    contract: (id: string) => call<RoomContractDetail>(path(id)),
    messages: (id: string, since?: string | null) =>
      call<{ messages: RoomMessage[]; next_cursor: string }>(path(id, `/messages${query({ since })}`)),
    postMessage: (id: string, body: string) => post<{ message: RoomMessage }>(path(id, '/messages'), { body }),
    activity: (id: string, since?: string | null) =>
      call<{ events: RoomActivityEvent[]; next_cursor: string }>(path(id, `/activity${query({ since })}`)),
    milestones: (id: string, since?: string | null) =>
      call<{ milestones: RoomMilestone[]; next_cursor: string }>(path(id, `/milestones${query({ since })}`)),
    steering: (id: string, opts: { status?: string; since?: string } = {}) =>
      call<{ steering: RoomSteering[]; next_cursor: string }>(path(id, `/steering${query({ status: opts.status, since: opts.since })}`)),
    createSteering: (id: string, input: CreateSteeringInput) => post<{ steering: RoomSteering }>(path(id, '/steering'), input),
  };
}
export type RoomClient = ReturnType<typeof createRoomClient>;

// ---------- mappers ----------

export function actorLabel(role: AuthorRole, viewer: PartyRole): string {
  if (role === 'system') return 'Tulzo';
  if (role === viewer) return 'You';
  return role === 'customer' ? 'Customer' : 'Provider';
}

const bySeq = <T extends { seq: number }>(a: T, b: T) => a.seq - b.seq;

export interface MessageItem {
  id: string;
  seq: number;
  author: string;
  mine: boolean;
  kind: RoomMessage['kind'];
  body: string;
  at: string;
  byAgent: boolean;
}

export function toMessageItems(messages: readonly RoomMessage[], viewer: PartyRole): MessageItem[] {
  return [...messages].sort(bySeq).map((m) => ({
    id: m.id,
    seq: m.seq,
    author: actorLabel(m.author_role, viewer),
    mine: m.author_role === viewer,
    kind: m.kind,
    body: m.body,
    at: m.created_at,
    byAgent: m.agent_identity_id != null,
  }));
}

export interface ActivityItem {
  id: string;
  seq: number;
  actor: string;
  type: string;
  summary: string;
  at: string;
}

export function toActivityItems(events: readonly RoomActivityEvent[], viewer: PartyRole): ActivityItem[] {
  return [...events].sort(bySeq).map((e) => ({
    id: e.id,
    seq: e.seq,
    actor: actorLabel(e.actor_role, viewer),
    type: e.type,
    summary: e.summary,
    at: e.created_at,
  }));
}

/** Add a polled page to a seq-ordered feed; a newer copy of an id replaces the old one. */
export function mergeFeed<T extends { id: string; seq: number }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of [...existing, ...incoming]) byId.set(item.id, item);
  return [...byId.values()].sort(bySeq);
}

export function milestoneSummary(milestones: readonly Pick<RoomMilestone, 'status'>[]): { done: number; total: number; percent: number } {
  const total = milestones.length;
  const done = milestones.filter((m) => m.status === 'done').length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Not started',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
};

export function toMilestoneItems(milestones: readonly RoomMilestone[]) {
  return [...milestones]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      status: m.status,
      statusLabel: MILESTONE_LABELS[m.status],
      due: m.due_at,
    }));
}

/** Who has to act next on a steering request, by status. */
const WAITING_ON: Record<string, PartyRole> = {
  open: 'provider',
  awaiting_estimate: 'provider',
  awaiting_provider: 'provider',
  awaiting_approval: 'customer',
};

const FIXED_STATUS_LABELS: Record<string, string> = {
  open: 'Waiting for an answer',
  awaiting_estimate: 'Waiting for an estimate',
};

export interface SteeringItem {
  id: string;
  kindLabel: string;
  statusLabel: string;
  waitingOn: string | null;
  message: string;
  response: string | null;
  creditCost: number;
  at: string;
}

export function toSteeringItems(rows: readonly RoomSteering[], viewer: PartyRole): SteeringItem[] {
  return rows.map((s) => {
    const waiting = WAITING_ON[s.status] ?? null;
    let statusLabel = FIXED_STATUS_LABELS[s.status];
    if (!statusLabel) {
      if (waiting === viewer) statusLabel = s.status === 'awaiting_approval' ? 'Waiting for your approval' : 'Waiting for your reply';
      else if (waiting) statusLabel = `Waiting for the ${waiting}`;
      else statusLabel = humanize(s.status);
    }
    return {
      id: s.id,
      kindLabel: humanize(s.kind), // clarification → Clarification, scope_change → Scope change
      statusLabel,
      waitingOn: waiting ? (waiting === viewer ? 'You' : waiting === 'customer' ? 'Customer' : 'Provider') : null,
      message: s.message,
      response: s.response,
      creditCost: s.credit_cost,
      at: s.created_at,
    };
  });
}
