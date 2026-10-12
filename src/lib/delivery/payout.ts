/**
 * Provider payouts (separate charges and transfers): the bid goes to the provider's Express
 * account with
 *   stripe.transfers.create({ amount, currency, destination, transfer_group, source_transaction })
 * where source_transaction is the contract's charge, so the transfer only uses those funds.
 *
 * Idempotent twice over: at most one live transfers row per contract (a unique index), and
 * the Stripe call's idempotency key is that row's id, so a retry after a crash replays the
 * same transfer instead of paying twice. A failed transfer is marked failed and retried by
 * the auto-accept cron.
 *
 * While it has the charge in hand, it records Stripe fingerprints of the payer and the payout
 * account for the trust score's self-dealing check.
 */
import type Stripe from 'stripe';
import { jobsDb } from '../jobs/db';
import { dbError, isUniqueViolation } from '../jobs/errors';
import { getStripe } from '../jobs/stripe';
import type { ContractRow, PaymentRow } from '../jobs/types';
import { listPayments, listTransfers, type TransferRow } from './contract-data';

export type PayoutResult =
  | { status: 'paid'; transfer: TransferRow; created: boolean }
  | { status: 'failed'; transfer: TransferRow; error: string }
  | { status: 'blocked'; reason: 'payouts_disabled' | 'no_payment' | 'nothing_to_pay' };

const fp = (kind: string, value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? `${kind}:${value.trim().toLowerCase()}` : null;

function idOf(ref: unknown): string | null {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  return (ref as { id?: string }).id ?? null;
}

/** The payment's charge id (stored, or read from its PaymentIntent) and payer fingerprints. */
async function chargeFor(stripe: Stripe, payment: PaymentRow & { payer_fingerprints?: string[] }): Promise<{ chargeId: string | null; amount: number | null }> {
  if (payment.stripe_charge_id && (payment.payer_fingerprints ?? []).length > 0) return { chargeId: payment.stripe_charge_id, amount: payment.amount_cents };
  if (!payment.stripe_payment_intent_id) return { chargeId: payment.stripe_charge_id, amount: payment.amount_cents };
  try {
    const pi = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id, { expand: ['latest_charge'] });
    const charge = (typeof pi.latest_charge === 'object' ? pi.latest_charge : null) as Stripe.Charge | null;
    const chargeId = idOf(pi.latest_charge) ?? payment.stripe_charge_id;
    const prints = [
      fp('card', charge?.payment_method_details?.card?.fingerprint),
      fp('customer', idOf(charge?.customer ?? pi.customer)),
      fp('email', charge?.billing_details?.email),
    ].filter((x): x is string => !!x);
    await jobsDb().from('payments').update({ stripe_charge_id: chargeId, payer_fingerprints: prints }).eq('id', payment.id);
    return { chargeId, amount: charge?.amount ?? payment.amount_cents };
  } catch (err) {
    console.error('[payout] could not read the payment intent:', err instanceof Error ? err.message : 'error');
    return { chargeId: payment.stripe_charge_id, amount: payment.amount_cents };
  }
}

/** Best effort: the payout account's email and external account fingerprints. */
async function recordPayoutFingerprints(stripe: Stripe, userId: string, accountId: string): Promise<void> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    const external = (account.external_accounts?.data ?? []) as Array<{ fingerprint?: string | null }>;
    const prints = [fp('email', account.email), ...external.map((e) => fp('bank', e.fingerprint))].filter((x): x is string => !!x);
    if (prints.length > 0) await jobsDb().from('provider_profiles').update({ payout_fingerprints: prints }).eq('user_id', userId);
  } catch (err) {
    console.error('[payout] could not read the payout account:', err instanceof Error ? err.message : 'error');
  }
}

/**
 * Pay `amountCents` (default: the contract's bid) to the provider. Safe to call again: an
 * existing live transfer is returned, a pending one is retried with the same idempotency key.
 * `creditDeductedCents` records how much scope-change credit was taken off the bid
 * (./scope-credits.ts).
 */
