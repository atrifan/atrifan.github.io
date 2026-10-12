/**
 * Gigs "My activity" (GET /api/activity/gigs): reads the user's side of jobs, bids, contracts,
 * payments, transfers, deliveries and reviews, and hands them to the pure ledger builder.
 * Every query filters by the user (or by ids already scoped to the user).
 */
import { jobsDb } from '../jobs/db';
import { dbError } from '../jobs/errors';
import { buildGigsActivity, type GigsActivity, type GigsActivityInput } from './ledger';

const LIMIT = 1000;

type Row = Record<string, unknown>;

async function rows<T = Row>(q: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw dbError(error, what);
  return (data ?? []) as T[];
}

const unique = (xs: Array<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))];

/** `.in()` with an empty list matches nothing; skip the round trip. */
async function byIds<T>(table: string, cols: string, ids: string[], what: string): Promise<T[]> {
  if (ids.length === 0) return [];
  return rows<T>(jobsDb().from(table).select(cols).in('id', ids).limit(LIMIT), what);
}

export async function loadGigsActivity(userId: string): Promise<GigsActivity & { currency: 'eur' }> {
  const db = jobsDb();
  const [myJobs, myBids, contracts, payments, transfers, deliveries, reviews] = await Promise.all([
    rows<GigsActivityInput['jobs'][number]>(db.from('jobs').select('id, user_id, title, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(LIMIT), 'activity jobs'),
    rows<GigsActivityInput['bids'][number]>(db.from('bids').select('id, job_id, user_id, price_cents, status, created_at').eq('user_id', userId).limit(LIMIT), 'activity bids placed'),
    rows<Row>(
      db
        .from('contracts')
        .select('id, job_id, customer_user_id, provider_user_id, status, created_at, current_version_id')
        .or(`customer_user_id.eq."${userId}",provider_user_id.eq."${userId}"`)
        .limit(LIMIT),
      'activity contracts',
    ),
    rows<Row>(db.from('payments').select('id, contract_id, contract_version_id, user_id, amount_cents, amount_refunded_cents, status, created_at').eq('user_id', userId).limit(LIMIT), 'activity payments'),
    rows<GigsActivityInput['transfers'][number]>(db.from('transfers').select('id, contract_id, user_id, amount_cents, amount_reversed_cents, status, created_at').eq('user_id', userId).limit(LIMIT), 'activity transfers'),
    rows<GigsActivityInput['deliveries'][number]>(db.from('deliveries').select('id, contract_id, user_id, kind, status, created_at').eq('user_id', userId).limit(LIMIT), 'activity deliveries'),
    rows<GigsActivityInput['reviews'][number]>(db.from('reviews').select('id, contract_id, subject_user_id, overall, created_at').eq('subject_user_id', userId).limit(LIMIT), 'activity reviews'),
  ]);

  const myJobIds = myJobs.map((j) => j.id);
  const bidsOnMyJobs = myJobIds.length
    ? await rows<GigsActivityInput['bids'][number]>(db.from('bids').select('id, job_id, user_id, price_cents, status, created_at').in('job_id', myJobIds).neq('user_id', userId).limit(LIMIT), 'activity bids received')
    : [];

  const versionIds = unique([...contracts.map((c) => c.current_version_id as string | null), ...payments.map((p) => p.contract_version_id as string | null)]);
  const versions = await byIds<{ id: string; price_cents: number; fee_cents: number; customer_total_cents: number }>('contract_versions', 'id, price_cents, fee_cents, customer_total_cents', versionIds, 'activity versions');
  const version = new Map(versions.map((v) => [v.id, v]));

  const contractIds = new Set(contracts.map((c) => c.id as string));
  const missingContracts = unique([...payments, ...transfers, ...deliveries, ...reviews].map((r) => (r as { contract_id: string }).contract_id)).filter((id) => !contractIds.has(id));
  const extraContracts = await byIds<Row>('contracts', 'id, job_id', missingContracts, 'activity contract titles');

  const knownJobs = new Set(myJobIds);
  const otherJobIds = unique([...myBids.map((b) => b.job_id), ...contracts.map((c) => c.job_id as string), ...extraContracts.map((c) => c.job_id as string)]).filter((id) => !knownJobs.has(id));
  const otherJobs = await byIds<GigsActivityInput['jobs'][number]>('jobs', 'id, user_id, title, status, created_at', otherJobIds, 'activity job titles');

  const input: GigsActivityInput = {
    userId,
    jobs: [...myJobs, ...otherJobs],
    bids: [...myBids, ...bidsOnMyJobs],
    contracts: [
      ...contracts.map((c) => {
        const v = version.get(c.current_version_id as string);
        return {
          id: c.id as string,
          job_id: c.job_id as string,
          customer_user_id: c.customer_user_id as string,
          provider_user_id: c.provider_user_id as string,
          status: c.status as string,
          created_at: c.created_at as string,
          price_cents: v?.price_cents ?? null,
          fee_cents: v?.fee_cents ?? null,
          customer_total_cents: v?.customer_total_cents ?? null,
        };
      }),
      // Title lookups only: neither side is the user, so they never reach the ledger.
      ...extraContracts.map((c) => ({ id: c.id as string, job_id: c.job_id as string, customer_user_id: '', provider_user_id: '', status: '', created_at: new Date(0).toISOString(), price_cents: null, fee_cents: null, customer_total_cents: null })),
    ],
    payments: payments.map((p) => {
      const v = version.get(p.contract_version_id as string);
      return {
        id: p.id as string,
        contract_id: p.contract_id as string,
        user_id: p.user_id as string,
        amount_cents: p.amount_cents as number,
        amount_refunded_cents: p.amount_refunded_cents as number,
        status: p.status as string,
        created_at: p.created_at as string,
        version_fee_cents: v?.fee_cents ?? null,
        version_total_cents: v?.customer_total_cents ?? null,
      };
    }),
    transfers,
    deliveries,
    reviews,
  };
  return { currency: 'eur', ...buildGigsActivity(input) };
}
