/**
 * Disputes: opened by the customer (before acceptance, or as a claim within
 * JOBS_POST_ACCEPT_CLAIM_DAYS after it), by a rejected QA verdict, or by a Stripe chargeback;
 * resolved by an admin (hub /admin/disputes) as release, partial refund or full refund.
 *
 * Before the payout a refund is just a refund; after it, the provider's share is pulled back
 * with a transfer reversal and the customer is refunded (money math: ./amounts.ts).
 *
 * Resolving is retry-safe: the admin's plan is stored on the dispute first (status
 * `resolving`), then every Stripe call carries an idempotency key derived from the dispute and
 * the amount still to move, and what already moved (refunds / reversals tagged with the
 * dispute) is subtracted. A crash half-way can simply be resolved again.
 */
import type Stripe from 'stripe';
import { z } from 'zod';
import { jobsDb } from '../jobs/db';
import { JobsError, dbError, isUniqueViolation, notFound } from '../jobs/errors';
import { loadContract, moveContractIfAllowed } from '../jobs/contracts-service';
import { loadJob, transitionJob } from '../jobs/jobs-service';
import { canTransitionJob, type JobStatus } from '../jobs/job-state';
import { getStripe, stripeFailure } from '../jobs/stripe';
import { notifyUser } from '../jobs/notifications';
import { adminUserIdsForNotify, audit, describeParties } from '../qa/qa-data';
import { recomputeTrustSafe } from '../trust/trust-service';
import { claimDaysFrom } from '../delivery/auto-accept';
import {
  currentVersion,
  displayName,
  jobTitleOf,
  listDisputes,
  listPayments,
  listTransfers,
  loadPartyContract,
  moneyState,
  openDisputes,
  paymentSucceeded,
  purgeContractPats,
  type DisputeRow,
  type Phase5ContractRow,
} from '../delivery/contract-data';
import { afterAcceptance, notifyPayout, promptReviews } from '../delivery/acceptance-service';
import { payoutContract, type PayoutResult } from '../delivery/payout';
import { DisputeAmountError, planResolution, type DisputeOutcome, type ResolutionPlan } from './amounts';
import { disputeEligibility } from './policy';

export const DISPUTE_CATEGORIES = ['not_as_described', 'incomplete', 'quality', 'late', 'not_delivered', 'other'] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

export const openDisputeSchema = z.object({
  category: z.enum(DISPUTE_CATEGORIES),
  reason: z.string().trim().min(10, 'Tell us what went wrong in at least 10 characters').max(4000),
  evidence: z.string().trim().max(20000).optional().nullable(),
});

export const resolveSchema = z.object({
  outcome: z.enum(['release', 'partial_refund', 'full_refund']),
  refund_cents: z.number().int().positive().optional(),
  note: z.string().trim().min(3, 'Add a short note for both parties').max(4000),
});

async function moveJob(jobId: string, to: JobStatus): Promise<void> {
  const job = await loadJob(jobId);
  if (job && job.status !== to && canTransitionJob(job.status, to)) await transitionJob(job.id, job.status, to);
}

async function notifyAdmins(contract: Phase5ContractRow, openedBy: string, reason: string, key: string): Promise<void> {
  const jobTitle = await jobTitleOf(contract.job_id);
  for (const admin of await adminUserIdsForNotify()) {
    await notifyUser(admin, 'dispute_opened', { jobId: contract.job_id, jobTitle, contractId: contract.id, openedBy, reason: reason.slice(0, 2000), audience: 'admin' }, `${key}:admin:${admin}`);
  }
}

// ── opening ──────────────────────────────────────────────────────────────────

