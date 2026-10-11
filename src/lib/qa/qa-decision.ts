/**
 * What an admin QA verdict does. Pure: returns the state transitions and a plan of side
 * effects; src/lib/qa/qa-review-service.ts carries them out.
 *
 *  validated        → submission validated, contract delivered, job delivered; delivery
 *                     unlocked, auto-accept clock starts, customer gets delivery_ready.
 *  requires_changes → contract rework; the provider resubmits (attempt + 1). Rework never
 *                     uses one of the customer's steering credits.
 *  rejected         → contract disputed with a default full refund pending admin
 *                     confirmation; the provider gets a QA-failure trust mark.
 *  always           → both parties get qa_verdict, the review key is revoked and the credit
 *                     reserve is settled (metered usage charged, the rest released).
 */
import type { ContractStatus, JobStatus } from '../jobs/job-state.ts';

export const QA_VERDICTS = ['validated', 'requires_changes', 'rejected'] as const;
export type QaVerdict = (typeof QA_VERDICTS)[number];

export const SUBMISSION_STATUSES = ['awaiting_qa', 'in_review', 'validated', 'requires_changes', 'rejected'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** The notify module's qa_verdict vocabulary. */
export type NotifyVerdict = 'pass' | 'needs_changes' | 'fail';

export type QaEffect =
  | { type: 'unlock_delivery' }
  | { type: 'start_auto_accept'; autoAcceptAt: string }
  | { type: 'allow_resubmission'; nextAttempt: number }
  | { type: 'open_dispute'; defaultResolution: 'full_refund'; resolutionStatus: 'pending_admin_confirmation' }
  | { type: 'trust_mark'; mark: 'qa_failure' }
  | { type: 'notify'; to: 'customer' | 'provider'; notification: 'qa_verdict'; verdict: NotifyVerdict }
  | { type: 'notify'; to: 'customer'; notification: 'delivery_ready' }
  | { type: 'revoke_review_key' }
  | { type: 'settle_credits' };

export interface QaDecisionInput {
  verdict: QaVerdict;
  reason?: string | null;
  submissionStatus: SubmissionStatus;
  contractStatus: ContractStatus;
  attempt: number;
  now: Date;
  autoAcceptDays: number;
}

export interface QaDecision {
  verdict: QaVerdict;
  reason: string | null;
  submissionTo: SubmissionStatus;
  contractTo: ContractStatus;
  jobTo: JobStatus | null;
  usesSteeringCredit: false;
  effects: QaEffect[];
}

export type QaDecisionErrorCode = 'invalid_verdict' | 'reason_required' | 'invalid_state';

export class QaDecisionError extends Error {
  readonly code: QaDecisionErrorCode;

  constructor(code: QaDecisionErrorCode, message: string) {
    super(message);
    this.name = 'QaDecisionError';
    this.code = code;
  }
}

export const MAX_REASON_LENGTH = 4000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isQaVerdict(value: unknown): value is QaVerdict {
  return (QA_VERDICTS as readonly unknown[]).includes(value);
}

export function isOpenSubmissionStatus(status: string): boolean {
  return status === 'awaiting_qa' || status === 'in_review';
}

const CONTRACT_TO: Record<QaVerdict, ContractStatus> = {
  validated: 'delivered',
  requires_changes: 'rework',
  rejected: 'disputed',
};
const JOB_TO: Record<QaVerdict, JobStatus | null> = {
  validated: 'delivered',
  requires_changes: null,
  rejected: 'disputed',
};
const NOTIFY_VERDICT: Record<QaVerdict, NotifyVerdict> = {
  validated: 'pass',
  requires_changes: 'needs_changes',
  rejected: 'fail',
};

export function decideQaVerdict(input: QaDecisionInput): QaDecision {
  const { verdict } = input;
  if (!isQaVerdict(verdict)) {
    throw new QaDecisionError('invalid_verdict', 'verdict must be validated, requires_changes or rejected');
  }
  const trimmed = (input.reason ?? '').trim();
  const reason = trimmed ? trimmed.slice(0, MAX_REASON_LENGTH) : null;
  if (verdict !== 'validated' && !reason) {
    throw new QaDecisionError('reason_required', `A reason is required for ${verdict}`);
  }
  if (!isOpenSubmissionStatus(input.submissionStatus)) {
    throw new QaDecisionError('invalid_state', `This submission was already marked ${input.submissionStatus}`);
  }
  const contractTo = CONTRACT_TO[verdict];
  // every verdict's target is an allowed move from in_qa (job-state.ts; checked by the unit tests)
  if (input.contractStatus !== 'in_qa') {
    throw new QaDecisionError('invalid_state', `The contract is ${input.contractStatus}, not in QA`);
  }

  const effects: QaEffect[] = [];
  if (verdict === 'validated') {
    effects.push(
      { type: 'unlock_delivery' },
      { type: 'start_auto_accept', autoAcceptAt: new Date(input.now.getTime() + input.autoAcceptDays * DAY_MS).toISOString() },
    );
  } else if (verdict === 'requires_changes') {
    effects.push({ type: 'allow_resubmission', nextAttempt: input.attempt + 1 });
  } else {
    effects.push(
      { type: 'open_dispute', defaultResolution: 'full_refund', resolutionStatus: 'pending_admin_confirmation' },
      { type: 'trust_mark', mark: 'qa_failure' },
    );
  }
  effects.push(
    { type: 'notify', to: 'customer', notification: 'qa_verdict', verdict: NOTIFY_VERDICT[verdict] },
    { type: 'notify', to: 'provider', notification: 'qa_verdict', verdict: NOTIFY_VERDICT[verdict] },
  );
  if (verdict === 'validated') effects.push({ type: 'notify', to: 'customer', notification: 'delivery_ready' });
  effects.push({ type: 'revoke_review_key' }, { type: 'settle_credits' });

  return {
    verdict,
    reason,
    submissionTo: verdict,
    contractTo,
    jobTo: JOB_TO[verdict],
    usesSteeringCredit: false,
    effects,
  };
}
