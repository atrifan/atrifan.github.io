import { describe, expect, it } from 'vitest';
import {
  DisputeAmountError,
  planResolution,
  providerShareOfRefund,
  type MoneyState,
} from '@/src/lib/disputes/amounts';
import { claimWindowEndsAt, disputeEligibility } from '@/src/lib/disputes/policy';

// 300 EUR bid + 15% fee = 345 EUR paid.
const PAID: MoneyState = {
  customerPaidCents: 34500,
  alreadyRefundedCents: 0,
  bidCents: 30000,
  transferredCents: 0,
  alreadyReversedCents: 0,
};
const TRANSFERRED: MoneyState = { ...PAID, transferredCents: 30000 };

describe('planResolution: before the transfer', () => {
  it('release pays the provider the whole bid and refunds nothing', () => {
    expect(planResolution(PAID, 'release')).toEqual({
      outcome: 'release',
      refundCents: 0,
      transferCents: 30000,
      reversalCents: 0,
      providerNetCents: 30000,
      platformNetCents: 4500,
    });
  });

  it('full refund refunds everything that was paid, with no transfer', () => {
    expect(planResolution(PAID, 'full_refund')).toEqual({
      outcome: 'full_refund',
      refundCents: 34500,
      transferCents: 0,
      reversalCents: 0,
      providerNetCents: 0,
      platformNetCents: 0,
    });
  });

  it('partial refund splits the refund pro rata between provider and fee', () => {
    // 69 EUR of 345 refunded: 20%. Provider bears 20% of 300 = 60, fee bears 9.
    expect(planResolution(PAID, 'partial_refund', 6900)).toEqual({
      outcome: 'partial_refund',
      refundCents: 6900,
      transferCents: 24000,
      reversalCents: 0,
      providerNetCents: 24000,
      platformNetCents: 3600,
    });
  });

  it('a full refund only refunds what is still refundable', () => {
    const r = planResolution({ ...PAID, alreadyRefundedCents: 500 }, 'full_refund');
    expect(r.refundCents).toBe(34000);
    expect(r.platformNetCents).toBe(0);
  });
});

describe('planResolution: after the transfer', () => {
  it('full refund reverses the whole transfer and refunds the customer', () => {
    expect(planResolution(TRANSFERRED, 'full_refund')).toEqual({
      outcome: 'full_refund',
      refundCents: 34500,
      transferCents: 0,
      reversalCents: 30000,
      providerNetCents: 0,
      platformNetCents: 0,
    });
  });

  it('partial refund reverses only the provider share', () => {
    const r = planResolution(TRANSFERRED, 'partial_refund', 6900);
    expect(r).toEqual({
      outcome: 'partial_refund',
      refundCents: 6900,
      transferCents: 0,
      reversalCents: 6000,
      providerNetCents: 24000,
      platformNetCents: 3600,
    });
  });

  it('release after the transfer moves no money', () => {
    expect(planResolution(TRANSFERRED, 'release')).toEqual({
      outcome: 'release',
      refundCents: 0,
      transferCents: 0,
      reversalCents: 0,
      providerNetCents: 30000,
      platformNetCents: 4500,
    });
  });

  it('counts earlier reversals', () => {
    const r = planResolution({ ...TRANSFERRED, alreadyReversedCents: 1000 }, 'full_refund');
    expect(r.reversalCents).toBe(29000);
  });

  it('tops up a transfer that was partly reversed when releasing', () => {
    const r = planResolution({ ...TRANSFERRED, alreadyReversedCents: 1000 }, 'release');
    expect(r.transferCents).toBe(1000);
    expect(r.reversalCents).toBe(0);
  });
});

describe('providerShareOfRefund', () => {
  it('is the bid share of the refund, rounded half up', () => {
    expect(providerShareOfRefund(6900, 30000, 34500)).toBe(6000);
    // 1 cent of 345: 300/345 = 0.8695... -> 1
    expect(providerShareOfRefund(1, 30000, 34500)).toBe(1);
    // 3 cents of 4 paid on a bid of 2: 1.5 -> 2
    expect(providerShareOfRefund(3, 2, 4)).toBe(2);
    // 1 cent of 4 paid on a bid of 2: 0.5 -> 1
    expect(providerShareOfRefund(1, 2, 4)).toBe(1);
    // 1 cent of 5 paid on a bid of 2: 0.4 -> 0
    expect(providerShareOfRefund(1, 2, 5)).toBe(0);
  });

  it('never exceeds the bid', () => {
    expect(providerShareOfRefund(34500, 30000, 34500)).toBe(30000);
  });

  it('is zero when nothing was paid', () => {
    expect(providerShareOfRefund(100, 30000, 0)).toBe(0);
  });
});

