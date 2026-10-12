/**
 * The in-app channel: what an event looks like in the bell and on hub /notifications, where it
 * links (a path on one surface; the UI builds the URL with surfaceUrl), and how repeats are
 * handled. Pure: the store applies the plan from `planInAppWrite`.
 *
 * Aggregation: `package_installed` keeps at most one item per user, package and hour. A later
 * install in the same hour bumps that item's count, rewrites its title and makes it unread again.
 */
import { formatMoney } from './templates/content.ts';
import type { NotificationType, Payload } from './types.ts';
import type { Surface } from './urls.ts';

export interface InAppContent {
  title: string;
  body: string | null;
  surface: Surface;
  /** Path on `surface`, e.g. `/jobs/123`. Never absolute. */
  url: string;
}

export const AGGREGATE_WINDOW_MS = 3_600_000;
const TITLE_MAX = 200;
const BODY_MAX = 500;

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const enc = encodeURIComponent;
const job = (p: { jobId: string }) => `/jobs/${enc(p.jobId)}`;
const room = (p: { contractId: string }, tab?: string) => `/contracts/${enc(p.contractId)}${tab ? `?tab=${tab}` : ''}`;
const delivery = (p: { contractId: string }) => `/contracts/${enc(p.contractId)}/delivery`;
const euros = (p: { amountCents: number; currency: string }) => formatMoney(p.amountCents, p.currency);

type Raw = { title: string; body?: string | null; surface: Surface; url: string };
type Renderers = { [T in NotificationType]: (p: Payload<T>, count: number) => Raw };

const VERDICT: Record<'pass' | 'fail' | 'needs_changes', string> = { pass: 'passed', fail: 'failed', needs_changes: 'needs changes' };

const renderers: Renderers = {
  job_posted: (p) => ({ title: `Your job is live: ${p.jobTitle}`, body: 'Agents can now send bids.', surface: 'gigs', url: job(p) }),
  bid_received: (p) => ({ title: `New bid on ${p.jobTitle}`, body: `${p.bidderName} bid ${euros(p)}`, surface: 'gigs', url: job(p) }),
  bid_accepted: (p) => ({ title: `Your bid was accepted: ${p.jobTitle}`, body: `${euros(p)}. Work starts once payment is confirmed.`, surface: 'gigs', url: p.contractId ? room({ contractId: p.contractId }) : job(p) }),
  contract_created: (p) => ({ title: `Contract started: ${p.jobTitle}`, body: `With ${p.counterpartyName}, ${euros(p)}`, surface: 'gigs', url: room(p) }),
  payment_confirmed: (p) => ({ title: `Payment confirmed: ${p.jobTitle}`, body: `${euros(p)} held until you accept the delivery`, surface: 'gigs', url: room(p) }),
  steering_awaiting_approval: (p) => ({ title: `Approval needed: ${p.jobTitle}`, body: `${p.requestedBy}: ${p.summary}`, surface: 'gigs', url: room(p, 'steering') }),
  scope_change_awaiting_approval: (p) => ({ title: `Scope change to approve: ${p.jobTitle}`, body: `${p.requestedBy}: ${p.summary}`, surface: 'gigs', url: room(p, 'steering') }),
  submission_received: (p) => ({ title: `Work submitted for QA: ${p.jobTitle}`, body: `From ${p.providerName}`, surface: 'gigs', url: room(p, 'qa') }),
  qa_verdict: (p) => ({ title: `QA ${VERDICT[p.verdict]}: ${p.jobTitle}`, body: p.summary ?? null, surface: 'gigs', url: room(p, 'qa') }),
  delivery_ready: (p) => ({ title: `Delivery ready: ${p.jobTitle}`, body: 'Review it and accept, or open a dispute.', surface: 'gigs', url: delivery(p) }),
  auto_accept_reminder: (p) => ({ title: `Delivery auto-accepts soon: ${p.jobTitle}`, body: null, surface: 'gigs', url: delivery(p) }),
  dispute_opened: (p) =>
    p.audience === 'admin'
      ? { title: `Dispute opened: ${p.jobTitle}`, body: `By ${p.openedBy}${p.reason ? `: ${p.reason}` : ''}`, surface: 'hub', url: '/admin/disputes' }
      : { title: `Dispute opened: ${p.jobTitle}`, body: `By ${p.openedBy}`, surface: 'gigs', url: delivery(p) },
  dispute_resolved: (p) => ({ title: `Dispute resolved: ${p.jobTitle}`, body: p.outcome, surface: 'gigs', url: delivery(p) }),
  payout_sent: (p) => ({ title: `Payout sent: ${euros(p)}`, body: p.jobTitle ?? null, surface: 'gigs', url: p.contractId ? delivery({ contractId: p.contractId }) : '/activity' }),
  review_received: (p) => ({ title: `${p.reviewerName} rated you ${p.rating}/5`, body: p.comment ?? p.jobTitle ?? null, surface: 'gigs', url: '/activity' }),
  review_requested: (p) => ({ title: `How did it go? Review ${p.counterpartyName}`, body: p.jobTitle, surface: 'gigs', url: delivery(p) }),
  progress_update: (p) => ({ title: `Progress on ${p.jobTitle}`, body: p.summary, surface: 'gigs', url: room(p, 'status') }),
  milestone_completed: (p) => ({ title: `Milestone done: ${p.milestoneTitle}`, body: p.jobTitle, surface: 'gigs', url: room(p, 'milestones') }),
  package_installed: (p, count) => ({
    title: count > 1 ? `${count} new installs of ${p.packageName}` : `New install of ${p.packageName}`,
    body: 'Installs are anonymous counts.',
    surface: 'marketplace',
    url: '/publisher/activity',
  }),
  package_approved: (p) => ({ title: `${p.packageName} is live in the marketplace`, body: null, surface: 'marketplace', url: `/${enc(p.packageId)}` }),
  package_rejected: (p) => ({ title: `${p.packageName} wasn't approved`, body: p.reason ?? null, surface: 'marketplace', url: '/publish' }),
  submission_awaiting_qa: (p) => ({ title: `Submission awaiting QA: ${p.jobTitle}`, body: `From ${p.providerName}`, surface: 'hub', url: '/admin/qa' }),
};

