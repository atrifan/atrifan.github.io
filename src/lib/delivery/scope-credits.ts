/**
 * Settle scope-change credits at payout. A scope change that lowered the price but couldn't
 * be refunded on approval left a `credit_pending` steering request (refund_credit_cents still
 * owed). Before the provider is paid:
 *  - the credit is refunded to the customer from the contract's payments, as far as they
 *    hold more than the payout needs;
 *  - what can't be refunded (no headroom, or Stripe refused again) is taken off the transfer;
 *  - each steering request records what was refunded and deducted, and becomes
 *    `credit_settled` once nothing is owed.
 * The math is pure, in src/lib/disputes/scope-credit.ts. A retried payout (after a failed
 * transfer) pays the bid less every deduction already recorded, so nothing is settled twice.
 */
import { createHash } from 'node:crypto';
import { jobsDb } from '../jobs/db';
import { dbError } from '../jobs/errors';
import { getStripe } from '../jobs/stripe';
import { planRefund, type RefundablePayment } from '../jobs/steering';
import { recordActivity } from '../jobs/room-service';
import { formatEuros } from '../jobs/client/format';
import type { ContractRow, PaymentRow, SteeringRequestRow } from '../jobs/types';
import { audit } from '../qa/qa-data';
import { allocateSettlement, planCreditSettlement } from '../disputes/scope-credit';
import { listPayments } from './contract-data';
import { payoutContract, type PayoutResult } from './payout';

export interface ScopeCreditOutcome {
  /** What the provider transfer should be after the settlement. */
  payoutCents: number;
  refundedCents: number;
  /** Taken off the transfer by this settlement. */
  deductedCents: number;
  /** Every deduction on this contract so far, this one included (stored on the transfer). */
  totalDeductedCents: number;
  unsettledCents: number;
}

type CreditRow = Pick<
  SteeringRequestRow,
  'id' | 'refund_status' | 'refund_credit_cents' | 'credit_refunded_cents' | 'credit_deducted_cents' | 'created_at'
>;

const COUNTED = new Set<PaymentRow['status']>(['succeeded', 'partially_refunded', 'refunded']);