describe('planResolution: validation', () => {
  const bad = (fn: () => unknown, code: string, message?: string) => {
    try {
      fn();
    } catch (err) {
      expect(err).toBeInstanceOf(DisputeAmountError);
      expect((err as DisputeAmountError).code).toBe(code);
      expect((err as Error).name).toBe('DisputeAmountError');
      if (message) expect((err as Error).message).toBe(message);
      return;
    }
    throw new Error('expected a DisputeAmountError');
  };

  it('a partial refund needs a whole positive amount below what is refundable', () => {
    bad(() => planResolution(PAID, 'partial_refund'), 'invalid_amount', 'A partial refund is a whole number of cents from 1 to 34499');
    bad(() => planResolution(PAID, 'partial_refund', 0), 'invalid_amount');
    bad(() => planResolution(PAID, 'partial_refund', -5), 'invalid_amount');
    bad(() => planResolution(PAID, 'partial_refund', 10.5), 'invalid_amount');
    bad(() => planResolution(PAID, 'partial_refund', 34500), 'invalid_amount');
    bad(() => planResolution({ ...PAID, alreadyRefundedCents: 500 }, 'partial_refund', 34000), 'invalid_amount');
    expect(planResolution(PAID, 'partial_refund', 34499).refundCents).toBe(34499);
    expect(planResolution(PAID, 'partial_refund', 1).refundCents).toBe(1);
  });

  it('rejects inconsistent money state', () => {
    bad(() => planResolution({ ...PAID, customerPaidCents: 0 }, 'release'), 'invalid_state', 'The bid is more than was paid');
    bad(() => planResolution({ ...PAID, bidCents: 40000 }, 'release'), 'invalid_state', 'The bid is more than was paid');
    bad(() => planResolution({ ...PAID, bidCents: 0 }, 'release'), 'invalid_state', 'Nothing was paid');
    bad(() => planResolution({ ...PAID, alreadyRefundedCents: 34501 }, 'release'), 'invalid_state', 'Refunded more than was paid');
    bad(() => planResolution({ ...PAID, alreadyRefundedCents: -1 }, 'release'), 'invalid_state', 'Amounts must be whole, non-negative cents');
    bad(() => planResolution({ ...PAID, transferredCents: -1 }, 'release'), 'invalid_state');
    bad(() => planResolution({ ...PAID, alreadyReversedCents: 1 }, 'release'), 'invalid_state', 'Reversed more than was transferred');
    bad(() => planResolution({ ...PAID, bidCents: 1.5 }, 'release'), 'invalid_state');
    bad(() => planResolution(PAID, 'nope' as never), 'invalid_outcome', 'Outcome must be release, partial_refund or full_refund');
  });

  it('a fully refunded payment cannot be refunded again', () => {
    bad(() => planResolution({ ...PAID, alreadyRefundedCents: 34500 }, 'full_refund'), 'nothing_to_refund', 'The payment was already refunded in full');
  });

  it('allows paid equal to the bid (no fee)', () => {
    expect(planResolution({ ...PAID, customerPaidCents: 30000 }, 'release').platformNetCents).toBe(0);
  });
});

describe('dispute policy', () => {
  const NOW = new Date('2026-10-12T10:00:00.000Z');
  const base = { hasOpenDispute: false, now: NOW, claimDays: 14, acceptedAt: null as string | null };

  it('the claim window is 14 days from acceptance', () => {
    expect(claimWindowEndsAt('2026-10-01T10:00:00.000Z', 14).toISOString()).toBe('2026-10-15T10:00:00.000Z');
  });

  it('before acceptance: open while active, in QA, rework or delivered', () => {
    for (const s of ['active', 'in_qa', 'rework', 'delivered', 'submitted'] as const) {
      expect(disputeEligibility({ ...base, contractStatus: s })).toEqual({ ok: true, phase: 'pre_accept' });
    }
  });

  it('after acceptance: open inside the claim window only', () => {
    const accepted = { ...base, contractStatus: 'completed' as const };
    expect(disputeEligibility({ ...accepted, acceptedAt: '2026-10-01T10:00:00.000Z' })).toEqual({ ok: true, phase: 'post_accept' });
    expect(disputeEligibility({ ...accepted, acceptedAt: '2026-09-28T10:00:00.001Z' })).toEqual({ ok: true, phase: 'post_accept' });
    expect(disputeEligibility({ ...accepted, acceptedAt: '2026-09-28T10:00:00.000Z' })).toEqual({ ok: false, reason: 'claim_window_closed' });
    expect(disputeEligibility({ ...accepted, acceptedAt: null })).toEqual({ ok: false, reason: 'claim_window_closed' });
  });

  it('never twice at the same time, and never on unpaid or closed contracts', () => {
    expect(disputeEligibility({ ...base, contractStatus: 'delivered', hasOpenDispute: true })).toEqual({ ok: false, reason: 'already_open' });
    expect(disputeEligibility({ ...base, contractStatus: 'disputed' })).toEqual({ ok: false, reason: 'already_open' });
    for (const s of ['pending_payment', 'cancelled', 'refunded'] as const) {
      expect(disputeEligibility({ ...base, contractStatus: s })).toEqual({ ok: false, reason: 'not_disputable' });
    }
  });
});
