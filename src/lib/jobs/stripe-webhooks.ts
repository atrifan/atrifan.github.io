/**
 * Gigs side of the Stripe webhook: contract checkouts, Connect account updates, refunds and
 * disputes. Idempotent through `stripe_events`: an event id that was processed, ignored or
 * failed permanently is acknowledged as a duplicate; one still `processing` (a crashed or
 * concurrent attempt) is processed again, and every handler is itself safe to repeat.
 */
import type Stripe from 'stripe';
import { jobsDb } from './db';
import { dbError } from './errors';
import { loadJob, transitionJob, isUuid } from './jobs-service';
import { setBidStatus } from './bids-service';
import { loadContract, loadContractVersion, transitionContract, moveContractIfAllowed } from './contracts-service';
import { syncAccount } from './stripe-connect';
import { canTransitionJob } from './job-state';
import { recordActivity } from './room-service';
import { formatEuros } from './client/format';
import type { ContractRow, PaymentRow, SteeringRequestRow } from './types';

type Outcome = 'processed' | 'ignored';

/** A problem retrying won't fix (bad metadata, amount mismatch). Recorded and acknowledged. */
export class PermanentWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentWebhookError';
  }
}

const CHECKOUT_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.expired',
]);
const OTHER_EVENTS = new Set(['account.updated', 'charge.refunded', 'charge.dispute.created']);

