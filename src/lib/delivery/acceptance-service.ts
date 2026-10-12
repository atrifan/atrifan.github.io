/**
 * Acceptance: the customer accepts the delivery (or the daily cron auto-accepts it
 * JOBS_AUTO_ACCEPT_DAYS after QA validated it). Acceptance completes the contract and the job,
 * pays the provider the bid (src/lib/delivery/payout.ts), purges both sides' PATs, notifies
 * payout_sent and asks both parties for a review. An open dispute or chargeback pauses it.
 *
 * The auto-accept run also sends the 48-hour reminder and retries payouts that failed.
 */
import { jobsDb } from '../jobs/db';
import { JobsError, dbError } from '../jobs/errors';
import { loadJob, transitionJob } from '../jobs/jobs-service';
import { canTransitionJob } from '../jobs/job-state';
import { notifyUser } from '../jobs/notifications';
import { audit } from '../qa/qa-data';
import { recomputeTrustSafe } from '../trust/trust-service';
import { planAutoAccept, type AutoAcceptAction } from './auto-accept';
import {
  currentVersion,
  deliveredSubmission,
  displayName,
  jobTitleOf,
  listDisputes,
  listPayments,
  listTransfers,
  loadPartyContract,
  openDisputes,
  paymentSucceeded,
  purgeContractPats,
  type Phase5ContractRow,
} from './contract-data';
import { payoutContract, type PayoutResult } from './payout';

export type Acceptance = 'customer' | 'auto' | 'resolution';

export interface AcceptResult {
  contract_id: string;
  status: 'completed';
  accepted_at: string;
  acceptance: Acceptance;
  payout: { status: PayoutResult['status']; amount_cents: number | null; transfer_id: string | null };
}

async function completeJob(jobId: string): Promise<void> {
  const job = await loadJob(jobId);
  if (job && job.status !== 'completed' && canTransitionJob(job.status, 'completed')) await transitionJob(job.id, job.status, 'completed');
}

/** Ask both parties for a review (best effort, once per contract and side). */
export async function promptReviews(contract: Phase5ContractRow, jobTitle: string): Promise<void> {
  const [customerName, providerName] = await Promise.all([
    displayName(contract.customer_user_id, 'your customer'),
    displayName(contract.provider_user_id, 'your provider'),
  ]);
  const base = { jobId: contract.job_id, jobTitle, contractId: contract.id };
  await notifyUser(contract.customer_user_id, 'review_requested', { ...base, counterpartyName: providerName }, `review_requested:${contract.id}:customer`);
  await notifyUser(contract.provider_user_id, 'review_requested', { ...base, counterpartyName: customerName }, `review_requested:${contract.id}:provider`);
}

export async function notifyPayout(contract: Phase5ContractRow, payout: PayoutResult, jobTitle: string): Promise<void> {
  if (payout.status !== 'paid' || !payout.created) return;
  await notifyUser(
    contract.provider_user_id,
    'payout_sent',
    { amountCents: payout.transfer.amount_cents, currency: payout.transfer.currency, contractId: contract.id, jobTitle },
    `payout_sent:${payout.transfer.id}`,
  );
}

function payoutView(p: PayoutResult): AcceptResult['payout'] {
  return p.status === 'blocked'
    ? { status: 'blocked', amount_cents: null, transfer_id: null }
    : { status: p.status, amount_cents: p.transfer.amount_cents, transfer_id: p.transfer.stripe_transfer_id };
}

/**
 * Move a delivered contract to completed and pay out. The guarded delivered → completed update
 * makes a concurrent second accept (customer and cron at once) lose.
 */
async function completeDelivered(contract: Phase5ContractRow, acceptance: Acceptance, actor: string | null): Promise<AcceptResult> {
  const now = new Date().toISOString();
  const { data, error } = await jobsDb()
    .from('contracts')
    .update({ status: 'completed', accepted_at: now, accepted_by: actor, acceptance })
    .eq('id', contract.id)
    .eq('status', 'delivered')
    .select('*')
    .maybeSingle();
  if (error) throw dbError(error, 'accept contract');
  if (!data) throw new JobsError('not_acceptable', 409, 'This delivery can no longer be accepted');
  const accepted = data as Phase5ContractRow;
  return afterAcceptance(accepted, acceptance, actor);
}

/** Shared tail of acceptance and of a dispute released by an admin. */
export async function afterAcceptance(contract: Phase5ContractRow, acceptance: Acceptance, actor: string | null, amountCents?: number): Promise<AcceptResult> {
  await completeJob(contract.job_id);
  await purgeContractPats(contract.id);
  const version = await currentVersion(contract);
  const payout = await payoutContract(contract, amountCents ?? version?.price_cents ?? 0);
  const jobTitle = await jobTitleOf(contract.job_id);
  await audit(actor, 'contract_accepted', 'contract', contract.id, { acceptance, payout: payoutView(payout) });
  await notifyPayout(contract, payout, jobTitle);
  await promptReviews(contract, jobTitle);
  await recomputeTrustSafe(contract.provider_principal_id);
  return {
    contract_id: contract.id,
    status: 'completed',
    accepted_at: contract.accepted_at ?? new Date().toISOString(),
    acceptance,
    payout: payoutView(payout),
  };
}

