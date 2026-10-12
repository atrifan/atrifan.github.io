import { describe, expect, it } from 'vitest';
import { adminTotals, parseRange, rangeBounds, type AdminActivityInput } from '@/src/lib/activity/totals';

const NOW = new Date('2026-10-12T15:00:00Z');

describe('parseRange', () => {
  it('defaults to the last 30 days, today included', () => {
    expect(parseRange(null, null, NOW)).toEqual({ ok: true, range: { from: '2026-09-13', to: '2026-10-12' } });
    expect(parseRange('', '', NOW)).toEqual({ ok: true, range: { from: '2026-09-13', to: '2026-10-12' } });
  });
  it('takes explicit days and fills a missing side', () => {
    expect(parseRange('2026-10-01', '2026-10-05', NOW)).toEqual({ ok: true, range: { from: '2026-10-01', to: '2026-10-05' } });
    expect(parseRange('2026-10-01', null, NOW)).toEqual({ ok: true, range: { from: '2026-10-01', to: '2026-10-12' } });
    expect(parseRange(null, '2026-10-05', NOW)).toEqual({ ok: true, range: { from: '2026-09-06', to: '2026-10-05' } });
    expect(parseRange('2026-10-05', '2026-10-05', NOW).ok).toBe(true);
  });
  it('rejects malformed, impossible, inverted and over-long ranges', () => {
    expect(parseRange('10/01/2026', null, NOW)).toEqual({ ok: false, error: 'Dates must be YYYY-MM-DD' });
    expect(parseRange('2026-02-30', null, NOW)).toEqual({ ok: false, error: 'Dates must be YYYY-MM-DD' });
    expect(parseRange('2026-10-06', '2026-10-05', NOW)).toEqual({ ok: false, error: '"From" must be on or before "To"' });
    expect(parseRange('2025-01-01', '2026-10-05', NOW)).toEqual({ ok: false, error: 'The range can be at most 366 days' });
    expect(parseRange('2025-10-05', '2026-10-05', NOW).ok).toBe(true); // 366 days inclusive
  });
});

describe('rangeBounds', () => {
  it('covers whole UTC days: from 00:00 to the next midnight (exclusive)', () => {
    expect(rangeBounds({ from: '2026-10-01', to: '2026-10-05' })).toEqual({ start: '2026-10-01T00:00:00.000Z', end: '2026-10-06T00:00:00.000Z' });
  });
});

describe('adminTotals', () => {
  const input: AdminActivityInput = {
    installs: 7,
    publishes: 2,
    payments: [
      { amount_cents: 34500, amount_refunded_cents: 0, status: 'succeeded', fee_cents: 4500 },
      { amount_cents: 11500, amount_refunded_cents: 0, status: 'succeeded', fee_cents: 1500 },
      { amount_cents: 20000, amount_refunded_cents: 20000, status: 'refunded', fee_cents: 2600 },
      { amount_cents: 5000, amount_refunded_cents: 0, status: 'failed', fee_cents: 650 },
      { amount_cents: 5000, amount_refunded_cents: 0, status: 'pending', fee_cents: 650 },
      { amount_cents: 10000, amount_refunded_cents: 4000, status: 'partially_refunded', fee_cents: 1300 },
      { amount_cents: 10000, amount_refunded_cents: 0, status: 'disputed', fee_cents: 1300 },
    ],
    transfers: [
      { amount_cents: 30000, amount_reversed_cents: 0, status: 'paid' },
      { amount_cents: 10000, amount_reversed_cents: 2500, status: 'partially_reversed' },
      { amount_cents: 9000, amount_reversed_cents: 9000, status: 'reversed' },
      { amount_cents: 1000, amount_reversed_cents: 0, status: 'failed' },
      { amount_cents: 1000, amount_reversed_cents: 0, status: 'pending' },
    ],
    refunds: [
      { amount_cents: 20000, status: 'succeeded' },
      { amount_cents: 4000, status: 'succeeded' },
      { amount_cents: 999, status: 'failed' },
      { amount_cents: 500, status: 'pending' },
    ],
    disputes: 3,
  };

  it('sums collected payments, earned commission, paid-out transfers and refunds', () => {
    expect(adminTotals(input)).toEqual({
      installs: 7,
      publishes: 2,
      paymentsCount: 5,
      paymentsCents: 34500 + 11500 + 20000 + 10000 + 10000,
      commissionCents: 4500 + 1500 + 1300 + 1300,
      payoutsCount: 2,
      payoutsCents: 30000 + 7500,
      refundsCount: 2,
      refundsCents: 24000,
      disputes: 3,
    });
  });

  it('is all zeros for an empty range', () => {
    expect(adminTotals({ installs: 0, publishes: 0, payments: [], transfers: [], refunds: [], disputes: 0 })).toEqual({
      installs: 0, publishes: 0, paymentsCount: 0, paymentsCents: 0, commissionCents: 0, payoutsCount: 0, payoutsCents: 0, refundsCount: 0, refundsCents: 0, disputes: 0,
    });
  });
});
