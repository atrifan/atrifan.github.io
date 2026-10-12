/**
 * Scope-change credits settled at payout. Pure, integer cents.
 *
 * A scope change that lowers the price refunds the drop in the customer's total on approval.
 * When that refund can't be made (no payment yet, or Stripe refused), the amount is recorded
 * on the steering request as a credit (`refund_status = 'credit_pending'`). At payout the
 * credit is settled:
 *  1. refunded to the customer from the contract's payments, as far as they hold more than
 *     the payout needs (headroom = paid − refunded − payout, never below 0);
 *  2. whatever is left is taken off the provider's transfer (never below 0);
 *  3. anything still left stays owed (`unsettledCents`) for an admin.
 *
 * `allocateSettlement` spreads one settlement over the credits it covers, oldest first.
 */

export interface CreditSettlementInput {
  /** Still owed to the customer: the sum of the credit_pending scope-change credits. */
  creditCents: number;
  /** Everything the customer paid for the contract that succeeded. */
  paidCents: number;
  /** What was already refunded from those payments. */
  refundedCents: number;
  /** The provider transfer before the settlement. */
  payoutCents: number;
}

export interface CreditSettlement {
  /** Refund to the customer now. */
  refundCents: number;
  /** Taken off the provider transfer. */
  deductCents: number;
  /** The provider transfer after the settlement. */
  payoutCents: number;
  /** Still owed to the customer after the refund and the deduction. */
  unsettledCents: number;
}

export class ScopeCreditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeCreditError';
  }
}

const isCents = (v: number) => Number.isInteger(v) && v >= 0;

export function planCreditSettlement(input: CreditSettlementInput): CreditSettlement {
  const { creditCents, paidCents, refundedCents, payoutCents } = input;
  if (![creditCents, paidCents, refundedCents, payoutCents].every(isCents)) {
    throw new ScopeCreditError('Amounts must be whole, non-negative cents');
  }
  const headroom = Math.max(0, paidCents - refundedCents - payoutCents);
  const refund = Math.min(creditCents, headroom);
  const deduct = Math.min(creditCents - refund, payoutCents);
  return {
    refundCents: refund,
    deductCents: deduct,
    payoutCents: payoutCents - deduct,
    unsettledCents: creditCents - refund - deduct,
  };
}

export interface OwedCredit {
  id: string;
  creditCents: number;
}

export interface CreditAllocation {
  id: string;
  refundCents: number;
  deductCents: number;
  /** What this credit still owes after the settlement (0 = settled). */
  remainingCents: number;
}

export function allocateSettlement(credits: readonly OwedCredit[], settled: { refundCents: number; deductCents: number }): CreditAllocation[] {
  if (!isCents(settled.refundCents) || !isCents(settled.deductCents) || !credits.every((c) => isCents(c.creditCents))) {
    throw new ScopeCreditError('Amounts must be whole, non-negative cents');
  }
  const owed = credits.reduce((sum, c) => sum + c.creditCents, 0);
  if (settled.refundCents + settled.deductCents > owed) throw new ScopeCreditError('Settled more than is owed');
  let refundLeft = settled.refundCents;
  let deductLeft = settled.deductCents;
  return credits.map((c) => {
    const refund = Math.min(c.creditCents, refundLeft);
    refundLeft -= refund;
    const deduct = Math.min(c.creditCents - refund, deductLeft);
    deductLeft -= deduct;
    return { id: c.id, refundCents: refund, deductCents: deduct, remainingCents: c.creditCents - refund - deduct };
  });
}
