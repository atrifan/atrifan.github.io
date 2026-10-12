import { describe, expect, it } from 'vitest';
import { buildGigsActivity, commissionFor, filterLedger, type GigsActivityInput } from '@/src/lib/activity/ledger';

const ME = 'u_me';
const OTHER = 'u_other';

function input(over: Partial<GigsActivityInput> = {}): GigsActivityInput {
  return {
    userId: ME,
    jobs: [
      { id: 'j1', user_id: ME, title: 'CSV importer', status: 'in_progress', created_at: '2026-10-01T09:00:00Z' },
      { id: 'j2', user_id: ME, title: 'Draft idea', status: 'draft', created_at: '2026-10-02T09:00:00Z' },
      { id: 'j3', user_id: OTHER, title: 'Webhook relay', status: 'in_progress', created_at: '2026-10-03T09:00:00Z' },
    ],
    bids: [
      { id: 'b1', job_id: 'j1', user_id: OTHER, price_cents: 30000, status: 'accepted', created_at: '2026-10-02T10:00:00Z' },
      { id: 'b2', job_id: 'j1', user_id: 'u_third', price_cents: 28000, status: 'rejected', created_at: '2026-10-02T11:00:00Z' },
      { id: 'b3', job_id: 'j3', user_id: ME, price_cents: 50000, status: 'accepted', created_at: '2026-10-04T10:00:00Z' },
    ],
    contracts: [
      { id: 'c1', job_id: 'j1', customer_user_id: ME, provider_user_id: OTHER, status: 'active', created_at: '2026-10-03T08:00:00Z', price_cents: 30000, fee_cents: 4500, customer_total_cents: 34500 },
      { id: 'c3', job_id: 'j3', customer_user_id: OTHER, provider_user_id: ME, status: 'completed', created_at: '2026-10-05T08:00:00Z', price_cents: 50000, fee_cents: 7500, customer_total_cents: 57500 },
    ],
    payments: [
      { id: 'p1', contract_id: 'c1', user_id: ME, amount_cents: 34500, amount_refunded_cents: 0, status: 'succeeded', created_at: '2026-10-03T09:00:00Z', version_fee_cents: 4500, version_total_cents: 34500 },
      { id: 'p2', contract_id: 'c1', user_id: ME, amount_cents: 1000, amount_refunded_cents: 0, status: 'failed', created_at: '2026-10-03T09:30:00Z', version_fee_cents: 4500, version_total_cents: 34500 },
    ],
    transfers: [
      { id: 't1', contract_id: 'c3', user_id: ME, amount_cents: 50000, amount_reversed_cents: 0, status: 'paid', created_at: '2026-10-08T12:00:00Z' },
      { id: 't2', contract_id: 'c3', user_id: ME, amount_cents: 2000, amount_reversed_cents: 0, status: 'pending', created_at: '2026-10-08T13:00:00Z' },
    ],
    deliveries: [
      { id: 'd1', contract_id: 'c1', user_id: ME, kind: 'download', status: 'succeeded', created_at: '2026-10-06T10:00:00Z' },
      { id: 'd2', contract_id: 'c1', user_id: ME, kind: 'push', status: 'failed', created_at: '2026-10-06T11:00:00Z' },
    ],
    reviews: [{ id: 'r1', contract_id: 'c3', subject_user_id: ME, overall: 5, created_at: '2026-10-09T10:00:00Z' }],
    ...over,
  };
}

describe('commissionFor', () => {
  it('is the version fee for the full checkout and the proportional share of a top-up', () => {
    expect(commissionFor(34500, 4500, 34500)).toBe(4500);
    expect(commissionFor(11500, 4500, 34500)).toBe(1500);
    expect(commissionFor(1, 4500, 34500)).toBe(0);
    expect(commissionFor(1000, 0, 0)).toBe(0);
  });
});

