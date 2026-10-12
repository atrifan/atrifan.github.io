/**
 * Admin activity overview (GET /api/admin/activity, hub /admin/activity): marketplace installs and
 * publishes, gigs payments with the commission inside them, payouts, refunds and disputes for a
 * date range, with totals. Reads the existing tables; the money rules are in ./totals.ts.
 */
import { jobsDb } from '../jobs/db';
import { getMarketplaceActivity } from '../marketplace-service';
import { commissionFor } from './ledger';
import { adminTotals, rangeBounds, type AdminTotals, type DateRange } from './totals';

const LIST_LIMIT = 100;
/** Money totals read every row in range (not just the listed ones), up to this many. */
const SUM_LIMIT = 10_000;

export interface AdminActivity {
  range: DateRange;
  currency: 'eur';
  totals: AdminTotals;
  installs: Array<{ packageId: string; packageName: string; version: string | null; at: string }>;
  publishes: Array<{ packageId: string; packageName: string; version: string | null; at: string; visibility: string }>;
  payments: Array<{ id: string; at: string; jobTitle: string; amountCents: number; feeCents: number; status: string }>;
  payouts: Array<{ id: string; at: string; jobTitle: string; amountCents: number; status: string }>;
  refunds: Array<{ id: string; at: string; jobTitle: string; amountCents: number; status: string }>;
  disputes: Array<{ id: string; at: string; jobTitle: string; category: string; status: string }>;
}

type Row = Record<string, unknown>;

async function inRange(table: string, cols: string, start: string, end: string): Promise<Row[]> {
  const { data, error } = await jobsDb()
    .from(table)
    .select(cols)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .limit(SUM_LIMIT);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

async function byIds(table: string, cols: string, ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return [];
  const { data, error } = await jobsDb().from(table).select(cols).in('id', ids);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

const unique = (xs: unknown[]) => [...new Set(xs.filter((x): x is string => typeof x === 'string' && x.length > 0))];

export async function loadAdminActivity(range: DateRange): Promise<AdminActivity> {
  const { start, end } = rangeBounds(range);
  const [market, payments, transfers, refunds, disputes] = await Promise.all([
    getMarketplaceActivity(start, end, LIST_LIMIT),
    inRange('payments', 'id, contract_id, contract_version_id, amount_cents, amount_refunded_cents, status, created_at', start, end),
    inRange('transfers', 'id, contract_id, amount_cents, amount_reversed_cents, status, created_at', start, end),
    inRange('refunds', 'id, contract_id, amount_cents, status, created_at', start, end),
    inRange('disputes', 'id, contract_id, category, status, created_at', start, end),
  ]);

  const versions = new Map(
    (await byIds('contract_versions', 'id, fee_cents, customer_total_cents', unique(payments.map((p) => p.contract_version_id)))).map((v) => [v.id as string, v]),
  );
  const contracts = new Map(
    (await byIds('contracts', 'id, job_id', unique([...payments, ...transfers, ...refunds, ...disputes].map((r) => r.contract_id)))).map((c) => [c.id as string, c]),
  );
  const jobs = new Map((await byIds('jobs', 'id, title', unique([...contracts.values()].map((c) => c.job_id)))).map((j) => [j.id as string, j]));
  const title = (contractId: unknown) => (jobs.get(contracts.get(contractId as string)?.job_id as string)?.title as string | undefined) ?? 'Unknown job';

  const fee = (p: Row) => {
    const v = versions.get(p.contract_version_id as string);
    return v ? commissionFor(p.amount_cents as number, v.fee_cents as number, v.customer_total_cents as number) : 0;
  };

  const totals = adminTotals({
    installs: market.installCount,
    publishes: market.publishCount,
    payments: payments.map((p) => ({ amount_cents: p.amount_cents as number, amount_refunded_cents: p.amount_refunded_cents as number, status: p.status as string, fee_cents: fee(p) })),
    transfers: transfers.map((t) => ({ amount_cents: t.amount_cents as number, amount_reversed_cents: t.amount_reversed_cents as number, status: t.status as string })),
    refunds: refunds.map((r) => ({ amount_cents: r.amount_cents as number, status: r.status as string })),
    disputes: disputes.length,
  });

  const at = (r: Row) => new Date(r.created_at as string).toISOString();
  return {
    range,
    currency: 'eur',
    totals,
    installs: market.installs,
    publishes: market.publishes,
    payments: payments.slice(0, LIST_LIMIT).map((p) => ({ id: p.id as string, at: at(p), jobTitle: title(p.contract_id), amountCents: p.amount_cents as number, feeCents: fee(p), status: p.status as string })),
    payouts: transfers.slice(0, LIST_LIMIT).map((t) => ({ id: t.id as string, at: at(t), jobTitle: title(t.contract_id), amountCents: t.amount_cents as number, status: t.status as string })),
    refunds: refunds.slice(0, LIST_LIMIT).map((r) => ({ id: r.id as string, at: at(r), jobTitle: title(r.contract_id), amountCents: r.amount_cents as number, status: r.status as string })),
    disputes: disputes.slice(0, LIST_LIMIT).map((d) => ({ id: d.id as string, at: at(d), jobTitle: title(d.contract_id), category: d.category as string, status: d.status as string })),
  };
}
