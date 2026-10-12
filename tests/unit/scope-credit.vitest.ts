import { describe, expect, it } from 'vitest';
import { allocateSettlement, planCreditSettlement, ScopeCreditError } from '@/src/lib/disputes/scope-credit';

describe('planCreditSettlement', () => {
  it('nothing owed: the payout is untouched', () => {
    expect(planCreditSettlement({ creditCents: 0, paidCents: 34500, refundedCents: 0, payoutCents: 20000 })).toEqual({
      refundCents: 0,
      deductCents: 0,
      payoutCents: 20000,
      unsettledCents: 0,
    });
  });

  it('a 10000 price drop on a 30000 bid at 15%: the 11500 owed is refunded and the new bid is paid in full', () => {
    expect(planCreditSettlement({ creditCents: 11500, paidCents: 34500, refundedCents: 0, payoutCents: 20000 })).toEqual({
      refundCents: 11500,
      deductCents: 0,
      payoutCents: 20000,
      unsettledCents: 0,
    });
  });

  it('refunds only what the payments hold beyond the payout; the rest comes off the transfer', () => {
    // paid 34500, 10000 already refunded, payout 20000 → 4500 of headroom
    expect(planCreditSettlement({ creditCents: 6000, paidCents: 34500, refundedCents: 10000, payoutCents: 20000 })).toEqual({
      refundCents: 4500,
      deductCents: 1500,
      payoutCents: 18500,
      unsettledCents: 0,
    });
  });

  it('exactly the headroom is refunded, nothing is deducted', () => {
    expect(planCreditSettlement({ creditCents: 4500, paidCents: 34500, refundedCents: 10000, payoutCents: 20000 })).toEqual({
      refundCents: 4500,
      deductCents: 0,
      payoutCents: 20000,
      unsettledCents: 0,
    });
  });

  it('no headroom (a refund that failed again): everything comes off the transfer', () => {
    expect(planCreditSettlement({ creditCents: 3000, paidCents: 0, refundedCents: 0, payoutCents: 20000 })).toEqual({
      refundCents: 0,
      deductCents: 3000,
      payoutCents: 17000,
      unsettledCents: 0,
    });
  });

  it('owed more than the transfer and the headroom: the payout goes to zero and the rest stays owed', () => {
    expect(planCreditSettlement({ creditCents: 25000, paidCents: 21000, refundedCents: 0, payoutCents: 20000 })).toEqual({
      refundCents: 1000,
      deductCents: 20000,
      payoutCents: 0,
      unsettledCents: 4000,
    });
  });

  it('refunds over-refunded payments never go negative', () => {
    expect(planCreditSettlement({ creditCents: 500, paidCents: 20000, refundedCents: 0, payoutCents: 20000 })).toEqual({
      refundCents: 0,
      deductCents: 500,
      payoutCents: 19500,
      unsettledCents: 0,
    });
    expect(planCreditSettlement({ creditCents: 500, paidCents: 20000, refundedCents: 1000, payoutCents: 20000 }).refundCents).toBe(0);
  });

  it('the amounts always add up', () => {
    for (const [credit, paid, refunded, payout] of [
      [1, 1, 0, 0],
      [7777, 34500, 123, 29999],
      [100000, 50000, 0, 40000],
      [1, 0, 0, 1],
    ]) {
      const s = planCreditSettlement({ creditCents: credit, paidCents: paid, refundedCents: refunded, payoutCents: payout });
      expect(s.refundCents + s.deductCents + s.unsettledCents).toBe(credit);
      expect(s.payoutCents).toBe(payout - s.deductCents);
      expect(s.payoutCents).toBeGreaterThanOrEqual(0);
    }
  });

  it.each([
    { creditCents: -1, paidCents: 0, refundedCents: 0, payoutCents: 0 },
    { creditCents: 1.5, paidCents: 0, refundedCents: 0, payoutCents: 0 },
    { creditCents: 0, paidCents: -1, refundedCents: 0, payoutCents: 0 },
    { creditCents: 0, paidCents: 0, refundedCents: -1, payoutCents: 0 },
    { creditCents: 0, paidCents: 0, refundedCents: 0, payoutCents: -1 },
    { creditCents: 0, paidCents: 0, refundedCents: 0, payoutCents: Number.NaN },
  ])('rejects amounts that are not whole non-negative cents: %o', (input) => {
    expect(() => planCreditSettlement(input)).toThrow(ScopeCreditError);
  });
});

describe('allocateSettlement', () => {
  const owed = [
    { id: 'a', creditCents: 3000 },
    { id: 'b', creditCents: 2000 },
  ];

  it('marks each owed credit settled, oldest first, refunds before deductions', () => {
    expect(allocateSettlement(owed, { refundCents: 4000, deductCents: 1000 })).toEqual([
      { id: 'a', refundCents: 3000, deductCents: 0, remainingCents: 0 },
      { id: 'b', refundCents: 1000, deductCents: 1000, remainingCents: 0 },
    ]);
  });

  it('a partial settlement leaves the rest owed on the later credits', () => {
    expect(allocateSettlement(owed, { refundCents: 0, deductCents: 3500 })).toEqual([
      { id: 'a', refundCents: 0, deductCents: 3000, remainingCents: 0 },
      { id: 'b', refundCents: 0, deductCents: 500, remainingCents: 1500 },
    ]);
  });

  it('nothing settled: every credit stays owed', () => {
    expect(allocateSettlement(owed, { refundCents: 0, deductCents: 0 })).toEqual([
      { id: 'a', refundCents: 0, deductCents: 0, remainingCents: 3000 },
      { id: 'b', refundCents: 0, deductCents: 0, remainingCents: 2000 },
    ]);
  });

  it('rejects a settlement larger than what is owed', () => {
    expect(() => allocateSettlement(owed, { refundCents: 5000, deductCents: 1 })).toThrow(ScopeCreditError);
    expect(() => allocateSettlement(owed, { refundCents: -1, deductCents: 0 })).toThrow(ScopeCreditError);
    expect(() => allocateSettlement([{ id: 'x', creditCents: -5 }], { refundCents: 0, deductCents: 0 })).toThrow(ScopeCreditError);
  });
});