describe('buildGigsActivity', () => {
  const out = buildGigsActivity(input());

  it('summarises the customer side: posted jobs (not drafts), bids from others, contracts, deliveries, payments and commission', () => {
    expect(out.customer).toEqual({ jobsPosted: 1, bidsReceived: 2, contracts: 1, deliveries: 1, paymentsCents: 34500, commissionCents: 4500 });
  });

  it('summarises the provider side: bids, contracts won, paid-out transfers and reviews', () => {
    expect(out.provider).toEqual({ bidsPlaced: 1, contractsWon: 1, payoutsCents: 50000, reviews: 1 });
  });

  it('nets refunds and reversals out of the money totals', () => {
    const net = buildGigsActivity(
      input({
        payments: [{ id: 'p1', contract_id: 'c1', user_id: ME, amount_cents: 34500, amount_refunded_cents: 10000, status: 'partially_refunded', created_at: '2026-10-03T09:00:00Z', version_fee_cents: 4500, version_total_cents: 34500 }],
        transfers: [{ id: 't1', contract_id: 'c3', user_id: ME, amount_cents: 50000, amount_reversed_cents: 20000, status: 'partially_reversed', created_at: '2026-10-08T12:00:00Z' }],
      }),
    );
    expect(net.customer.paymentsCents).toBe(24500);
    expect(net.provider.payoutsCents).toBe(30000);
    const refunded = buildGigsActivity(input({ payments: [{ id: 'p1', contract_id: 'c1', user_id: ME, amount_cents: 34500, amount_refunded_cents: 34500, status: 'refunded', created_at: '2026-10-03T09:00:00Z', version_fee_cents: 4500, version_total_cents: 34500 }] }));
    expect(refunded.customer.paymentsCents).toBe(0);
    expect(refunded.customer.commissionCents).toBe(0);
  });

  it('lists every event newest first with role, kind, job title, money and status', () => {
    expect(out.ledger.map((e) => e.id)).toEqual([
      'review:r1', 'payout:t2', 'payout:t1', 'delivery:d2', 'delivery:d1', 'contract_won:c3', 'bid_placed:b3',
      'payment:p2', 'payment:p1', 'contract:c1', 'bid_received:b2', 'bid_received:b1', 'job_posted:j1',
    ]);
    const pay = out.ledger.find((e) => e.id === 'payment:p1')!;
    expect(pay).toEqual({ id: 'payment:p1', at: '2026-10-03T09:00:00.000Z', role: 'customer', kind: 'payment', jobTitle: 'CSV importer', amountCents: 34500, commissionCents: 4500, status: 'succeeded' });
    expect(out.ledger.find((e) => e.id === 'payment:p2')!.commissionCents).toBe(0);
    expect(out.ledger.find((e) => e.id === 'contract:c1')).toMatchObject({ role: 'customer', amountCents: 34500, commissionCents: 4500 });
    expect(out.ledger.find((e) => e.id === 'contract_won:c3')).toMatchObject({ role: 'provider', jobTitle: 'Webhook relay', amountCents: 50000, commissionCents: null });
    expect(out.ledger.find((e) => e.id === 'review:r1')).toMatchObject({ role: 'provider', amountCents: null, status: '5/5' });
    expect(out.ledger.find((e) => e.id === 'job_posted:j1')).toMatchObject({ role: 'customer', amountCents: null, status: 'in_progress' });
    expect(out.ledger.find((e) => e.id === 'bid_received:b1')).toMatchObject({ amountCents: 30000, commissionCents: null, status: 'accepted' });
  });

  it('never counts the user as both sides of their own bid, and labels unknown jobs', () => {
    const own = buildGigsActivity(input({ bids: [{ id: 'b9', job_id: 'j1', user_id: ME, price_cents: 100, status: 'active', created_at: '2026-10-02T10:00:00Z' }] }));
    expect(own.customer.bidsReceived).toBe(0);
    expect(own.provider.bidsPlaced).toBe(1);
    const orphan = buildGigsActivity(input({ transfers: [{ id: 't9', contract_id: 'c_missing', user_id: ME, amount_cents: 100, amount_reversed_cents: 0, status: 'paid', created_at: '2026-10-08T12:00:00Z' }] }));
    expect(orphan.ledger.find((e) => e.id === 'payout:t9')!.jobTitle).toBe('Unknown job');
  });

  it('ignores rows that belong to other users', () => {
    const foreign = buildGigsActivity(
      input({
        payments: [{ id: 'px', contract_id: 'c3', user_id: OTHER, amount_cents: 57500, amount_refunded_cents: 0, status: 'succeeded', created_at: '2026-10-05T09:00:00Z', version_fee_cents: 7500, version_total_cents: 57500 }],
        transfers: [{ id: 'tx', contract_id: 'c1', user_id: OTHER, amount_cents: 30000, amount_reversed_cents: 0, status: 'paid', created_at: '2026-10-07T09:00:00Z' }],
        reviews: [{ id: 'rx', contract_id: 'c1', subject_user_id: OTHER, overall: 2, created_at: '2026-10-09T10:00:00Z' }],
        deliveries: [{ id: 'dx', contract_id: 'c3', user_id: OTHER, kind: 'download', status: 'succeeded', created_at: '2026-10-06T10:00:00Z' }],
      }),
    );
    expect(foreign.customer.paymentsCents).toBe(0);
    expect(foreign.provider.payoutsCents).toBe(0);
    expect(foreign.provider.reviews).toBe(0);
    expect(foreign.customer.deliveries).toBe(0);
    expect(foreign.ledger.some((e) => e.id.endsWith('x'))).toBe(false);
  });

  it('orders same-instant events by id for a stable ledger', () => {
    const same = buildGigsActivity(
      input({
        jobs: [
          { id: 'ja', user_id: ME, title: 'A', status: 'open', created_at: '2026-10-01T09:00:00Z' },
          { id: 'jb', user_id: ME, title: 'B', status: 'open', created_at: '2026-10-01T09:00:00Z' },
        ],
        bids: [], contracts: [], payments: [], transfers: [], deliveries: [], reviews: [],
      }),
    );
    expect(same.ledger.map((e) => e.id)).toEqual(['job_posted:jb', 'job_posted:ja']);
  });
});