export async function openDispute(userId: string, contractId: string, args: unknown): Promise<DisputeRow> {
  const parsed = openDisputeSchema.safeParse(args ?? {});
  if (!parsed.success) throw new JobsError('invalid_request', 400, 'Invalid dispute', parsed.error.issues);
  const input = parsed.data;
  const { contract, role } = await loadPartyContract(userId, contractId);
  if (role !== 'customer') throw new JobsError('forbidden', 403, 'Only the customer can open a dispute');
  const [disputes, payments] = await Promise.all([listDisputes(contract.id), listPayments(contract.id)]);
  if (!paymentSucceeded(payments)) throw new JobsError('not_disputable', 409, 'Only a paid contract can be disputed');
  const eligibility = disputeEligibility({
    contractStatus: contract.status,
    hasOpenDispute: openDisputes(disputes).some((d) => d.source !== 'chargeback'),
    acceptedAt: contract.accepted_at,
    now: new Date(),
    claimDays: claimDaysFrom(),
  });
  if (!eligibility.ok) {
    if (eligibility.reason === 'already_open') throw new JobsError('dispute_open', 409, 'A dispute is already open on this contract');
    if (eligibility.reason === 'claim_window_closed') throw new JobsError('claim_window_closed', 409, 'The claim window after acceptance has closed');
    throw new JobsError('not_disputable', 409, `A ${contract.status} contract can't be disputed`);
  }

  const { data, error } = await jobsDb()
    .from('disputes')
    .insert({
      contract_id: contract.id,
      user_id: contract.customer_user_id,
      provider_user_id: contract.provider_user_id,
      opened_by_user_id: userId,
      source: 'customer',
      phase: eligibility.phase,
      category: input.category,
      reason: input.reason,
      evidence: input.evidence || null,
    })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) throw new JobsError('dispute_open', 409, 'A dispute is already open on this contract');
    throw dbError(error, 'open dispute');
  }
  const dispute = data as DisputeRow;
  // Before acceptance the dispute stops the auto-accept clock and the payout.
  if (eligibility.phase === 'pre_accept' && (await moveContractIfAllowed(contract, 'disputed'))) await moveJob(contract.job_id, 'disputed');

  await audit(userId, 'dispute_opened', 'contract', contract.id, { dispute_id: dispute.id, phase: dispute.phase, category: dispute.category });
  const customerName = await displayName(userId, 'The customer');
  const jobTitle = await jobTitleOf(contract.job_id);
  await notifyUser(
    contract.provider_user_id,
    'dispute_opened',
    { jobId: contract.job_id, jobTitle, contractId: contract.id, openedBy: customerName, reason: input.reason.slice(0, 2000) },
    `dispute_opened:${dispute.id}:provider`,
  );
  await notifyAdmins(contract, customerName, input.reason, `dispute_opened:${dispute.id}`);
  await recomputeTrustSafe(contract.provider_principal_id);
  return dispute;
}

/** QA rejected the work: a dispute with a full refund as the default, for an admin to confirm. */
export async function openQaRejectionDispute(adminUserId: string, contractId: string, reason: string | null): Promise<void> {
  const contract = (await loadContract(contractId)) as Phase5ContractRow | null;
  if (!contract) return;
  const { error } = await jobsDb().from('disputes').insert({
    contract_id: contract.id,
    user_id: contract.customer_user_id,
    provider_user_id: contract.provider_user_id,
    opened_by_user_id: adminUserId,
    source: 'qa_rejected',
    phase: 'pre_accept',
    category: 'qa_rejected',
    reason: (reason ?? 'QA rejected the work').slice(0, 4000) || 'QA rejected the work',
    default_resolution: 'full_refund',
  });
  if (error && !isUniqueViolation(error)) throw dbError(error, 'open QA dispute');
}

/** charge.dispute.created / updated / closed: link the chargeback to its contract. */
export async function linkChargeback(dispute: Stripe.Dispute, contractId: string): Promise<void> {
  const contract = (await loadContract(contractId)) as Phase5ContractRow | null;
  if (!contract) return;
  const closed = dispute.status === 'won' || dispute.status === 'lost' || dispute.status === 'warning_closed';
  const row = {
    contract_id: contract.id,
    user_id: contract.customer_user_id,
    provider_user_id: contract.provider_user_id,
    source: 'chargeback',
    phase: contract.accepted_at ? 'post_accept' : 'pre_accept',
    category: 'chargeback',
    reason: `Chargeback (${dispute.reason ?? 'unknown reason'})`,
    stripe_dispute_id: dispute.id,
    stripe_dispute_status: dispute.status,
    stripe_dispute_reason: dispute.reason ?? null,
    stripe_amount_cents: dispute.amount,
    status: closed ? 'resolved' : 'open',
    resolved_at: closed ? new Date().toISOString() : null,
    resolution_note: closed ? `Stripe closed the chargeback: ${dispute.status}` : null,
  };
  const { error } = await jobsDb().from('disputes').upsert(row, { onConflict: 'stripe_dispute_id' });
  if (error) throw dbError(error, 'link chargeback');
  await audit(null, closed ? 'chargeback_closed' : 'chargeback_linked', 'contract', contract.id, { stripe_dispute_id: dispute.id, status: dispute.status, amount: dispute.amount });
  if (!closed) {
    const created = new Date((dispute.created ?? Date.now() / 1000) * 1000).toISOString();
    await notifyAdmins(contract, 'Stripe (chargeback)', `Chargeback opened ${created}: ${dispute.reason ?? 'no reason given'}`, `chargeback:${dispute.id}`);
  }
  await recomputeTrustSafe(contract.provider_principal_id);
}

