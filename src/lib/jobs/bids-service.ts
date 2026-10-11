/**
 * Bids on jobs. A bid needs a Connect-enabled provider (see bid-eligibility.ts).
 */
import { jobsDb } from './db';
import { JobsError, dbError, isUniqueViolation, notFound } from './errors';
import { ensureUserPrincipal, getProviderProfile, getProviderProfiles } from './principals';
import { loadJob, loadSpecVersion, isUuid } from './jobs-service';
import { checkBidEligibility, bidBoundsFromEnv } from './bid-eligibility';
import { computeCommission, commissionBpsFromEnv } from './commission';
import type { CreateBidInput } from './schemas';
import type { BidRow, Pricing } from './types';

export function pricingFor(bidCents: number, commissionBps: number = commissionBpsFromEnv()): Pricing {
  const c = computeCommission(bidCents, commissionBps);
  return {
    bid_cents: c.bidCents,
    fee_cents: c.feeCents,
    customer_total_cents: c.customerTotalCents,
    provider_net_cents: c.providerNetCents,
    commission_bps: c.commissionBps,
  };
}

export async function placeBid(
  userId: string,
  jobId: string,
  input: CreateBidInput,
): Promise<{ bid: BidRow; pricing: Pricing }> {
  const job = await loadJob(jobId);
  if (!job) throw notFound('Job not found');
  const [provider, spec] = await Promise.all([
    getProviderProfile(userId),
    job.current_spec_version_id ? loadSpecVersion(job.current_spec_version_id) : Promise.resolve(null),
  ]);
  const verdict = checkBidEligibility({
    bidderUserId: userId,
    provider,
    job,
    spec,
    priceCents: input.price_cents,
    bounds: bidBoundsFromEnv(),
  });
  if (!verdict.ok) throw new JobsError(verdict.code, verdict.status);

  const principal = await ensureUserPrincipal(userId);
  const { data, error } = await jobsDb()
    .from('bids')
    .insert({
      job_id: job.id,
      spec_version_id: spec!.id,
      user_id: userId,
      provider_principal_id: principal.id,
      price_cents: input.price_cents,
      eta_days: input.eta_days,
      plan: input.plan ?? null,
      deliverables: input.deliverables,
      included_steering_credits: input.included_steering_credits,
      assumptions: input.assumptions,
      currency: job.currency,
    })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) throw new JobsError('bid_exists', 409, 'You already have an active bid on this job');
    throw dbError(error, 'place bid');
  }
  return { bid: data as BidRow, pricing: pricingFor(input.price_cents) };
}

export type BidForComparison = BidRow & {
  pricing: Pricing;
  provider: { headline: string | null; skills: string[] };
};

/** The job owner's comparison view of all bids on their job. */
export async function listBidsForOwner(userId: string, jobId: string): Promise<BidForComparison[]> {
  const job = await loadJob(jobId);
  if (!job || (job.status === 'draft' && job.user_id !== userId)) throw notFound('Job not found');
  if (job.user_id !== userId) throw new JobsError('forbidden', 403, 'Only the job owner can compare bids');
  const { data, error } = await jobsDb()
    .from('bids')
    .select('*')
    .eq('job_id', job.id)
    .order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list bids');
  const bids = (data ?? []) as BidRow[];
  const profiles = await getProviderProfiles([...new Set(bids.map((b) => b.user_id))]);
  const bps = commissionBpsFromEnv();
  return bids.map((b) => {
    const p = profiles.get(b.user_id);
    return { ...b, pricing: pricingFor(b.price_cents, bps), provider: { headline: p?.headline ?? null, skills: p?.skills ?? [] } };
  });
}

export async function loadBid(bidId: string): Promise<BidRow | null> {
  if (!isUuid(bidId)) return null;
  const { data, error } = await jobsDb().from('bids').select('*').eq('id', bidId).maybeSingle();
  if (error) throw dbError(error, 'load bid');
  return data as BidRow | null;
}

/** Guarded bid status change. Returns null if the bid was not in `from`. */
export async function setBidStatus(bidId: string, from: BidRow['status'], to: BidRow['status']): Promise<BidRow | null> {
  const { data, error } = await jobsDb()
    .from('bids')
    .update({ status: to })
    .eq('id', bidId)
    .eq('status', from)
    .select('*')
    .maybeSingle();
  if (error) throw dbError(error, 'set bid status');
  return data as BidRow | null;
}