describe('filterLedger', () => {
  const { ledger } = buildGigsActivity(input());

  it('keeps everything with no filters', () => {
    expect(filterLedger(ledger, {})).toHaveLength(ledger.length);
    expect(filterLedger(ledger, { role: '', kind: '', from: '', to: '' })).toHaveLength(ledger.length);
  });

  it('filters by role and kind', () => {
    expect(filterLedger(ledger, { role: 'provider' }).every((e) => e.role === 'provider')).toBe(true);
    expect(filterLedger(ledger, { role: 'provider' })).toHaveLength(5);
    expect(filterLedger(ledger, { kind: 'payment' }).map((e) => e.id)).toEqual(['payment:p2', 'payment:p1']);
    expect(filterLedger(ledger, { role: 'provider', kind: 'payment' })).toEqual([]);
  });

  it('filters by an inclusive UTC date range', () => {
    const ids = filterLedger(ledger, { from: '2026-10-06', to: '2026-10-08' }).map((e) => e.id);
    expect(ids).toEqual(['payout:t2', 'payout:t1', 'delivery:d2', 'delivery:d1']);
    expect(filterLedger(ledger, { from: '2026-10-09' }).map((e) => e.id)).toEqual(['review:r1']);
    expect(filterLedger(ledger, { to: '2026-10-01' }).map((e) => e.id)).toEqual(['job_posted:j1']);
    // malformed dates are ignored rather than hiding everything
    expect(filterLedger(ledger, { from: 'yesterday' })).toHaveLength(ledger.length);
  });
});