// ── admin views ──────────────────────────────────────────────────────────────

export const listSchema = z.object({
  status: z.enum(['open', 'resolved', 'all']).default('open'),
  limit: z.number().int().min(1).max(100).default(50),
});

export async function listDisputesForAdmin(args: unknown) {
  const r = listSchema.safeParse(args ?? {});
  if (!r.success) throw new JobsError('invalid_request', 400, 'Invalid arguments', r.error.issues);
  let q = jobsDb().from('disputes').select('*').order('created_at', { ascending: r.data.status !== 'resolved' }).limit(r.data.limit);
  if (r.data.status === 'open') q = q.in('status', ['open', 'resolving']);
  else if (r.data.status === 'resolved') q = q.eq('status', 'resolved');
  const { data, error } = await q;
  if (error) throw dbError(error, 'list disputes');
  const rows = (data ?? []) as DisputeRow[];
  const contractIds = Array.from(new Set(rows.map((d) => d.contract_id)));
  const contracts = contractIds.length ? await jobsDb().from('contracts').select('id, job_id, status, currency, current_version_id').in('id', contractIds) : { data: [], error: null };
  if (contracts.error) throw dbError(contracts.error, 'dispute contracts');
  const byId = new Map(((contracts.data ?? []) as Array<{ id: string; job_id: string; status: string; currency: string; current_version_id: string | null }>).map((c) => [c.id, c]));
  const jobIds = Array.from(new Set(Array.from(byId.values()).map((c) => c.job_id)));
  const versionIds = Array.from(byId.values()).map((c) => c.current_version_id).filter((v): v is string => !!v);
  const [jobs, versions, parties] = await Promise.all([
    jobIds.length ? jobsDb().from('jobs').select('id, title').in('id', jobIds) : Promise.resolve({ data: [], error: null }),
    versionIds.length ? jobsDb().from('contract_versions').select('id, price_cents, customer_total_cents').in('id', versionIds) : Promise.resolve({ data: [], error: null }),
    describeParties(rows.flatMap((d) => [d.user_id, d.provider_user_id])),
  ]);
  const titleBy = new Map(((jobs.data ?? []) as Array<{ id: string; title: string }>).map((j) => [j.id, j.title]));
  const versionBy = new Map(((versions.data ?? []) as Array<{ id: string; price_cents: number; customer_total_cents: number }>).map((v) => [v.id, v]));
  return {
    items: rows.map((d) => {
      const c = byId.get(d.contract_id);
      const v = c?.current_version_id ? versionBy.get(c.current_version_id) : undefined;
      return {
        id: d.id,
        contract_id: d.contract_id,
        job_title: c ? titleBy.get(c.job_id) ?? null : null,
        contract_status: c?.status ?? null,
        source: d.source,
        phase: d.phase,
        category: d.category,
        status: d.status,
        default_resolution: d.default_resolution,
        resolution: d.resolution,
        reason: d.reason,
        created_at: d.created_at,
        resolved_at: d.resolved_at,
        customer: parties.get(d.user_id) ?? null,
        provider: parties.get(d.provider_user_id) ?? null,
        price_cents: v?.price_cents ?? null,
        customer_total_cents: v?.customer_total_cents ?? null,
        currency: c?.currency ?? 'eur',
        stripe_dispute_status: d.stripe_dispute_status,
      };
    }),
  };
}

async function loadDispute(id: string): Promise<DisputeRow> {
  if (!z.string().uuid().safeParse(id).success) throw new JobsError('invalid_request', 400, 'Dispute id must be a UUID');
  const { data, error } = await jobsDb().from('disputes').select('*').eq('id', id).maybeSingle();
  if (error) throw dbError(error, 'load dispute');
  if (!data) throw notFound('Dispute not found');
  return data as DisputeRow;
}