async function assertAcceptable(contract: Phase5ContractRow): Promise<void> {
  if (contract.status !== 'delivered') throw new JobsError('not_acceptable', 409, `The contract is ${contract.status}, not delivered`);
  const [disputes, payments, sub] = await Promise.all([listDisputes(contract.id), listPayments(contract.id), deliveredSubmission(contract.id)]);
  if (openDisputes(disputes).length > 0) throw new JobsError('dispute_open', 409, 'A dispute is open on this contract');
  if (!paymentSucceeded(payments)) throw new JobsError('not_acceptable', 409, 'The payment has not gone through');
  if (!sub?.delivery_unlocked_at) throw new JobsError('delivery_locked', 409, 'QA has not validated a delivery yet');
}

/** POST /api/contracts/[id]/accept: the customer accepts the delivery. */
export async function acceptContract(userId: string, contractId: string): Promise<AcceptResult> {
  const { contract, role } = await loadPartyContract(userId, contractId);
  if (role !== 'customer') throw new JobsError('forbidden', 403, 'Only the customer can accept the delivery');
  await assertAcceptable(contract);
  return completeDelivered(contract, 'customer', userId);
}

export interface AutoAcceptRun {
  accepted: string[];
  reminded: string[];
  skipped: number;
  payouts_retried: number;
  errors: number;
}

/** The daily cron: auto-accept due contracts, send 48h reminders, retry failed payouts. */
export async function runAutoAccept(now: Date = new Date()): Promise<AutoAcceptRun> {
  const db = jobsDb();
  const out: AutoAcceptRun = { accepted: [], reminded: [], skipped: 0, payouts_retried: 0, errors: 0 };
  const { data, error } = await db.from('contracts').select('*').eq('status', 'delivered').limit(500);
  if (error) throw dbError(error, 'auto-accept candidates');
  for (const contract of (data ?? []) as Phase5ContractRow[]) {
    try {
      const [sub, disputes, payments] = await Promise.all([deliveredSubmission(contract.id), listDisputes(contract.id), listPayments(contract.id)]);
      const action: AutoAcceptAction = planAutoAccept(
        {
          contractId: contract.id,
          contractStatus: contract.status,
          autoAcceptAt: sub?.auto_accept_at ?? null,
          remindedAt: sub?.auto_accept_reminded_at ?? null,
          hasOpenDispute: openDisputes(disputes).length > 0,
          paymentSucceeded: paymentSucceeded(payments),
        },
        now,
      );
      if (action.action === 'accept') {
        await completeDelivered(contract, 'auto', null);
        out.accepted.push(contract.id);
      } else if (action.action === 'remind' && sub) {
        const { data: claimed, error: claimError } = await db
          .from('submissions')
          .update({ auto_accept_reminded_at: now.toISOString() })
          .eq('id', sub.id)
          .is('auto_accept_reminded_at', null)
          .select('id')
          .maybeSingle();
        if (claimError) throw dbError(claimError, 'claim reminder');
        if (claimed) {
          await notifyUser(
            contract.customer_user_id,
            'auto_accept_reminder',
            { jobId: contract.job_id, jobTitle: await jobTitleOf(contract.job_id), contractId: contract.id, autoAcceptAt: action.autoAcceptAt },
            `auto_accept_reminder:${sub.id}`,
          );
          out.reminded.push(contract.id);
        }
      } else {
        out.skipped += 1;
      }
    } catch (err) {
      out.errors += 1;
      console.error('[auto-accept] contract failed:', contract.id, err instanceof Error ? err.message : 'error');
    }
  }
  out.payouts_retried = await retryPayouts();
  return out;
}

/** Completed contracts accepted without a paid transfer (Stripe failed, or Connect was off). */
export async function retryPayouts(): Promise<number> {
  const { data, error } = await jobsDb()
    .from('contracts')
    .select('*')
    .eq('status', 'completed')
    .in('acceptance', ['customer', 'auto'])
    .order('accepted_at', { ascending: true })
    .limit(200);
  if (error) throw dbError(error, 'payout retry candidates');
  let retried = 0;
  for (const contract of (data ?? []) as Phase5ContractRow[]) {
    const transfers = await listTransfers(contract.id);
    if (transfers.some((t) => t.status === 'paid' || t.status === 'reversed' || t.status === 'partially_reversed')) continue;
    const disputes = await listDisputes(contract.id);
    if (disputes.length > 0) continue; // an admin decides what moves once a claim exists
    const version = await currentVersion(contract);
    const payout = await payoutContract(contract, version?.price_cents ?? 0);
    if (payout.status === 'paid' && payout.created) {
      retried += 1;
      await notifyPayout(contract, payout, await jobTitleOf(contract.job_id));
    }
  }
  return retried;
}
