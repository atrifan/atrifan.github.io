/**
 * Gigs "My activity": the customer and provider summaries and one chronological ledger, built
 * from the rows the service reads (jobs, bids, contracts with their current version, payments,
 * transfers, deliveries, reviews). Pure; rows that don't belong to `userId` are ignored.
 */

export type LedgerRole = 'customer' | 'provider';
export type LedgerKind = 'job_posted' | 'bid_received' | 'contract' | 'payment' | 'delivery' | 'bid_placed' | 'contract_won' | 'payout' | 'review';

export const LEDGER_KINDS: readonly LedgerKind[] = ['job_posted', 'bid_received', 'contract', 'payment', 'delivery', 'bid_placed', 'contract_won', 'payout', 'review'];

export const LEDGER_KIND_LABELS: Record<LedgerKind, string> = {
  job_posted: 'Job posted',
  bid_received: 'Bid received',
  contract: 'Contract',
  payment: 'Payment',
  delivery: 'Delivery',
  bid_placed: 'Bid placed',
  contract_won: 'Contract won',
  payout: 'Payout',
  review: 'Review',
};

export interface LedgerEntry {
  id: string;
  at: string;
  role: LedgerRole;
  kind: LedgerKind;
  jobTitle: string;
  amountCents: number | null;
  commissionCents: number | null;
  status: string;
}

export interface GigsActivityInput {
  userId: string;
  jobs: Array<{ id: string; user_id: string; title: string; status: string; created_at: string }>;
  bids: Array<{ id: string; job_id: string; user_id: string; price_cents: number; status: string; created_at: string }>;
  contracts: Array<{
    id: string;
    job_id: string;
    customer_user_id: string;
    provider_user_id: string;
    status: string;
    created_at: string;
    price_cents: number | null;
    fee_cents: number | null;
    customer_total_cents: number | null;
  }>;
  payments: Array<{
    id: string;
    contract_id: string;
    user_id: string;
    amount_cents: number;
    amount_refunded_cents: number;
    status: string;
    created_at: string;
    version_fee_cents: number | null;
    version_total_cents: number | null;
  }>;
  transfers: Array<{ id: string; contract_id: string; user_id: string; amount_cents: number; amount_reversed_cents: number; status: string; created_at: string }>;
  deliveries: Array<{ id: string; contract_id: string; user_id: string; kind: string; status: string; created_at: string }>;
  reviews: Array<{ id: string; contract_id: string; subject_user_id: string; overall: number; created_at: string }>;
}

export interface CustomerSummary {
  jobsPosted: number;
  bidsReceived: number;
  contracts: number;
  deliveries: number;
  /** Paid minus refunded. */
  paymentsCents: number;
  /** Our fee inside those payments (not counted once a payment is fully refunded). */
  commissionCents: number;
}

export interface ProviderSummary {
  bidsPlaced: number;
  contractsWon: number;
  /** Paid-out transfers minus reversals. */
  payoutsCents: number;
  reviews: number;
}

export interface GigsActivity {
  customer: CustomerSummary;
  provider: ProviderSummary;
  ledger: LedgerEntry[];
}

/** Payment statuses where the money was collected. */
export const COLLECTED_PAYMENT = new Set(['succeeded', 'partially_refunded', 'refunded', 'disputed']);
/** Payment statuses where the commission was kept. */
export const EARNED_PAYMENT = new Set(['succeeded', 'partially_refunded', 'disputed']);
/** Transfer statuses where money reached the provider. */
export const PAID_TRANSFER = new Set(['paid', 'partially_reversed']);

/**
 * Our fee inside a payment. The first checkout pays the version total and carries its whole
 * fee; a scope-change top-up carries the same share of the fee as of the total.
 */
export function commissionFor(amountCents: number, versionFeeCents: number, versionTotalCents: number): number {
  if (versionTotalCents <= 0) return 0;
  if (amountCents === versionTotalCents) return versionFeeCents;
  return Math.round((amountCents * versionFeeCents) / versionTotalCents);
}

const iso = (t: string) => new Date(t).toISOString();