export async function getDisputeDetail(id: string) {
  const dispute = await loadDispute(id);
  const contract = (await loadContract(dispute.contract_id)) as Phase5ContractRow | null;
  if (!contract) throw notFound('Contract not found');
  const [version, payments, transfers, parties, others, qa] = await Promise.all([
    currentVersion(contract),
    listPayments(contract.id),
    listTransfers(contract.id),
    describeParties([contract.customer_user_id, contract.provider_user_id]),
    listDisputes(contract.id),
    jobsDb().from('qa_reviews').select('verdict, reason, created_at').eq('contract_id', contract.id).order('created_at', { ascending: true }),
  ]);
  const money = version ? moneyState(version, payments, transfers) : null;
  const preview = (outcome: DisputeOutcome): ResolutionPlan | null => {
    if (!money || outcome === 'partial_refund') return null;
    try {
      return planResolution(money, outcome);
    } catch {
      return null;
    }
  };
  return {
    dispute,
    contract: { id: contract.id, status: contract.status, job_id: contract.job_id, job_title: await jobTitleOf(contract.job_id), currency: contract.currency, accepted_at: contract.accepted_at },
    parties: { customer: parties.get(contract.customer_user_id) ?? null, provider: parties.get(contract.provider_user_id) ?? null },
    money: money
      ? {
          paid_cents: money.customerPaidCents,
          refunded_cents: money.alreadyRefundedCents,
          bid_cents: money.bidCents,
          fee_cents: version?.fee_cents ?? 0,
          transferred_cents: money.transferredCents,
          reversed_cents: money.alreadyReversedCents,
          refundable_cents: money.customerPaidCents - money.alreadyRefundedCents,
        }
      : null,
    previews: { release: preview('release'), full_refund: preview('full_refund') },
    qa_history: (qa.data ?? []) as Array<{ verdict: string; reason: string | null; created_at: string }>,
    other_disputes: others.filter((o) => o.id !== dispute.id).map((o) => ({ id: o.id, source: o.source, status: o.status, created_at: o.created_at, stripe_dispute_status: o.stripe_dispute_status })),
  };
}

// ── resolution ───────────────────────────────────────────────────────────────

async function claimPlan(adminUserId: string, dispute: DisputeRow, input: z.infer<typeof resolveSchema>, contract: Phase5ContractRow): Promise<DisputeRow> {
  if (dispute.status === 'resolving') return dispute; // a retry: reuse the stored plan
  const version = await currentVersion(contract);
  if (!version) throw new JobsError('invalid_state', 409, 'The contract has no version');
  const [payments, transfers] = await Promise.all([listPayments(contract.id), listTransfers(contract.id)]);
  let plan: ResolutionPlan;
  try {
    plan = planResolution(moneyState(version, payments, transfers), input.outcome, input.refund_cents);
  } catch (err) {
    if (err instanceof DisputeAmountError) {
      throw new JobsError(err.code === 'invalid_amount' ? 'invalid_amount' : 'invalid_state', err.code === 'invalid_amount' ? 422 : 409, err.message);
    }
    throw err;
  }
  const { data, error } = await jobsDb()
    .from('disputes')
    .update({
      status: 'resolving',
      resolution: plan.outcome,
      refund_cents: plan.refundCents,
      transfer_cents: plan.transferCents,
      reversal_cents: plan.reversalCents,
      resolution_note: input.note,
      resolved_by: adminUserId,
    })
    .eq('id', dispute.id)
    .eq('status', 'open')
    .select('*')
    .maybeSingle();
  if (error) throw dbError(error, 'claim dispute');
  if (!data) throw new JobsError('invalid_state', 409, 'This dispute is already being resolved');
  return data as DisputeRow;
}

