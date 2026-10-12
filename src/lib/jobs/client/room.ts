/**
 * Typed client for the job room API (app/api/contracts/[id]/**) and the pure mappers the
 * room (src/views/gigs/JobRoom.tsx) renders. Both parties use it; the API decides what each
 * role may do (unknown contract 404, not a party 403; errors are `{ error, message }`).
 *
 *   GET  /api/contracts/:id                         → RoomContractDetail
 *   GET  /api/contracts/:id/messages?since=<seq>    → { messages, next_cursor }
 *   POST /api/contracts/:id/messages                { body } → { message }
 *   GET  /api/contracts/:id/activity?since=<seq>    → { events, next_cursor }
 *   GET  /api/contracts/:id/milestones?since=<ts>   → { milestones, next_cursor }
 *   POST /api/contracts/:id/milestones              (provider) create / update → { milestone }
 *   POST /api/contracts/:id/progress                (provider) { summary, details? } → { message }
 *   GET  /api/contracts/:id/steering?since=<ts>     → { steering, next_cursor }
 *   POST /api/contracts/:id/steering                (customer) → { steering, decision }
 *   POST /api/contracts/:id/steering/:sid/respond   (provider) answer / re-estimate / decline
 *   POST /api/contracts/:id/steering/:sid/approve   (customer) → { checkout_url?, refund? }
 *   POST /api/contracts/:id/steering/:sid/reject    (customer)
 *   POST /api/contracts/:id/steering/:sid/topup     (customer) a fresh top-up Checkout
 *   POST /api/contracts/:id/versions/:vid/accept    (provider) sign the customer's proposed terms
 *   GET  /api/contracts/:id/qa                      → RoomQa (submissions and verdicts)
 */
import { formatDate, formatEuros, humanize } from './format';

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

/** `?tab=` → a tab id; anything unknown opens the Plan tab. */
export function tabFromQuery(value: string | null | undefined): RoomTabId {
  return ROOM_TABS.find((t) => t.id === value)?.id ?? 'plan';
}

// ---------- API shapes (the subset the UI reads) ----------

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
  updated_at?: string;
}

export interface RoomSteering {
  id: string;
  kind: string;
  status: string;
  message: string;
  response: string | null;
  credit_cost: number;
  created_at: string;
  updated_at: string;
  spec_changes: string[];
  proposed_price_cents: number | null;
  proposed_deadline: string | null;
  estimate_delta_cents: number | null;
  estimate_eta_days: number | null;
  deliverable_changes: string[];
  base_contract_version_id: string;
  new_contract_version_id: string | null;
  topup_amount_cents: number;
  topup_status: 'none' | 'pending' | 'paid' | 'expired';
  topup_checkout_url: string | null;
  refund_amount_cents: number;
  refund_status: 'none' | 'refunded' | 'credit_pending' | 'credit_settled';
}

export type VersionState = 'current' | 'superseded' | 'proposed' | 'rejected';

export interface RoomVersion {
  id: string;
  version: number;
  spec_version_id: string;
  price_cents: number;
  fee_cents: number;
  customer_total_cents: number;
  commission_bps: number;
  currency: string;
  deadline: string | null;
  steering_allowance: number;
  state: VersionState;
  created_at: string;
}

export interface RoomSpec {
  id: string;
  version: number;
  requirements: string[];
  deliverables: string[];
  acceptance_criteria: string[];
}

export interface SteeringCredits {
  allowance: number;
  used: number;
  remaining: number;
}

export interface RoomContractDetail {
  contract: { id: string; status: string; [k: string]: unknown };
  role: PartyRole;
  job: { id: string; title: string; status: string } | null;
  spec: RoomSpec | null;
  specs: RoomSpec[];
  current_version: RoomVersion | null;
  versions: RoomVersion[];
  work_paused: boolean;
  steering_credits: SteeringCredits;
}

export interface RoomSubmission {
  id: string;
  attempt: number;
  status: string;
  repo_full_name: string;
  commit_sha: string;
  submitted_at: string;
}

export interface RoomReview {
  id: string;
  attempt: number | null;
  verdict: string;
  reason: string | null;
  created_at: string;
}

export interface RoomQa {
  contract_status: string;
  submissions: RoomSubmission[];
  reviews: RoomReview[];
  can_resubmit: boolean;
}

export interface CreateSteeringInput {
  message: string;
  requested_kind?: 'clarification' | 'revision' | 'scope_change';
  spec_changes?: string[];
  price_cents?: number;
  deadline?: string;
}

export interface RespondSteeringInput {
  response: string;
  estimate_delta_cents?: number;
  eta_days?: number;
  deliverable_changes?: string[];
  decline?: boolean;
}