export async function payoutContract(contract: ContractRow, amountCents: number, opts: { creditDeductedCents?: number } = {}): Promise<PayoutResult> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { status: 'blocked', reason: 'nothing_to_pay' };
  const db = jobsDb();
  const existing = (await listTransfers(contract.id)).find((t) => t.status !== 'failed');
  if (existing && existing.status !== 'pending') return { status: 'paid', transfer: existing, created: false };

  const { data: profile, error: profileError } = await db
    .from('provider_profiles')
    .select('stripe_account_id, payouts_enabled')
    .eq('user_id', contract.provider_user_id)
    .maybeSingle();
  if (profileError) throw dbError(profileError, 'payout profile');
  const account = profile as { stripe_account_id: string | null; payouts_enabled: boolean } | null;
  if (!account?.stripe_account_id || !account.payouts_enabled) return { status: 'blocked', reason: 'payouts_disabled' };

  const payments = (await listPayments(contract.id)).filter((p) => p.status === 'succeeded' || p.status === 'partially_refunded');
  const payment = payments[0];
  if (!payment) return { status: 'blocked', reason: 'no_payment' };

  let row = existing ?? null;
  if (!row) {
    const { data, error } = await db
      .from('transfers')
      .insert({
        contract_id: contract.id,
        payment_id: payment.id,
        user_id: contract.provider_user_id,
        destination_account_id: account.stripe_account_id,
        transfer_group: contract.transfer_group,
        amount_cents: amountCents,
        credit_deducted_cents: opts.creditDeductedCents ?? 0,
        currency: contract.currency,
        status: 'pending',
      })
      .select('*')
      .single();
    if (error) {
      if (!isUniqueViolation(error)) throw dbError(error, 'create transfer');
      const live = (await listTransfers(contract.id)).find((t) => t.status !== 'failed');
      if (!live) throw dbError(error, 'create transfer');
      if (live.status !== 'pending') return { status: 'paid', transfer: live, created: false };
      row = live;
    } else {
      row = data as TransferRow;
    }
  }

  const stripe = getStripe();
  const { chargeId, amount: chargeAmount } = await chargeFor(stripe, payment);
  let transfer: Stripe.Transfer;
  try {
    transfer = await stripe.transfers.create(
      {
        amount: row.amount_cents,
        currency: row.currency,
        destination: row.destination_account_id,
        transfer_group: row.transfer_group ?? undefined,
        // The charge must cover the transfer; after a top-up the bid can exceed the first charge.
        source_transaction: chargeId && (chargeAmount ?? 0) >= row.amount_cents ? chargeId : undefined,
        metadata: { contract_id: contract.id, kind: 'contract_payout' },
      },
      { idempotencyKey: `payout_${row.id}` },
    );
  } catch (err) {
    const type = (err as { type?: string } | null)?.type;
    console.error(`[payout] transfer for contract ${contract.id} failed:`, type ?? 'error', err instanceof Error ? err.message : '');
    // Only a definite refusal marks the row failed (a retry then gets a new row and key). A
    // connection error may have reached Stripe: the row stays pending and the retry replays
    // the same idempotency key.
    if (type === 'StripeConnectionError' || type === 'StripeAPIError' || type === 'StripeRateLimitError') {
      return { status: 'failed', transfer: row, error: 'Stripe could not be reached; the payout will be retried' };
    }
    const { data: failed } = await db.from('transfers').update({ status: 'failed' }).eq('id', row.id).select('*').single();
    return { status: 'failed', transfer: (failed ?? row) as TransferRow, error: 'Stripe refused the transfer' };
  }
  const { data: paid, error } = await db
    .from('transfers')
    .update({ stripe_transfer_id: transfer.id, status: 'paid' })
    .eq('id', row.id)
    .select('*')
    .single();
  if (error) throw dbError(error, 'record transfer');
  await recordPayoutFingerprints(stripe, contract.provider_user_id, row.destination_account_id);
  return { status: 'paid', transfer: paid as TransferRow, created: true };
}
