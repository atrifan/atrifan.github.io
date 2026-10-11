/**
 * Contracts: accepting a bid creates a contract with version 1 (price, commission bps,
 * deadline, steering allowance) and a Stripe Checkout Session for bid + commission.
 * Payment, expiry, refunds and disputes arrive through the Stripe webhook.
 */
import { randomUUID } from 'node:crypto';
import { jobsDb } from './db';
import { JobsError, dbError, isUniqueViolation, notFound } from './errors';
import { loadJob, loadSpecVersion, transitionJob } from './jobs-service';
import { loadBid, setBidStatus } from './bids-service';
import { ensureUserPrincipal } from './principals';
import { computeCommission, commissionBpsFromEnv } from './commission';
import { assertContractTransition, canTransitionContract, type ContractStatus } from './job-state';
import { buildContractCheckoutParams, transferGroupFor } from './checkout-params';
import { getStripe, appBaseUrl, stripeFailure } from './stripe';
import { creditValueUsdFromEnv, qaCostsFromEnv, type QaCheck } from '@/src/config/qa.config';
import { computeReserve, creditsToUsd, normalizeChecks } from '@/src/lib/qa/qa-credits';
import type { ContractRow, ContractVersionRow } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface QaReserveView {
  checks: QaCheck[];
  reserve: { platform_credits: number; customer_credits: number; cap_credits: number; customer_usd: number };
}

export interface AcceptBidResult {
  contract: ContractRow;
  version: ContractVersionRow;
  checkout_url: string;
  /** QA the customer chose: held from their credits at submission (basic is paid by the platform). */
  qa: QaReserveView;
}

export function qaReserveView(qaChecks: readonly string[] | null | undefined): QaReserveView {
  const checks = normalizeChecks(qaChecks ?? null);
  const r = computeReserve(checks, qaCostsFromEnv());
  return {
    checks,
    reserve: {
      platform_credits: r.platformCredits,
      customer_credits: r.customerCredits,
      cap_credits: r.capCredits,
      customer_usd: creditsToUsd(r.customerCredits, creditValueUsdFromEnv()),
    },
  };
}

function qaCheckoutNote(qa: QaReserveView): string {
  if (qa.reserve.customer_credits === 0) return 'Basic QA is included. No QA credits are reserved from your balance.';
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(qa.reserve.customer_usd);
  return `QA checks (${qa.checks.join(', ')}): ${qa.reserve.customer_credits} credits (${usd}) will be reserved from your Tulzo credit balance when the work is submitted for QA; unused credits are released. Basic QA is included.`;
}

export function contractCheckoutUrls(contractId: string): { successUrl: string; cancelUrl: string } {
  const base = appBaseUrl();
  return {
    successUrl: `${base}/gigs/contracts/${contractId}?checkout=success`,
    cancelUrl: `${base}/gigs/contracts/${contractId}?checkout=cancelled`,
  };
}

export async function loadContract(contractId: string): Promise<ContractRow | null> {
  const { data, error } = await jobsDb().from('contracts').select('*').eq('id', contractId).maybeSingle();
  if (error) throw dbError(error, 'load contract');
  return data as ContractRow | null;
}

export async function loadContractVersion(versionId: string): Promise<ContractVersionRow | null> {
  const { data, error } = await jobsDb().from('contract_versions').select('*').eq('id', versionId).maybeSingle();
  if (error) throw dbError(error, 'load contract version');
  return data as ContractVersionRow | null;
}

/** Guarded contract status change. Returns null if the contract was not in `from`. */
export async function transitionContract(
  contractId: string,
  from: ContractStatus,
  to: ContractStatus,
): Promise<ContractRow | null> {
  assertContractTransition(from, to);
  const { data, error } = await jobsDb()
    .from('contracts')
    .update({ status: to })
    .eq('id', contractId)
    .eq('status', from)
    .select('*')
    .maybeSingle();
  if (error) throw dbError(error, 'transition contract');
  return data as ContractRow | null;
}

/** Move a contract to `to` if its current status allows it; no-op otherwise. */
export async function moveContractIfAllowed(contract: ContractRow, to: ContractStatus): Promise<boolean> {
  if (!canTransitionContract(contract.status, to)) return false;
  return (await transitionContract(contract.id, contract.status, to)) !== null;
}