export async function settleScopeCredits(contract: ContractRow, bidCents: number): Promise<ScopeCreditOutcome> {
  const db = jobsDb();
  const { data, error } = await db
    .from('steering_requests')
    .select('id, refund_status, refund_credit_cents, credit_refunded_cents, credit_deducted_cents, created_at')
    .eq('contract_id', contract.id)
    .in('refund_status', ['credit_pending', 'credit_settled'])
    .order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list scope credits');
  const rows = (data ?? []) as CreditRow[];
  const earlier = rows.reduce((sum, r) => sum + r.credit_deducted_cents, 0);
  const remainingPayout = Math.max(0, bidCents - earlier);
  const pending = rows.filter((r) => r.refund_status === 'credit_pending' && r.refund_credit_cents > 0);
  if (pending.length === 0) {
    return { payoutCents: remainingPayout, refundedCents: 0, deductedCents: 0, totalDeductedCents: earlier, unsettledCents: 0 };
  }

  const payments = await listPayments(contract.id);
  const counted = payments.filter((p) => COUNTED.has(p.status));
  const plan = planCreditSettlement({
    creditCents: pending.reduce((sum, r) => sum + r.refund_credit_cents, 0),
    paidCents: counted.reduce((sum, p) => sum + p.amount_cents, 0),
    refundedCents: counted.reduce((sum, p) => sum + p.amount_refunded_cents, 0),
    payoutCents: remainingPayout,
  });

  // One key per set of credits, so a crashed settlement replays the same Stripe refunds.
  const key = createHash('sha256').update(pending.map((r) => `${r.id}:${r.refund_credit_cents}`).join(',')).digest('hex').slice(0, 32);
  let refunded = 0;
  for (const part of planRefund(payments as RefundablePayment[], plan.refundCents).parts) {
    let refund: { id: string; status: string | null };
    try {
      refund = await getStripe().refunds.create(
        {
          payment_intent: part.paymentIntentId,
          amount: part.amountCents,
          reason: 'requested_by_customer',
          metadata: { kind: 'contract_scope_credit', contract_id: contract.id },
        },
        { idempotencyKey: `scope_credit_${key}_${part.paymentId}` },
      );
    } catch (err) {
      console.error('[payout] scope-credit refund failed; taking it off the transfer:', err instanceof Error ? err.message : err);
      continue;
    }
    refunded += part.amountCents;
    const payment = payments.find((p) => p.id === part.paymentId)!;
    const { data: inserted, error: refundError } = await db
      .from('refunds')
      .upsert(
        {
          payment_id: payment.id,
          contract_id: contract.id,
          user_id: contract.customer_user_id,
          stripe_refund_id: refund.id,
          amount_cents: part.amountCents,
          currency: payment.currency,
          reason: 'scope_change_credit_at_payout',
          status: refund.status ?? 'pending',
        },
        { onConflict: 'stripe_refund_id', ignoreDuplicates: true },
      )
      .select('id');
    if (refundError) throw dbError(refundError, 'record scope-credit refund');
    // A replayed refund (same Stripe id) was already counted on the payment.
    if ((inserted ?? []).length === 0) continue;
    const total = payment.amount_refunded_cents + part.amountCents;
    const { error: payError } = await db
      .from('payments')
      .update({ amount_refunded_cents: total, status: total >= payment.amount_cents ? 'refunded' : 'partially_refunded' })
      .eq('id', payment.id);
    if (payError) throw dbError(payError, 'record refunded amount');
  }

  // Whatever Stripe refused comes off the transfer instead.
  const fallback = planCreditSettlement({ creditCents: plan.refundCents - refunded, paidCents: 0, refundedCents: 0, payoutCents: plan.payoutCents });
  const deducted = plan.deductCents + fallback.deductCents;
  const unsettled = plan.unsettledCents + fallback.unsettledCents;

  const now = new Date().toISOString();
  const allocations = allocateSettlement(
    pending.map((r) => ({ id: r.id, creditCents: r.refund_credit_cents })),
    { refundCents: refunded, deductCents: deducted },
  );
  for (const a of allocations) {
    const row = pending.find((r) => r.id === a.id)!;
    const { error: upError } = await db
      .from('steering_requests')
      .update({
        refund_credit_cents: a.remainingCents,
        credit_refunded_cents: row.credit_refunded_cents + a.refundCents,
        credit_deducted_cents: row.credit_deducted_cents + a.deductCents,
        refund_status: a.remainingCents === 0 ? 'credit_settled' : 'credit_pending',
        credit_settled_at: a.remainingCents === 0 ? now : null,
      })
      .eq('id', a.id)
      .eq('refund_status', 'credit_pending');
    if (upError) throw dbError(upError, 'settle scope credit');
  }

  const parts = [
    refunded > 0 ? `${formatEuros(refunded)} refunded to the customer` : null,
    deducted > 0 ? `${formatEuros(deducted)} taken off the payout` : null,
  ].filter(Boolean);
  if (parts.length > 0) {
    await recordActivity(contract.id, null, 'credit_settled', `Scope-change credit settled at payout: ${parts.join(', ')}`, {
      refunded_cents: refunded,
      deducted_cents: deducted,
      unsettled_cents: unsettled,
      steering_ids: pending.map((r) => r.id),
    });
  }
  await audit(null, 'scope_credit_settled', 'contract', contract.id, { refunded_cents: refunded, deducted_cents: deducted, unsettled_cents: unsettled });
  if (unsettled > 0) console.error(`[payout] contract ${contract.id}: ${unsettled} cents of scope credit still owed; needs an admin`);

  return {
    payoutCents: fallback.payoutCents,
    refundedCents: refunded,
    deductedCents: deducted,
    totalDeductedCents: earlier + deducted,
    unsettledCents: unsettled,
  };
}

/** Settle any scope-change credit, then pay the provider what is left of the bid. */
export async function payoutWithCredits(contract: ContractRow, bidCents: number): Promise<PayoutResult> {
  const settled = await settleScopeCredits(contract, bidCents);
  return payoutContract(contract, settled.payoutCents, { creditDeductedCents: settled.totalDeductedCents });
}