async function executeRefunds(dispute: DisputeRow, contract: Phase5ContractRow): Promise<number> {
  const db = jobsDb();
  const { data: done, error } = await db.from('refunds').select('amount_cents').eq('dispute_id', dispute.id);
  if (error) throw dbError(error, 'dispute refunds');
  let remaining = (dispute.refund_cents ?? 0) - ((done ?? []) as Array<{ amount_cents: number }>).reduce((s, r) => s + r.amount_cents, 0);
  if (remaining <= 0) return 0;
  const stripe = getStripe();
  let refunded = 0;
  for (const p of await listPayments(contract.id)) {
    if (remaining <= 0) break;
    const room = p.amount_cents - p.amount_refunded_cents;
    if (room <= 0 || !p.stripe_payment_intent_id) continue;
    const amount = Math.min(room, remaining);
    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        { payment_intent: p.stripe_payment_intent_id, amount, reason: 'requested_by_customer', metadata: { contract_id: contract.id, dispute_id: dispute.id } },
        { idempotencyKey: `dispute_${dispute.id}_refund_${p.id}_${amount}` },
      );
    } catch (err) {
      throw stripeFailure(err, 'refund');
    }
    const { error: refErr } = await db.from('refunds').upsert(
      {
        payment_id: p.id,
        contract_id: contract.id,
        user_id: p.user_id,
        stripe_refund_id: refund.id,
        amount_cents: refund.amount,
        currency: refund.currency,
        reason: 'dispute',
        status: refund.status ?? 'pending',
        dispute_id: dispute.id,
      },
      { onConflict: 'stripe_refund_id' },
    );
    if (refErr) throw dbError(refErr, 'record refund');
    const newRefunded = p.amount_refunded_cents + refund.amount;
    const { error: payErr } = await db
      .from('payments')
      .update({ amount_refunded_cents: newRefunded, status: newRefunded >= p.amount_cents ? 'refunded' : 'partially_refunded' })
      .eq('id', p.id);
    if (payErr) throw dbError(payErr, 'update refunded payment');
    remaining -= refund.amount;
    refunded += refund.amount;
  }
  if (remaining > 0) throw new JobsError('stripe_error', 502, 'The refund could not be completed; resolve again to retry');
  return refunded;
}

async function executeReversal(dispute: DisputeRow, contract: Phase5ContractRow): Promise<number> {
  const db = jobsDb();
  const { data: done, error } = await db.from('transfer_reversals').select('amount_cents').eq('dispute_id', dispute.id);
  if (error) throw dbError(error, 'dispute reversals');
  let remaining = (dispute.reversal_cents ?? 0) - ((done ?? []) as Array<{ amount_cents: number }>).reduce((s, r) => s + r.amount_cents, 0);
  if (remaining <= 0) return 0;
  const stripe = getStripe();
  let reversed = 0;
  for (const t of await listTransfers(contract.id)) {
    if (remaining <= 0) break;
    const room = t.amount_cents - t.amount_reversed_cents;
    if (t.status === 'failed' || t.status === 'pending' || room <= 0 || !t.stripe_transfer_id) continue;
    const amount = Math.min(room, remaining);
    let reversal: Stripe.TransferReversal;
    try {
      reversal = await stripe.transfers.createReversal(
        t.stripe_transfer_id,
        { amount, metadata: { contract_id: contract.id, dispute_id: dispute.id } },
        { idempotencyKey: `dispute_${dispute.id}_reversal_${t.id}_${amount}` },
      );
    } catch (err) {
      throw stripeFailure(err, 'transfer reversal');
    }
    const { error: insErr } = await db.from('transfer_reversals').upsert(
      { transfer_id: t.id, contract_id: contract.id, dispute_id: dispute.id, stripe_reversal_id: reversal.id, amount_cents: reversal.amount, currency: reversal.currency },
      { onConflict: 'stripe_reversal_id' },
    );
    if (insErr) throw dbError(insErr, 'record reversal');
    const newReversed = t.amount_reversed_cents + reversal.amount;
    const { error: upErr } = await db
      .from('transfers')
      .update({ amount_reversed_cents: newReversed, status: newReversed >= t.amount_cents ? 'reversed' : 'partially_reversed' })
      .eq('id', t.id);
    if (upErr) throw dbError(upErr, 'update reversed transfer');
    remaining -= reversal.amount;
    reversed += reversal.amount;
  }
  if (remaining > 0) throw new JobsError('stripe_error', 502, 'The transfer reversal could not be completed; resolve again to retry');
  return reversed;
}

const OUTCOME_TEXT: Record<DisputeOutcome, string> = {
  release: 'The payment is released to the provider.',
  partial_refund: 'Part of the payment is refunded to the customer.',
  full_refund: 'The payment is refunded to the customer in full.',
};

