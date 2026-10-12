/**
 * When a customer may open a dispute. Pure.
 *
 *  - Before acceptance (the work is paid and not yet accepted): a structured dispute stops the
 *    auto-accept clock and the payout.
 *  - After acceptance: a claim, within JOBS_POST_ACCEPT_CLAIM_DAYS (default 14) of acceptance.
 *    The payout may already have been made; an admin can still reverse it.
 *  - Never while another dispute on the contract is open, and never on unpaid, cancelled or
 *    refunded contracts.
 */
import type { ContractStatus } from '../jobs/job-state.ts';

export type DisputePhase = 'pre_accept' | 'post_accept';
export type DisputeIneligible = 'already_open' | 'not_disputable' | 'claim_window_closed';

export type DisputeEligibility = { ok: true; phase: DisputePhase } | { ok: false; reason: DisputeIneligible };

const DAY_MS = 24 * 60 * 60 * 1000;
const PRE_ACCEPT: readonly ContractStatus[] = ['active', 'submitted', 'in_qa', 'rework', 'delivered'];

export function claimWindowEndsAt(acceptedAt: string, claimDays: number): Date {
  return new Date(new Date(acceptedAt).getTime() + claimDays * DAY_MS);
}

export function disputeEligibility(input: {
  contractStatus: ContractStatus;
  hasOpenDispute: boolean;
  acceptedAt: string | null;
  now: Date;
  claimDays: number;
}): DisputeEligibility {
  if (input.hasOpenDispute || input.contractStatus === 'disputed') return { ok: false, reason: 'already_open' };
  if (PRE_ACCEPT.includes(input.contractStatus)) return { ok: true, phase: 'pre_accept' };
  if (input.contractStatus !== 'completed') return { ok: false, reason: 'not_disputable' };
  if (!input.acceptedAt || input.now.getTime() >= claimWindowEndsAt(input.acceptedAt, input.claimDays).getTime()) {
    return { ok: false, reason: 'claim_window_closed' };
  }
  return { ok: true, phase: 'post_accept' };
}