export interface SaveMilestoneInput {
  milestone_id?: string;
  title?: string;
  description?: string;
  status: MilestoneStatus;
}

export interface ProgressInput {
  summary: string;
  details?: string;
  percent_complete?: number;
}

export interface SteeringDecisionView {
  kind: 'clarification' | 'revision' | 'scope_change';
  consumesCredit: boolean;
  requiresApproval: boolean;
}

export interface ApproveResult {
  steering: RoomSteering;
  checkout_url?: string;
  refund?: { amount_cents: number; status: 'refunded' | 'credit_pending' };
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
  const seg = encodeURIComponent;
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
  const post = <T>(url: string, data: unknown = {}) =>
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
    saveMilestone: (id: string, input: SaveMilestoneInput) => post<{ milestone: RoomMilestone }>(path(id, '/milestones'), input),
    postProgress: (id: string, input: ProgressInput) => post<{ message: RoomMessage }>(path(id, '/progress'), input),
    steering: (id: string, opts: { status?: string; since?: string | null } = {}) =>
      call<{ steering: RoomSteering[]; next_cursor: string }>(path(id, `/steering${query({ status: opts.status, since: opts.since })}`)),
    createSteering: (id: string, input: CreateSteeringInput) =>
      post<{ steering: RoomSteering; decision: SteeringDecisionView }>(path(id, '/steering'), input),
    respondSteering: (id: string, sid: string, input: RespondSteeringInput) =>
      post<{ steering: RoomSteering }>(path(id, `/steering/${seg(sid)}/respond`), input),
    approveSteering: (id: string, sid: string) => post<ApproveResult>(path(id, `/steering/${seg(sid)}/approve`)),
    rejectSteering: (id: string, sid: string) => post<{ steering: RoomSteering }>(path(id, `/steering/${seg(sid)}/reject`)),
    regenerateTopup: (id: string, sid: string) =>
      post<{ steering: RoomSteering; checkout_url: string }>(path(id, `/steering/${seg(sid)}/topup`)),
    acceptVersion: (id: string, vid: string) => post<ApproveResult>(path(id, `/versions/${seg(vid)}/accept`)),
    qa: (id: string) => call<RoomQa>(path(id, '/qa')),
  };
}
export type RoomClient = ReturnType<typeof createRoomClient>;

// ---------- feeds ----------

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

/** A message the viewer sent that the server hasn't confirmed (yet). */
export interface PendingMessage {
  clientId: string;
  body: string;
  at: string;
  state: 'sending' | 'failed';
}

export interface ChatItem {
  key: string;
  author: string;
  mine: boolean;
  body: string;
  at: string;
  label: string | null;
  state: 'sent' | 'sending' | 'failed';
}

/** Confirmed messages in seq order, then the viewer's pending and failed sends. */
export function chatItems(messages: readonly RoomMessage[], pending: readonly PendingMessage[], viewer: PartyRole): ChatItem[] {
  const sent: ChatItem[] = toMessageItems(messages, viewer).map((m) => ({
    key: m.id,
    author: m.byAgent ? `${m.author} (agent)` : m.author,
    mine: m.mine,
    body: m.body,
    at: m.at,
    label: m.kind === 'progress' ? 'Progress update' : null,
    state: 'sent',
  }));
  return [
    ...sent,
    ...pending.map((p) => ({ key: p.clientId, author: 'You', mine: true, body: p.body, at: p.at, label: null, state: p.state })),
  ];
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

/** Event types that are progress a person cares about; anything else (internal, debug) is not shown. */
const TIMELINE_TYPES = new Set([
  'payment_received',
  'topup_paid',
  'refund_issued',
  'progress_posted',
  'milestone_created',
  'milestone_updated',
  'steering_requested',
  'steering_responded',
  'scope_change_approved',
  'scope_change_rejected',
  'submission_received',
  'qa_verdict',
]);

const SUMMARY_MAX = 280;

function clipLine(text: string): string {
  const line = text.split('\n')[0].trim();
  return line.length > SUMMARY_MAX ? `${line.slice(0, SUMMARY_MAX - 1)}…` : line;
}

/** The Activity tab: known event types only, first line of each summary, clipped. Never raw logs. */
export function activityTimeline(events: readonly RoomActivityEvent[], viewer: PartyRole): ActivityItem[] {
  return toActivityItems(
    events.filter((e) => TIMELINE_TYPES.has(e.type)),
    viewer,
  ).map((a) => ({ ...a, summary: clipLine(a.summary) }));
}

/** Add a polled page to a seq-ordered feed; a newer copy of an id replaces the old one. */
export function mergeFeed<T extends { id: string; seq: number }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of [...existing, ...incoming]) byId.set(item.id, item);
  return [...byId.values()].sort(bySeq);
}