export async function resolveDispute(adminUserId: string, disputeId: string, args: unknown) {
  const parsed = resolveSchema.safeParse(args ?? {});
  if (!parsed.success) throw new JobsError('invalid_request', 400, 'Invalid resolution', parsed.error.issues);
  const input = parsed.data;
  if (input.outcome === 'partial_refund' && !input.refund_cents) throw new JobsError('invalid_amount', 422, 'A partial refund needs refund_cents');
  const original = await loadDispute(disputeId);
  if (original.source === 'chargeback') throw new JobsError('invalid_state', 409, 'Chargebacks are decided by the card network through Stripe');
  if (original.status === 'resolved') throw new JobsError('invalid_state', 409, 'This dispute is already resolved');
  const contract = (await loadContract(original.contract_id)) as Phase5ContractRow | null;
  if (!contract) throw notFound('Contract not found');

  const dispute = await claimPlan(adminUserId, original, input, contract);
  const outcome = dispute.resolution as DisputeOutcome;
  const refunded = await executeRefunds(dispute, contract);
  const reversed = await executeReversal(dispute, contract);

  const now = new Date().toISOString();
  const { data: done, error } = await jobsDb()
    .from('disputes')
    .update({ status: 'resolved', resolved_at: now })
    .eq('id', dispute.id)
    .eq('status', 'resolving')
    .select('*')
    .maybeSingle();
  if (error) throw dbError(error, 'finish dispute');
  if (!done) throw new JobsError('invalid_state', 409, 'This dispute was resolved concurrently');
  const resolved = done as DisputeRow;

  const jobTitle = await jobTitleOf(contract.job_id);
  let payoutStatus: PayoutResult['status'] | null = null;
  let contractStatus: string = contract.status;
  if (dispute.phase === 'pre_accept' && contract.status === 'disputed') {
    if (outcome === 'full_refund') {
      await moveContractIfAllowed(contract, 'refunded');
      await moveJob(contract.job_id, 'cancelled');
      await purgeContractPats(contract.id);
      await promptReviews(contract, jobTitle);
      contractStatus = 'refunded';
    } else {
      // Release or partial refund: the contract completes and the provider gets their share.
      const { data: completed, error: cErr } = await jobsDb()
        .from('contracts')
        .update({ status: 'completed', accepted_at: now, accepted_by: null, acceptance: 'resolution' })
        .eq('id', contract.id)
        .eq('status', 'disputed')
        .select('*')
        .maybeSingle();
      if (cErr) throw dbError(cErr, 'complete disputed contract');
      if (completed) {
        const result = await afterAcceptance(completed as Phase5ContractRow, 'resolution', adminUserId, dispute.transfer_cents ?? undefined);
        contractStatus = 'completed';
        payoutStatus = result.payout.status;
      }
    }
  } else if ((dispute.transfer_cents ?? 0) > 0) {
    const payout = await payoutContract(contract, dispute.transfer_cents ?? 0);
    payoutStatus = payout.status;
    await notifyPayout(contract, payout, jobTitle);
  }

  await audit(adminUserId, 'dispute_resolved', 'contract', contract.id, {
    dispute_id: dispute.id,
    outcome,
    refund_cents: dispute.refund_cents,
    transfer_cents: dispute.transfer_cents,
    reversal_cents: dispute.reversal_cents,
    refunded_now: refunded,
    reversed_now: reversed,
  });
  const text = `${OUTCOME_TEXT[outcome]} ${input.note}`.slice(0, 2000);
  for (const [to, who] of [[contract.customer_user_id, 'customer'], [contract.provider_user_id, 'provider']] as const) {
    await notifyUser(to, 'dispute_resolved', { jobId: contract.job_id, jobTitle, contractId: contract.id, outcome: text }, `dispute_resolved:${dispute.id}:${who}`);
  }
  await recomputeTrustSafe(contract.provider_principal_id);
  return {
    dispute: resolved,
    contract_status: contractStatus,
    refunded_cents: dispute.refund_cents ?? 0,
    reversed_cents: dispute.reversal_cents ?? 0,
    transferred_cents: dispute.transfer_cents ?? 0,
    payout_status: payoutStatus,
  };
}
