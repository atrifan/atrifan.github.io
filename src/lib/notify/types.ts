import { z } from 'zod';

/**
 * Email notification event types and their payload schemas.
 *
 * Every payload may carry an absolute `url` for the call-to-action. When it is
 * absent the template builds a default link from the ids in the payload.
 */

export const NOTIFICATION_TYPES = [
  'job_posted',
  'bid_received',
  'bid_accepted',
  'contract_created',
  'payment_confirmed',
  'steering_awaiting_approval',
  'scope_change_awaiting_approval',
  'submission_received',
  'qa_verdict',
  'delivery_ready',
  'auto_accept_reminder',
  'dispute_opened',
  'dispute_resolved',
  'payout_sent',
  'review_received',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

const id = z.string().min(1).max(200);
const title = z.string().min(1).max(300);
const personName = z.string().min(1).max(200);
const summary = z.string().max(2000);
const amountCents = z.number().int().nonnegative();
const currency = z.string().length(3).default('usd');
const url = z.string().url().optional();

const job = { jobId: id, jobTitle: title, url };
const contract = { ...job, contractId: id };

export const payloadSchemas = {
  job_posted: z.object({ ...job }),
  bid_received: z.object({ ...job, bidderName: personName, amountCents, currency }),
  bid_accepted: z.object({ ...job, contractId: id.optional(), amountCents, currency }),
  contract_created: z.object({ ...contract, counterpartyName: personName, amountCents, currency }),
  payment_confirmed: z.object({ ...contract, amountCents, currency }),
  steering_awaiting_approval: z.object({ ...contract, requestedBy: personName, summary }),
  scope_change_awaiting_approval: z.object({
    ...contract,
    requestedBy: personName,
    summary,
    priceDeltaCents: z.number().int().optional(),
    currency,
  }),
  submission_received: z.object({ ...contract, providerName: personName }),
  qa_verdict: z.object({
    ...contract,
    verdict: z.enum(['pass', 'fail', 'needs_changes']),
    summary: summary.optional(),
  }),
  delivery_ready: z.object({ ...contract }),
  auto_accept_reminder: z.object({ ...contract, autoAcceptAt: z.string().datetime({ offset: true }) }),
  dispute_opened: z.object({ ...contract, openedBy: personName, reason: summary.optional() }),
  dispute_resolved: z.object({ ...contract, outcome: summary }),
  payout_sent: z.object({
    amountCents,
    currency,
    contractId: id.optional(),
    jobTitle: title.optional(),
    url,
  }),
  review_received: z.object({
    reviewerName: personName,
    rating: z.number().int().min(1).max(5),
    comment: summary.optional(),
    jobTitle: title.optional(),
    url,
  }),
} satisfies Record<NotificationType, z.ZodTypeAny>;

/** Payload a caller passes to `enqueue` (defaults such as `currency` optional). */
export type PayloadInput<T extends NotificationType> = z.input<(typeof payloadSchemas)[T]>;
/** Payload after validation (defaults applied). */
export type Payload<T extends NotificationType> = z.output<(typeof payloadSchemas)[T]>;

export function parsePayload<T extends NotificationType>(type: T, payload: unknown): Payload<T> {
  return payloadSchemas[type].parse(payload) as Payload<T>;
}

export type NotificationStatus = 'queued' | 'sent' | 'failed' | 'skipped';

export interface Contact {
  userId: string;
  email: string | null;
  name: string | null;
  locale: string | null;
  emailVerified: boolean;
}

export interface PreferenceRow {
  type: NotificationType;
  emailEnabled: boolean;
}

export interface NotificationRow {
  id: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  dedupeKey: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  providerMessageId: string | null;
}

/** Human labels used in emails and the preferences UI. */
export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  job_posted: 'Job posted',
  bid_received: 'New bids',
  bid_accepted: 'Bid accepted',
  contract_created: 'Contract created',
  payment_confirmed: 'Payment confirmed',
  steering_awaiting_approval: 'Steering requests',
  scope_change_awaiting_approval: 'Scope changes',
  submission_received: 'Submissions',
  qa_verdict: 'QA verdicts',
  delivery_ready: 'Delivery ready',
  auto_accept_reminder: 'Auto-accept reminders',
  dispute_opened: 'Disputes opened',
  dispute_resolved: 'Disputes resolved',
  payout_sent: 'Payouts',
  review_received: 'New reviews',
};
