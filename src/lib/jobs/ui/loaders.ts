/**
 * Data for the gigs pages (server components). Reuses the gigs services, so the pages see
 * exactly what the API returns; the extra reads here (party names, Stripe badges, the
 * viewer's own bid, a contract's parts) are filtered by the ids the viewer may see.
 */
import 'server-only';
import { jobsDb } from '../db';
import { JobsError, dbError } from '../errors';
import { getJobForViewer, isUuid, listJobs, loadJob, loadSpecVersion, type JobWithBidCount } from '../jobs-service';
import { listOffers } from '../offers-service';
import { listBidsForOwner, loadBid, type BidForComparison } from '../bids-service';
import { loadContract, loadContractVersion } from '../contracts-service';
import { getProviderProfiles } from '../principals';
import { parseJobListQuery, parseOfferListQuery } from '../schemas';
import { toJobsApiParams, toOffersApiParams, type ListingState } from '../client/listing-query';
import type { BidRow, ContractRow, ContractVersionRow, JobRow, JobSpecVersionRow, OfferRow } from '../types';

export interface OfferCardData extends OfferRow {
  provider_name: string;
  stripe_linked: boolean;
}

export type ListingData =
  | { tab: 'jobs'; jobs: JobWithBidCount[]; total: number; error?: string }
  | { tab: 'offers'; offers: OfferCardData[]; total: number; error?: string };

const FALLBACK_PROVIDER = 'Tulzo provider';

/** Next.js control-flow errors (dynamic usage, redirects) must not be swallowed by a fallback. */
function rethrowNext(err: unknown): void {
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest === 'string' && (digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_'))) throw err;
}

async function principalNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data, error } = await jobsDb().from('principals').select('id, display_name').in('id', ids);
  if (error) throw dbError(error, 'principal names');
  for (const row of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
    if (row.display_name) out.set(row.id, row.display_name);
  }
  return out;
}

export async function loadListing(state: ListingState, viewerId: string | null, now: Date = new Date()): Promise<ListingData> {
  try {
    if (state.tab === 'jobs') {
      const parsed = parseJobListQuery(new URLSearchParams(toJobsApiParams(state, now)));
      if (!parsed.ok) return { tab: 'jobs', jobs: [], total: 0 };
      const { jobs, total } = await listJobs(viewerId ?? '', parsed.value);
      return { tab: 'jobs', jobs, total };
    }
    const parsed = parseOfferListQuery(new URLSearchParams(toOffersApiParams(state)));
    if (!parsed.ok) return { tab: 'offers', offers: [], total: 0 };
    const { offers, total } = await listOffers(viewerId ?? '', parsed.value);
    const [names, profiles] = await Promise.all([
      principalNames([...new Set(offers.map((o) => o.provider_principal_id))]),
      getProviderProfiles([...new Set(offers.map((o) => o.user_id))]),
    ]);
    return {
      tab: 'offers',
      total,
      offers: offers.map((o) => ({
        ...o,
        provider_name: names.get(o.provider_principal_id) ?? FALLBACK_PROVIDER,
        stripe_linked: profiles.get(o.user_id)?.payouts_enabled === true,
      })),
    };
  } catch (err) {
    rethrowNext(err);
    console.error('[gigs-ui] listing failed:', err instanceof Error ? err.message : err);
    const error = 'We could not load the list right now. Try again in a moment.';
    return state.tab === 'jobs' ? { tab: 'jobs', jobs: [], total: 0, error } : { tab: 'offers', offers: [], total: 0, error };
  }
}

export interface JobPageData {
  job: JobRow;
  spec: JobSpecVersionRow | null;
  bidCount: number;
  isOwner: boolean;
  /** The viewer's active bid on this job, if any. */
  myBid: BidRow | null;
  /** Owner only. */
  bids: BidForComparison[];
  /** Owner only: the contract created by accepting a bid. */
  contractId: string | null;
}

async function countBids(jobId: string): Promise<number> {
  const { count, error } = await jobsDb().from('bids').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
  if (error) throw dbError(error, 'count bids');
  return count ?? 0;
}

async function activeBidOf(jobId: string, userId: string): Promise<BidRow | null> {
  const { data, error } = await jobsDb()
    .from('bids')
    .select('*')
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw dbError(error, 'my bid');
  return data as BidRow | null;
}

async function contractForJob(jobId: string, customerId: string): Promise<string | null> {
  const { data, error } = await jobsDb()
    .from('contracts')
    .select('id')
    .eq('job_id', jobId)
    .eq('customer_user_id', customerId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError(error, 'contract for job');
  return (data as { id: string } | null)?.id ?? null;
}

/** null when the job does not exist or the viewer may not see it (drafts are owner-only). */
export async function loadJobPage(jobId: string, viewerId: string | null): Promise<JobPageData | null> {
  let view: { job: JobRow; spec: JobSpecVersionRow | null };
  try {
    view = await getJobForViewer(viewerId ?? '', jobId);
  } catch (err) {
    if (err instanceof JobsError && err.code === 'not_found') return null;
    throw err;
  }
  const { job, spec } = view;
  const isOwner = viewerId != null && job.user_id === viewerId;
  const [bidCount, myBid, bids, contractId] = await Promise.all([
    countBids(job.id),
    viewerId && !isOwner ? activeBidOf(job.id, viewerId) : Promise.resolve(null),
    isOwner ? listBidsForOwner(viewerId!, job.id) : Promise.resolve([] as BidForComparison[]),
    isOwner ? contractForJob(job.id, viewerId!) : Promise.resolve(null),
  ]);
  return { job, spec, bidCount, isOwner, myBid, bids, contractId };
}

/** The job and its latest spec for the post wizard, when the viewer owns it. */
export async function loadOwnedJobForWizard(
  jobId: string,
  viewerId: string,
): Promise<{ job: JobRow; spec: JobSpecVersionRow | null } | null> {
  if (!isUuid(jobId)) return null;
  const job = await loadJob(jobId);
  if (!job || job.user_id !== viewerId) return null;
  const { spec } = await getJobForViewer(viewerId, jobId);
  return { job, spec };
}

export interface ContractPageData {
  contract: ContractRow;
  role: 'customer' | 'provider';
  version: ContractVersionRow | null;
  job: JobRow | null;
  spec: JobSpecVersionRow | null;
  bid: BidRow | null;
}

/** null unless the viewer is the contract's customer or provider. */
export async function loadContractPage(contractId: string, viewerId: string): Promise<ContractPageData | null> {
  if (!isUuid(contractId)) return null;
  const contract = await loadContract(contractId);
  if (!contract) return null;
  const role = contract.customer_user_id === viewerId ? 'customer' : contract.provider_user_id === viewerId ? 'provider' : null;
  if (!role) return null;
  const [version, job, bid] = await Promise.all([
    contract.current_version_id ? loadContractVersion(contract.current_version_id) : Promise.resolve(null),
    loadJob(contract.job_id),
    loadBid(contract.bid_id),
  ]);
  const spec = version ? await loadSpecVersion(version.spec_version_id) : null;
  return { contract, role, version, job, spec, bid };
}

/** Open jobs for the sitemap, newest first. Empty if the database is unavailable. */
export async function loadOpenJobsForSitemap(limit = 1000): Promise<JobRow[]> {
  try {
    const { data, error } = await jobsDb()
      .from('jobs')
      .select('id, title, description, category, budget_min_cents, budget_max_cents, deadline, created_at, updated_at, status')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw dbError(error, 'sitemap jobs');
    return (data ?? []) as JobRow[];
  } catch (err) {
    rethrowNext(err);
    console.error('[gigs-ui] sitemap jobs failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