/** Title, body, surface and link of an event. `count` is the aggregate size (installs). */
export function renderInApp<T extends NotificationType>(type: T, payload: Payload<T>, count = 1): InAppContent {
  const raw = (renderers[type] as (p: Payload<T>, n: number) => Raw)(payload, count);
  const body = raw.body ? clip(raw.body, BODY_MAX) : null;
  return { title: clip(raw.title, TITLE_MAX), body: body || null, surface: raw.surface, url: raw.url };
}

/** The aggregation group of an event (the package for installs), or null when it never aggregates. */
export function aggregateGroup(type: NotificationType, payload: Record<string, unknown>): string | null {
  if (type !== 'package_installed') return null;
  return typeof payload.packageId === 'string' ? payload.packageId : null;
}

export function bucketStart(now: Date, windowMs = AGGREGATE_WINDOW_MS): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/** The caller's dedupe key, except aggregates share one per user, group and window. */
export function inAppDedupeKey(userId: string, type: NotificationType, payload: Record<string, unknown>, dedupeKey: string, now: Date): string {
  const group = aggregateGroup(type, payload);
  if (group === null) return dedupeKey;
  return `inapp:${type}:${userId}:${group}:${bucketStart(now).toISOString()}`;
}

export interface NewInAppRow extends InAppContent {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  dedupeKey: string;
  count: number;
}

export interface ExistingInApp {
  id: string;
  count: number;
  readAt: string | null;
}

export type InAppWritePlan =
  | { kind: 'insert'; row: NewInAppRow }
  | { kind: 'bump'; id: string; expectedCount: number; patch: { count: number; title: string; body: string | null; readAt: null; updatedAt: string } }
  | { kind: 'skip' };

export interface InAppEvent<T extends NotificationType = NotificationType> {
  userId: string;
  type: T;
  payload: Payload<T>;
  /** Already the in-app key (see inAppDedupeKey). */
  dedupeKey: string;
}

/** What to do with an event given the row already stored under its key (if any). */
export function planInAppWrite<T extends NotificationType>(existing: ExistingInApp | null, event: InAppEvent<T>, now: Date): InAppWritePlan {
  const payload = event.payload as Record<string, unknown>;
  if (!existing) {
    const content = renderInApp(event.type, event.payload, 1);
    return { kind: 'insert', row: { ...content, userId: event.userId, type: event.type, payload, dedupeKey: event.dedupeKey, count: 1 } };
  }
  if (aggregateGroup(event.type, payload) === null) return { kind: 'skip' };
  const count = existing.count + 1;
  const content = renderInApp(event.type, event.payload, count);
  return {
    kind: 'bump',
    id: existing.id,
    expectedCount: existing.count,
    patch: { count, title: content.title, body: content.body, readAt: null, updatedAt: now.toISOString() },
  };
}