export function buildGigsActivity(input: GigsActivityInput): GigsActivity {
  const me = input.userId;
  const jobs = new Map(input.jobs.map((j) => [j.id, j]));
  const contracts = new Map(input.contracts.map((c) => [c.id, c]));
  const titleOfJob = (jobId: string | undefined) => (jobId && jobs.get(jobId)?.title) || 'Unknown job';
  const titleOfContract = (contractId: string) => titleOfJob(contracts.get(contractId)?.job_id);
  const ledger: LedgerEntry[] = [];
  const push = (e: Omit<LedgerEntry, 'at'> & { at: string }) => ledger.push({ ...e, at: iso(e.at) });

  const customer: CustomerSummary = { jobsPosted: 0, bidsReceived: 0, contracts: 0, deliveries: 0, paymentsCents: 0, commissionCents: 0 };
  const provider: ProviderSummary = { bidsPlaced: 0, contractsWon: 0, payoutsCents: 0, reviews: 0 };

  for (const j of input.jobs) {
    if (j.user_id !== me || j.status === 'draft') continue;
    customer.jobsPosted += 1;
    push({ id: `job_posted:${j.id}`, at: j.created_at, role: 'customer', kind: 'job_posted', jobTitle: j.title, amountCents: null, commissionCents: null, status: j.status });
  }

  for (const b of input.bids) {
    if (b.user_id === me) {
      provider.bidsPlaced += 1;
      push({ id: `bid_placed:${b.id}`, at: b.created_at, role: 'provider', kind: 'bid_placed', jobTitle: titleOfJob(b.job_id), amountCents: b.price_cents, commissionCents: null, status: b.status });
    } else if (jobs.get(b.job_id)?.user_id === me) {
      customer.bidsReceived += 1;
      push({ id: `bid_received:${b.id}`, at: b.created_at, role: 'customer', kind: 'bid_received', jobTitle: titleOfJob(b.job_id), amountCents: b.price_cents, commissionCents: null, status: b.status });
    }
  }

  for (const c of input.contracts) {
    if (c.customer_user_id === me) {
      customer.contracts += 1;
      push({ id: `contract:${c.id}`, at: c.created_at, role: 'customer', kind: 'contract', jobTitle: titleOfJob(c.job_id), amountCents: c.customer_total_cents, commissionCents: c.fee_cents, status: c.status });
    } else if (c.provider_user_id === me) {
      provider.contractsWon += 1;
      push({ id: `contract_won:${c.id}`, at: c.created_at, role: 'provider', kind: 'contract_won', jobTitle: titleOfJob(c.job_id), amountCents: c.price_cents, commissionCents: null, status: c.status });
    }
  }

  for (const p of input.payments) {
    if (p.user_id !== me) continue;
    const fee = EARNED_PAYMENT.has(p.status) ? commissionFor(p.amount_cents, p.version_fee_cents ?? 0, p.version_total_cents ?? 0) : 0;
    if (COLLECTED_PAYMENT.has(p.status)) customer.paymentsCents += p.amount_cents - p.amount_refunded_cents;
    customer.commissionCents += fee;
    push({ id: `payment:${p.id}`, at: p.created_at, role: 'customer', kind: 'payment', jobTitle: titleOfContract(p.contract_id), amountCents: p.amount_cents, commissionCents: fee, status: p.status });
  }

  for (const d of input.deliveries) {
    if (d.user_id !== me) continue;
    if (d.status === 'succeeded') customer.deliveries += 1;
    push({ id: `delivery:${d.id}`, at: d.created_at, role: 'customer', kind: 'delivery', jobTitle: titleOfContract(d.contract_id), amountCents: null, commissionCents: null, status: d.status });
  }

  for (const t of input.transfers) {
    if (t.user_id !== me) continue;
    if (PAID_TRANSFER.has(t.status)) provider.payoutsCents += t.amount_cents - t.amount_reversed_cents;
    push({ id: `payout:${t.id}`, at: t.created_at, role: 'provider', kind: 'payout', jobTitle: titleOfContract(t.contract_id), amountCents: t.amount_cents, commissionCents: null, status: t.status });
  }

  for (const r of input.reviews) {
    if (r.subject_user_id !== me) continue;
    provider.reviews += 1;
    push({ id: `review:${r.id}`, at: r.created_at, role: 'provider', kind: 'review', jobTitle: titleOfContract(r.contract_id), amountCents: null, commissionCents: null, status: `${r.overall}/5` });
  }

  ledger.sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  return { customer, provider, ledger };
}

export interface LedgerFilter {
  role?: LedgerRole | '';
  kind?: LedgerKind | '';
  /** Inclusive UTC days, `YYYY-MM-DD`; anything else is ignored. */
  from?: string;
  to?: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function filterLedger(entries: readonly LedgerEntry[], f: LedgerFilter): LedgerEntry[] {
  const from = f.from && DAY_RE.test(f.from) ? f.from : null;
  const to = f.to && DAY_RE.test(f.to) ? f.to : null;
  return entries.filter((e) => {
    if (f.role && e.role !== f.role) return false;
    if (f.kind && e.kind !== f.kind) return false;
    const day = e.at.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}