/** Merge rows that change in place (milestones, steering) by id, keeping the first-seen order. */
export function mergeById<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>(existing.map((x) => [x.id, x]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}

// ---------- milestones ----------

export function milestoneSummary(milestones: readonly Pick<RoomMilestone, 'status'>[]): { done: number; total: number; percent: number } {
  const total = milestones.length;
  const done = milestones.filter((m) => m.status === 'done').length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

export const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
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

// ---------- steering ----------

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

export function toSteeringItems(rows: readonly Pick<RoomSteering, 'id' | 'kind' | 'status' | 'message' | 'response' | 'credit_cost' | 'created_at'>[], viewer: PartyRole): SteeringItem[] {
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

/** The classification, said plainly: "Clarification, free", "Revision, uses 1 of your 3 steering credits", … */
export function steeringKindText(kind: string, { viewer, allowance }: { viewer: PartyRole; allowance: number }): string {
  if (kind === 'clarification') return 'Clarification, free';
  if (kind === 'scope_change') return 'Scope change, needs a new estimate';
  if (kind === 'revision') {
    const whose = viewer === 'customer' ? 'your' : "the customer's";
    return allowance === 1 ? `Revision, uses ${whose} 1 steering credit` : `Revision, uses 1 of ${whose} ${allowance} steering credits`;
  }
  return humanize(kind);
}

export function creditsText(c: SteeringCredits): string {
  return `Steering credits: ${c.remaining} of ${c.allowance} left`;
}

function signedEuros(cents: number): string {
  return cents > 0 ? `+${formatEuros(cents)}` : formatEuros(cents);
}

/** "Price: €300 → €350 (+€50)". */
export function priceChangeText(fromCents: number, toCents: number, label = 'Price'): string {
  if (fromCents === toCents) return `${label}: ${formatEuros(fromCents)} (unchanged)`;
  return `${label}: ${formatEuros(fromCents)} → ${formatEuros(toCents)} (${signedEuros(toCents - fromCents)})`;
}

/** The provider's re-estimate of a scope change, against the version it started from. */
export function estimateView(
  s: Pick<RoomSteering, 'estimate_delta_cents' | 'estimate_eta_days' | 'deliverable_changes' | 'base_contract_version_id' | 'new_contract_version_id'>,
  versions: readonly RoomVersion[],
): { lines: string[]; deliverableChanges: string[] } | null {
  const hasEstimate = s.estimate_delta_cents != null || s.estimate_eta_days != null || s.deliverable_changes.length > 0;
  const base = versions.find((v) => v.id === s.base_contract_version_id);
  if (!hasEstimate || !base) return null;
  const proposed = versions.find((v) => v.id === s.new_contract_version_id);
  const lines = [priceChangeText(base.price_cents, proposed?.price_cents ?? base.price_cents + (s.estimate_delta_cents ?? 0))];
  if (proposed) lines.push(priceChangeText(base.customer_total_cents, proposed.customer_total_cents, 'Total with fee'));
  if (s.estimate_eta_days != null) lines.push(`ETA: ${s.estimate_eta_days} ${s.estimate_eta_days === 1 ? 'day' : 'days'}`);
  return { lines, deliverableChanges: [...s.deliverable_changes] };
}

export function refundNotice(cents: number): string {
  return `We're refunding ${formatEuros(cents)} to you.`;
}

/** What's left to pay after an approved scope change raised the price. */
export function topupView(
  s: Pick<RoomSteering, 'status' | 'topup_status' | 'topup_amount_cents' | 'topup_checkout_url'>,
): { state: 'pending' | 'expired' | 'paid'; text: string; note: string | null; url: string | null } | null {
  if (s.status !== 'approved' || s.topup_status === 'none') return null;
  const amount = formatEuros(s.topup_amount_cents);
  if (s.topup_status === 'paid') return { state: 'paid', text: `Top-up of ${amount} paid`, note: null, url: null };
  if (s.topup_status === 'expired') return { state: 'expired', text: `Top-up of ${amount} pending`, note: 'The checkout link expired.', url: null };
  return { state: 'pending', text: `Top-up of ${amount} pending`, note: null, url: s.topup_checkout_url };
}

// ---------- plan: version history ----------

export function diffList(prev: readonly string[], next: readonly string[]): { added: string[]; removed: string[] } {
  return { added: next.filter((x) => !prev.includes(x)), removed: prev.filter((x) => !next.includes(x)) };
}

const VERSION_STATE_LABELS: Record<VersionState, string> = {
  current: 'Current',
  superseded: 'Superseded',
  proposed: 'Proposed',
  rejected: 'Rejected',
};

const SPEC_LISTS = [
  ['requirements', 'requirement'],
  ['deliverables', 'deliverable'],
  ['acceptance_criteria', 'acceptance criterion'],
] as const;

function versionChanges(prev: RoomVersion, next: RoomVersion, specs: ReadonlyMap<string, RoomSpec>): string[] {
  const out: string[] = [];
  if (prev.price_cents !== next.price_cents) out.push(`Price: ${formatEuros(prev.price_cents)} → ${formatEuros(next.price_cents)}`);
  if (prev.deadline !== next.deadline) {
    const d = (iso: string | null) => (iso ? formatDate(iso) : 'none');
    if (d(prev.deadline) !== d(next.deadline)) out.push(`Deadline: ${d(prev.deadline)} → ${d(next.deadline)}`);
  }
  const a = specs.get(prev.spec_version_id);
  const b = specs.get(next.spec_version_id);
  if (a && b && a.id !== b.id) {
    for (const [key, noun] of SPEC_LISTS) {
      const { added, removed } = diffList(a[key], b[key]);
      for (const x of added) out.push(`Added ${noun}: ${x}`);
      for (const x of removed) out.push(`Removed ${noun}: ${x}`);
    }
  }
  return out.length ? out : ['No changes to the terms'];
}

export interface VersionItem {
  id: string;
  label: string;
  state: VersionState;
  stateLabel: string;
  at: string;
  changes: string[];
}

/** Contract versions oldest first, each with what changed from the one before. */
export function toVersionItems(versions: readonly RoomVersion[], specs: readonly RoomSpec[]): VersionItem[] {
  const bySpec = new Map(specs.map((s) => [s.id, s]));
  const sorted = [...versions].sort((a, b) => a.version - b.version);
  return sorted.map((v, i) => ({
    id: v.id,
    label: `Version ${v.version}`,
    state: v.state,
    stateLabel: VERSION_STATE_LABELS[v.state],
    at: v.created_at,
    changes: i === 0 ? [] : versionChanges(sorted[i - 1], v, bySpec),
  }));
}

// ---------- status ----------

const STEPS = ['Paid', 'In progress', 'In QA', 'Delivered', 'Completed'] as const;
const STEP_OF: Record<string, number> = {
  pending_payment: 0,
  active: 1,
  rework: 1,
  submitted: 2,
  in_qa: 2,
  delivered: 3,
  completed: 5,
};

/** The happy path as steps; null for disputed, cancelled or refunded contracts. */
export function contractSteps(status: string): Array<{ label: string; state: 'done' | 'current' | 'upcoming' }> | null {
  const at = STEP_OF[status];
  if (at === undefined) return null;
  return STEPS.map((label, i) => ({ label, state: i < at ? 'done' : i === at ? 'current' : 'upcoming' }));
}

const DAY_MS = 86_400_000;

/** "10 days left", "Due today", "3 days overdue", in UTC calendar days ('' without a deadline). */
export function deadlineCountdown(iso: string | null | undefined, now: Date): string {
  const t = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(t)) return '';
  const day = (ms: number) => Math.floor(ms / DAY_MS);
  const diff = day(t) - day(now.getTime());
  if (diff === 0) return 'Due today';
  const n = Math.abs(diff);
  const days = `${n} ${n === 1 ? 'day' : 'days'}`;
  return diff > 0 ? `${days} left` : `${days} overdue`;
}

// ---------- QA and artifacts ----------

const SUBMISSION_LABELS: Record<string, string> = {
  awaiting_qa: 'Waiting for QA',
  in_review: 'In review',
  validated: 'Validated',
  requires_changes: 'Changes requested',
  rejected: 'Rejected',
};
const statusLabelOf = (s: string) => SUBMISSION_LABELS[s] ?? humanize(s);

export function toSubmissionItems(subs: readonly RoomSubmission[]) {
  return [...subs]
    .sort((a, b) => a.attempt - b.attempt)
    .map((s) => ({
      id: s.id,
      attemptLabel: `Attempt ${s.attempt}`,
      repo: s.repo_full_name,
      commit: s.commit_sha.slice(0, 7),
      statusLabel: statusLabelOf(s.status),
      at: s.submitted_at,
    }));
}

/** The QA state of the latest attempt. */
export function qaStateLabel(subs: readonly RoomSubmission[]): string {
  if (subs.length === 0) return 'No work submitted yet.';
  const latest = subs.reduce((a, b) => (b.attempt > a.attempt ? b : a));
  return statusLabelOf(latest.status);
}

export function toReviewItems(reviews: readonly RoomReview[]) {
  return [...reviews]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((r) => ({
      id: r.id,
      title: r.attempt != null ? `Attempt ${r.attempt}: ${statusLabelOf(r.verdict)}` : statusLabelOf(r.verdict),
      reason: r.reason,
      at: r.created_at,
    }));
}
