/**
 * Dispute money math. Pure, integer cents.
 *
 * A resolution sets how much of the bid the provider ends up with (the "provider target")
 * and how much of what the customer paid is refunded. The plan then says what has to move:
 *  - before the payout, the provider target is paid as a new transfer;
 *  - after the payout, anything above the target is pulled back with a transfer reversal.
 *
 * Outcomes:
 *  - release:        no refund; the provider keeps the whole bid.
 *  - full_refund:    everything still refundable goes back; the provider keeps nothing.
 *  - partial_refund: the customer gets `refundCents` back (0 < refund < refundable). The
 *                    refund is shared pro rata between the bid and the platform fee:
 *                    provider share = round_half_up(refund × bid / paid), at most the bid.
 *
 * The platform keeps what is left: paid − refunded − provider target.
 */

export const DISPUTE_OUTCOMES = ['release', 'partial_refund', 'full_refund'] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

export interface MoneyState {
  /** Everything the customer paid for the contract (bid + fee, plus top-ups). */
  customerPaidCents: number;
  alreadyRefundedCents: number;
  /** The provider's price: what a full payout transfers. */
  bidCents: number;
  /** Sum of payout transfers made. */
  transferredCents: number;
  alreadyReversedCents: number;
}

export interface ResolutionPlan {
  outcome: DisputeOutcome;
  /** New refund to the customer. */
  refundCents: number;
  /** New transfer to the provider. */
  transferCents: number;
  /** New reversal of earlier transfers. */
  reversalCents: number;
  /** What the provider keeps in the end. */
  providerNetCents: number;
  /** What the platform keeps in the end. */
  platformNetCents: number;
}

export type DisputeAmountErrorCode = 'invalid_amount' | 'invalid_state' | 'invalid_outcome' | 'nothing_to_refund';

export class DisputeAmountError extends Error {
  readonly code: DisputeAmountErrorCode;

  constructor(code: DisputeAmountErrorCode, message: string) {
    super(message);
    this.name = 'DisputeAmountError';
    this.code = code;
  }
}

const isCents = (v: number) => Number.isInteger(v) && v >= 0;

export function isDisputeOutcome(value: unknown): value is DisputeOutcome {
  return (DISPUTE_OUTCOMES as readonly unknown[]).includes(value);
}

/** The bid's share of a refund, rounded half up, never more than the bid. */
export function providerShareOfRefund(refundCents: number, bidCents: number, paidCents: number): number {
  if (paidCents <= 0) return 0;
  return Math.min(bidCents, Math.floor((refundCents * bidCents * 2 + paidCents) / (paidCents * 2)));
}

function checkState(s: MoneyState): void {
  const values = [s.customerPaidCents, s.alreadyRefundedCents, s.bidCents, s.transferredCents, s.alreadyReversedCents];
  if (!values.every(isCents)) throw new DisputeAmountError('invalid_state', 'Amounts must be whole, non-negative cents');
  if (s.customerPaidCents === 0 || s.bidCents === 0) throw new DisputeAmountError('invalid_state', 'Nothing was paid');
  if (s.bidCents > s.customerPaidCents) throw new DisputeAmountError('invalid_state', 'The bid is more than was paid');
  if (s.alreadyRefundedCents > s.customerPaidCents) throw new DisputeAmountError('invalid_state', 'Refunded more than was paid');
  if (s.alreadyReversedCents > s.transferredCents) throw new DisputeAmountError('invalid_state', 'Reversed more than was transferred');
}

export function planResolution(state: MoneyState, outcome: DisputeOutcome, partialRefundCents?: number): ResolutionPlan {
  if (!isDisputeOutcome(outcome)) throw new DisputeAmountError('invalid_outcome', 'Outcome must be release, partial_refund or full_refund');
  checkState(state);
  const refundable = state.customerPaidCents - state.alreadyRefundedCents;
  const netTransferred = state.transferredCents - state.alreadyReversedCents;

  let refundCents = 0;
  let providerTarget = state.bidCents;
  if (outcome === 'full_refund') {
    if (refundable === 0) throw new DisputeAmountError('nothing_to_refund', 'The payment was already refunded in full');
    refundCents = refundable;
    providerTarget = 0;
  } else if (outcome === 'partial_refund') {
    const x = partialRefundCents ?? Number.NaN;
    if (!Number.isInteger(x) || x <= 0 || x >= refundable) {
      throw new DisputeAmountError('invalid_amount', `A partial refund is a whole number of cents from 1 to ${refundable - 1}`);
    }
    refundCents = x;
    providerTarget = state.bidCents - providerShareOfRefund(x, state.bidCents, state.customerPaidCents);
  }

  return {
    outcome,
    refundCents,
    transferCents: Math.max(0, providerTarget - netTransferred),
    reversalCents: Math.max(0, netTransferred - providerTarget),
    providerNetCents: providerTarget,
    platformNetCents: refundable - refundCents - providerTarget,
  };
}