export async function acceptBid(
  userId: string,
  bidId: string,
  opts: { qaChecks?: readonly string[] } = {},
): Promise<AcceptBidResult> {
  const qa = qaReserveView(opts.qaChecks);
  const bid = await loadBid(bidId);
  if (!bid) throw notFound('Bid not found');
  const job = await loadJob(bid.job_id);
  if (!job || job.user_id !== userId) throw notFound('Bid not found');
  if (bid.status === 'accepted') throw new JobsError('already_accepted', 409, 'This bid was already accepted');
  if (bid.status !== 'active') throw new JobsError('bid_not_active', 409, `This bid is ${bid.status}`);
  if (job.status !== 'open') throw new JobsError('job_not_open', 409, 'The job is not open');

  const spec = await loadSpecVersion(bid.spec_version_id);
  if (!spec) throw new JobsError('spec_not_approved', 409, 'The bid references a missing spec');

  const breakdown = computeCommission(bid.price_cents, commissionBpsFromEnv());
  const customer = await ensureUserPrincipal(userId);

  // Claim the job first: the guarded open -> awarded update makes concurrent accepts lose.
  const awarded = await transitionJob(job.id, 'open', 'awarded');
  if (!awarded) throw new JobsError('job_not_open', 409, 'The job is not open');

  const db = jobsDb();
  const contractId = randomUUID();
  let contractCreated = false;
  let bidAccepted = false;
  const rollback = async () => {
    if (contractCreated) await db.from('contracts').update({ status: 'cancelled' }).eq('id', contractId).eq('status', 'pending_payment');
    if (bidAccepted) await setBidStatus(bid.id, 'accepted', 'active');
    await transitionJob(job.id, 'awarded', 'open');
  };

  try {
    if (!(await setBidStatus(bid.id, 'active', 'accepted'))) {
      throw new JobsError('bid_not_active', 409, 'The bid is no longer active');
    }
    bidAccepted = true;

    const { data: contract, error: contractError } = await db
      .from('contracts')
      .insert({
        id: contractId,
        job_id: job.id,
        bid_id: bid.id,
        user_id: userId,
        customer_user_id: userId,
        provider_user_id: bid.user_id,
        customer_principal_id: customer.id,
        provider_principal_id: bid.provider_principal_id,
        status: 'pending_payment',
        currency: bid.currency,
        transfer_group: transferGroupFor(contractId),
      })
      .select('*')
      .single();
    if (contractError) {
      if (isUniqueViolation(contractError)) throw new JobsError('already_accepted', 409, 'The job already has a contract');
      throw dbError(contractError, 'create contract');
    }
    contractCreated = true;

    const now = new Date();
    const deadline = job.deadline ?? spec.deadline ?? new Date(now.getTime() + bid.eta_days * DAY_MS).toISOString();
    const { data: version, error: versionError } = await db
      .from('contract_versions')
      .insert({
        contract_id: contractId,
        user_id: userId,
        version: 1,
        spec_version_id: spec.id,
        price_cents: breakdown.bidCents,
        commission_bps: breakdown.commissionBps,
        fee_cents: breakdown.feeCents,
        customer_total_cents: breakdown.customerTotalCents,
        currency: bid.currency,
        deadline,
        steering_allowance: bid.included_steering_credits,
        signed_by_customer_at: now.toISOString(),
        signed_by_provider_at: bid.created_at, // placing the bid is the provider's signature on these terms
        qa_checks: qa.checks,
      })
      .select('*')
      .single();
    if (versionError) throw dbError(versionError, 'create contract version');

    const { successUrl, cancelUrl } = contractCheckoutUrls(contractId);
    let session;
    try {
      session = await getStripe().checkout.sessions.create(
        buildContractCheckoutParams({
          contractId,
          jobId: job.id,
          bidId: bid.id,
          jobTitle: job.title,
          customerTotalCents: breakdown.customerTotalCents,
          currency: bid.currency,
          successUrl,
          cancelUrl,
          note: qaCheckoutNote(qa),
        }),
        { idempotencyKey: `contract_checkout_${contractId}` },
      );
    } catch (err) {
      if (err instanceof JobsError) throw err;
      throw stripeFailure(err, 'checkout session');
    }
    if (!session.url) throw stripeFailure(new Error('no url'), 'checkout session');

    const { data: updated, error: updateError } = await db
      .from('contracts')
      .update({ current_version_id: version.id, stripe_checkout_session_id: session.id })
      .eq('id', contractId)
      .select('*')
      .single();
    if (updateError) throw dbError(updateError, 'link checkout');

    return { contract: updated as ContractRow, version: version as ContractVersionRow, checkout_url: session.url, qa };
  } catch (err) {
    try {
      await rollback();
    } catch (rollbackErr) {
      console.error('[jobs] accept rollback failed:', rollbackErr);
    }
    throw err;
  }
}