/** Does the gigs code own this event? Credit top-up checkouts (no kind=contract) are not ours. */
export function isJobsEvent(event: Pick<Stripe.Event, 'type' | 'data'>): boolean {
  if (CHECKOUT_EVENTS.has(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    return session.metadata?.kind === 'contract' || session.metadata?.kind === 'contract_topup';
  }
  return OTHER_EVENTS.has(event.type);
}

async function claimEvent(event: Stripe.Event): Promise<'new' | 'retry' | 'duplicate'> {
  const db = jobsDb();
  const objectId = (event.data.object as { id?: string }).id ?? null;
  const { data, error } = await db
    .from('stripe_events')
    .upsert(
      { id: event.id, type: event.type, livemode: event.livemode, object_id: objectId },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw dbError(error, 'claim stripe event');
  if ((data ?? []).length > 0) return 'new';

  const { data: existing, error: readError } = await db
    .from('stripe_events')
    .select('status, attempts')
    .eq('id', event.id)
    .single();
  if (readError) throw dbError(readError, 'read stripe event');
  if (existing.status !== 'processing') return 'duplicate';
  await db.from('stripe_events').update({ attempts: existing.attempts + 1 }).eq('id', event.id);
  return 'retry';
}

async function finishEvent(id: string, status: 'processed' | 'ignored' | 'failed', errorMessage?: string) {
  const { error } = await jobsDb()
    .from('stripe_events')
    .update({ status, error: errorMessage ?? null, processed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw dbError(error, 'finish stripe event');
}

export async function processJobsStripeEvent(event: Stripe.Event): Promise<{ duplicate: boolean; outcome?: string }> {
  const claim = await claimEvent(event);
  if (claim === 'duplicate') return { duplicate: true };
  try {
    const outcome = await dispatch(event);
    await finishEvent(event.id, outcome);
    return { duplicate: false, outcome };
  } catch (err) {
    if (err instanceof PermanentWebhookError) {
      console.error(`[jobs/webhook] ${event.type} ${event.id} failed permanently: ${err.message}`);
      await finishEvent(event.id, 'failed', err.message);
      return { duplicate: false, outcome: 'failed' };
    }
    throw err; // leave it 'processing' so Stripe's retry runs it again
  }
}

async function dispatch(event: Stripe.Event): Promise<Outcome> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      return session.metadata?.kind === 'contract_topup' ? onTopupPaid(session) : onContractCheckoutPaid(session);
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      // An expired top-up leaves the scope change approved but unpaid: the work stays paused
      // until the customer pays through a new Checkout (steering-service regenerateTopup).
      return session.metadata?.kind === 'contract_topup' ? onTopupExpired(session) : onContractCheckoutExpired(session);
    }
    case 'account.updated':
      return (await syncAccount(event.data.object as Stripe.Account)) ? 'processed' : 'ignored';
    case 'charge.refunded':
      return onChargeRefunded(event.data.object as Stripe.Charge);
    case 'charge.dispute.created':
      return onDisputeCreated(event.data.object as Stripe.Dispute);
    default:
      return 'ignored';
  }
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id;
}

async function contractFromSession(session: Stripe.Checkout.Session): Promise<ContractRow> {
  const contractId = session.metadata?.contract_id;
  if (!contractId || !isUuid(contractId)) throw new PermanentWebhookError('checkout session has no valid contract_id');
  const contract = await loadContract(contractId);
  if (!contract) throw new PermanentWebhookError(`unknown contract ${contractId}`);
  return contract;
}

async function onContractCheckoutPaid(session: Stripe.Checkout.Session): Promise<Outcome> {
  if (session.payment_status !== 'paid') return 'ignored'; // async methods confirm later
  const contract = await contractFromSession(session);
  const version = contract.current_version_id ? await loadContractVersion(contract.current_version_id) : null;
  if (!version) throw new PermanentWebhookError(`contract ${contract.id} has no version`);
  if (session.amount_total !== version.customer_total_cents || session.currency !== version.currency) {
    throw new PermanentWebhookError(
      `amount mismatch for contract ${contract.id}: paid ${session.amount_total} ${session.currency}, expected ${version.customer_total_cents} ${version.currency}`,
    );
  }

  const { error } = await jobsDb()
    .from('payments')
    .upsert(
      {
        contract_id: contract.id,
        contract_version_id: version.id,
        user_id: contract.customer_user_id,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: idOf(session.payment_intent as string | Stripe.PaymentIntent | null),
        amount_cents: session.amount_total,
        currency: session.currency,
        status: 'succeeded',
      },
      { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true },
    );
  if (error) throw dbError(error, 'record payment');

  if (contract.status === 'pending_payment') {
    await transitionContract(contract.id, 'pending_payment', 'active');
    await recordActivity(contract.id, null, 'payment_received', `Payment of ${formatEuros(session.amount_total)} received; work can start`, {
      checkout_session_id: session.id,
    });
  } else if (contract.status !== 'active') {
    console.error(`[jobs/webhook] payment for contract ${contract.id} in status ${contract.status}; needs admin review`);
  }
  const job = await loadJob(contract.job_id);
  if (job?.status === 'awarded') {
    await transitionJob(job.id, 'awarded', 'in_progress');
    await jobsDb()
      .from('bids')
      .update({ status: 'rejected' })
      .eq('job_id', job.id)
      .eq('status', 'active');
  }
  return 'processed';
}

/** The customer paid the top-up for an approved scope change: record it and resume the work. */
async function onTopupPaid(session: Stripe.Checkout.Session): Promise<Outcome> {
  if (session.payment_status !== 'paid') return 'ignored';
  const db = jobsDb();
  const { data: steering, error } = await db
    .from('steering_requests')
    .select('*')
    .eq('topup_checkout_session_id', session.id)
    .maybeSingle();
  if (error) throw dbError(error, 'find top-up');
  if (!steering) throw new PermanentWebhookError(`unknown top-up session ${session.id}`);
  const s = steering as SteeringRequestRow;
  const contract = await loadContract(s.contract_id);
  if (!contract) throw new PermanentWebhookError(`unknown contract ${s.contract_id}`);
  const version = s.new_contract_version_id ? await loadContractVersion(s.new_contract_version_id) : null;
  if (!version) throw new PermanentWebhookError(`top-up ${s.id} has no contract version`);
  if (session.amount_total !== s.topup_amount_cents || session.currency !== version.currency) {
    throw new PermanentWebhookError(
      `top-up amount mismatch for ${s.id}: paid ${session.amount_total} ${session.currency}, expected ${s.topup_amount_cents} ${version.currency}`,
    );
  }
  const { error: payError } = await db.from('payments').upsert(
    {
      contract_id: contract.id,
      contract_version_id: version.id,
      user_id: contract.customer_user_id,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: idOf(session.payment_intent as string | Stripe.PaymentIntent | null),
      amount_cents: session.amount_total,
      currency: session.currency,
      status: 'succeeded',
    },
    { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true },
  );
  if (payError) throw dbError(payError, 'record top-up payment');
  const { data: marked, error: updError } = await db
    .from('steering_requests')
    .update({ topup_status: 'paid' })
    .eq('id', s.id)
    .in('topup_status', ['pending', 'expired'])
    .select('id');
  if (updError) throw dbError(updError, 'mark top-up paid');
  if ((marked ?? []).length > 0) {
    await recordActivity(contract.id, null, 'topup_paid', `Top-up of ${formatEuros(session.amount_total)} paid; work resumes`, { steering_id: s.id });
  }
  return 'processed';
}

/** The customer let the top-up Checkout expire: the work stays paused until they get a new one. */
async function onTopupExpired(session: Stripe.Checkout.Session): Promise<Outcome> {
  const { data, error } = await jobsDb()
    .from('steering_requests')
    .update({ topup_status: 'expired' })
    .eq('topup_checkout_session_id', session.id)
    .eq('topup_status', 'pending')
    .select('id');
  if (error) throw dbError(error, 'mark top-up expired');
  return (data ?? []).length > 0 ? 'processed' : 'ignored';
}

async function onContractCheckoutExpired(session: Stripe.Checkout.Session): Promise<Outcome> {
  const contract = await contractFromSession(session);
  if (contract.stripe_checkout_session_id && contract.stripe_checkout_session_id !== session.id) return 'ignored';
  const cancelled = await transitionContract(contract.id, 'pending_payment', 'cancelled').catch(() => null);
  if (!cancelled) return 'ignored';
  await setBidStatus(contract.bid_id, 'accepted', 'active');
  await transitionJob(contract.job_id, 'awarded', 'open');
  return 'processed';
}

async function paymentByIntent(paymentIntentId: string | null): Promise<PaymentRow | null> {
  if (!paymentIntentId) return null;
  const { data, error } = await jobsDb()
    .from('payments')
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (error) throw dbError(error, 'find payment');
  return data as PaymentRow | null;
}

async function moveJobIfAllowed(jobId: string, to: 'cancelled' | 'disputed'): Promise<void> {
  const job = await loadJob(jobId);
  if (job && canTransitionJob(job.status, to)) await transitionJob(job.id, job.status, to);
}

async function onChargeRefunded(charge: Stripe.Charge): Promise<Outcome> {
  const payment = await paymentByIntent(idOf(charge.payment_intent as string | Stripe.PaymentIntent | null));
  if (!payment) return 'ignored'; // not a contract payment (e.g. a credits top-up)
  const refunded = Math.min(charge.amount_refunded, payment.amount_cents);
  const full = refunded >= payment.amount_cents;
  const db = jobsDb();
  const { error } = await db
    .from('payments')
    .update({ amount_refunded_cents: refunded, status: full ? 'refunded' : 'partially_refunded', stripe_charge_id: charge.id })
    .eq('id', payment.id);
  if (error) throw dbError(error, 'update refunded payment');

  const refunds = charge.refunds?.data ?? [];
  if (refunds.length > 0) {
    const { error: refundError } = await db.from('refunds').upsert(
      refunds.map((r) => ({
        payment_id: payment.id,
        contract_id: payment.contract_id,
        user_id: payment.user_id,
        stripe_refund_id: r.id,
        amount_cents: r.amount,
        currency: r.currency,
        reason: r.reason ?? null,
        status: r.status ?? 'pending',
      })),
      { onConflict: 'stripe_refund_id', ignoreDuplicates: true },
    );
    if (refundError) throw dbError(refundError, 'record refunds');
  }

  // A contract counts as refunded only when every payment on it is (a scope change can fully
  // refund a top-up while the original payment stands).
  if (full && (await contractFullyRefunded(payment.contract_id))) {
    const contract = await loadContract(payment.contract_id);
    if (contract && (await moveContractIfAllowed(contract, 'refunded'))) {
      await moveJobIfAllowed(contract.job_id, 'cancelled');
    }
  }
  return 'processed';
}

async function contractFullyRefunded(contractId: string): Promise<boolean> {
  const { data, error } = await jobsDb().from('payments').select('amount_cents, amount_refunded_cents, status').eq('contract_id', contractId);
  if (error) throw dbError(error, 'list contract payments');
  const paid = ((data ?? []) as Array<Pick<PaymentRow, 'amount_cents' | 'amount_refunded_cents' | 'status'>>).filter(
    (p) => p.status !== 'pending' && p.status !== 'failed',
  );
  return paid.length > 0 && paid.every((p) => p.amount_refunded_cents >= p.amount_cents);
}

async function onDisputeCreated(dispute: Stripe.Dispute): Promise<Outcome> {
  const payment = await paymentByIntent(idOf(dispute.payment_intent as string | Stripe.PaymentIntent | null));
  if (!payment) return 'ignored';
  const { error } = await jobsDb().from('payments').update({ status: 'disputed' }).eq('id', payment.id);
  if (error) throw dbError(error, 'mark payment disputed');
  const contract = await loadContract(payment.contract_id);
  if (contract && (await moveContractIfAllowed(contract, 'disputed'))) {
    await moveJobIfAllowed(contract.job_id, 'disputed');
  }
  return 'processed';
}
