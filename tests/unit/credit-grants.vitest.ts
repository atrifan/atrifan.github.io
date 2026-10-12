import { describe, expect, it } from 'vitest';
import {
  expiringCredits,
  grantRemainingCredits,
  monthlyCreditsFor,
  monthlyPeriod,
  periodAnchorFromSubscription,
  planGrant,
  timestampToDate,
} from '@/src/lib/credits/grants';

describe('monthlyCreditsFor', () => {
  it('matches the plan table: Free 0, Pro 1,000, Plus 2,800, Super 7,000', () => {
    expect(monthlyCreditsFor('free')).toBe(0);
    expect(monthlyCreditsFor('pro')).toBe(1000);
    expect(monthlyCreditsFor('plus')).toBe(2800);
    expect(monthlyCreditsFor('super')).toBe(7000);
  });
});

describe('monthlyPeriod', () => {
  const anchor = new Date('2026-01-15T08:30:00.000Z');

  it('is the monthly cycle containing now, anchored on the subscription day', () => {
    expect(monthlyPeriod(anchor, new Date('2026-10-20T00:00:00.000Z'))).toEqual({
      key: '2026-10-15',
      start: '2026-10-15T08:30:00.000Z',
      end: '2026-11-15T08:30:00.000Z',
    });
  });

  it('before this month’s anchor, the cycle started last month', () => {
    expect(monthlyPeriod(anchor, new Date('2026-10-15T08:29:59.999Z')).key).toBe('2026-09-15');
    expect(monthlyPeriod(anchor, new Date('2026-10-15T08:30:00.000Z')).key).toBe('2026-10-15');
  });

  it('crosses the year boundary', () => {
    expect(monthlyPeriod(anchor, new Date('2027-01-02T00:00:00.000Z'))).toEqual({
      key: '2026-12-15',
      start: '2026-12-15T08:30:00.000Z',
      end: '2027-01-15T08:30:00.000Z',
    });
  });

  it('clamps day 31 to short months', () => {
    const end31 = new Date('2026-01-31T00:00:00.000Z');
    expect(monthlyPeriod(end31, new Date('2026-02-28T12:00:00.000Z'))).toEqual({
      key: '2026-02-28',
      start: '2026-02-28T00:00:00.000Z',
      end: '2026-03-31T00:00:00.000Z',
    });
    expect(monthlyPeriod(end31, new Date('2026-04-30T00:00:00.000Z')).key).toBe('2026-04-30');
    expect(monthlyPeriod(end31, new Date('2026-04-29T23:59:59.000Z')).key).toBe('2026-03-31');
    expect(monthlyPeriod(end31, new Date('2028-02-29T01:00:00.000Z')).key).toBe('2028-02-29');
  });

  it('the anchor itself starts the first period', () => {
    expect(monthlyPeriod(anchor, anchor).key).toBe('2026-01-15');
  });

  it('a "now" before the anchor uses the anchor period', () => {
    expect(monthlyPeriod(anchor, new Date('2025-12-01T00:00:00.000Z')).key).toBe('2026-01-15');
  });
});

describe('timestamps from Clerk', () => {
  it('accepts seconds or milliseconds', () => {
    expect(timestampToDate(1760000000)?.toISOString()).toBe('2025-10-09T08:53:20.000Z');
    expect(timestampToDate(1760000000000)?.toISOString()).toBe('2025-10-09T08:53:20.000Z');
    expect(timestampToDate('2025-10-09T08:53:20.000Z')?.toISOString()).toBe('2025-10-09T08:53:20.000Z');
    expect(timestampToDate(null)).toBeNull();
    expect(timestampToDate(0)).toBeNull();
    expect(timestampToDate('nope')).toBeNull();
    expect(timestampToDate(Number.NaN)).toBeNull();
  });

  it('reads the anchor from the active item, then the subscription', () => {
    expect(
      periodAnchorFromSubscription({
        items: [
          { status: 'ended', period_start: 1000000000000 },
          { status: 'active', period_start: 1760000000000 },
        ],
        current_period_start: 1500000000,
      })?.toISOString(),
    ).toBe('2025-10-09T08:53:20.000Z');
    expect(periodAnchorFromSubscription({ current_period_start: 1760000000 })?.toISOString()).toBe('2025-10-09T08:53:20.000Z');
    expect(periodAnchorFromSubscription({ created_at: 1760000000000 })?.toISOString()).toBe('2025-10-09T08:53:20.000Z');
    expect(periodAnchorFromSubscription({})).toBeNull();
    expect(periodAnchorFromSubscription(null)).toBeNull();
  });
});

describe('grant remainder: monthly credits are spent first', () => {
  it('nothing spent: the whole grant is left', () => {
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1500, inflowCreditsSinceGrant: 0, balanceNowCredits: 1500 })).toBe(1000);
  });

  it('spending eats the grant before bought credits', () => {
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1500, inflowCreditsSinceGrant: 0, balanceNowCredits: 1200 })).toBe(700);
  });

  it('bought credits since the grant are not counted as grant', () => {
    // spent 300, bought 500: grant left 700, balance 1700 = 700 grant + 1000 bought
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1500, inflowCreditsSinceGrant: 500, balanceNowCredits: 1700 })).toBe(700);
  });

  it('is never negative and never above the grant or the balance', () => {
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1500, inflowCreditsSinceGrant: 0, balanceNowCredits: 100 })).toBe(0);
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1000, inflowCreditsSinceGrant: 0, balanceNowCredits: 1200 })).toBe(1000);
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1000, inflowCreditsSinceGrant: 900, balanceNowCredits: 400 })).toBe(0);
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1000, inflowCreditsSinceGrant: 0, balanceNowCredits: 600 })).toBe(600);
  });

  it('a balance drop below the grant leaves just the balance', () => {
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1000, inflowCreditsSinceGrant: 0, balanceNowCredits: 0 })).toBe(0);
  });

  it('rounds to hundredths of a credit', () => {
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1000, inflowCreditsSinceGrant: 0, balanceNowCredits: 999.996 })).toBe(1000);
    expect(grantRemainingCredits({ grantCredits: 1000, balanceAfterGrantCredits: 1000, inflowCreditsSinceGrant: 0, balanceNowCredits: 333.333 })).toBe(333.33);
  });

  it('expiringCredits is the unused remainder of an unexpired grant', () => {
    const g = { grantCredits: 1000, balanceAfterGrantCredits: 1500, inflowCreditsSinceGrant: 0, balanceNowCredits: 1200 };
    expect(expiringCredits(g)).toBe(700);
    expect(expiringCredits({ ...g, alreadyExpired: true })).toBe(0);
  });
});

describe('planGrant', () => {
  it('first grant: adds the plan credits, nothing expires', () => {
    expect(planGrant({ plan: 'pro', balanceNowCredits: 500, previous: null })).toEqual({
      grantCredits: 1000,
      expireCredits: 0,
      balanceAfterCredits: 1500,
    });
  });

  it('renewal: expires the unused part of last month first, keeps bought credits', () => {
    // last grant 1000 on top of 500 bought; spent 300 since -> 700 of the grant expires
    expect(
      planGrant({
        plan: 'pro',
        balanceNowCredits: 1200,
        previous: { grantCredits: 1000, balanceAfterGrantCredits: 1500, inflowCreditsSinceGrant: 0 },
      }),
    ).toEqual({ grantCredits: 1000, expireCredits: 700, balanceAfterCredits: 1500 });
  });

  it('an already expired previous grant expires nothing more', () => {
    expect(
      planGrant({
        plan: 'plus',
        balanceNowCredits: 500,
        previous: { grantCredits: 1000, balanceAfterGrantCredits: 1500, inflowCreditsSinceGrant: 0, alreadyExpired: true },
      }),
    ).toEqual({ grantCredits: 2800, expireCredits: 0, balanceAfterCredits: 3300 });
  });

  it('free plan grants nothing (but still expires last month)', () => {
    expect(
      planGrant({
        plan: 'free',
        balanceNowCredits: 1000,
        previous: { grantCredits: 1000, balanceAfterGrantCredits: 1000, inflowCreditsSinceGrant: 0 },
      }),
    ).toEqual({ grantCredits: 0, expireCredits: 1000, balanceAfterCredits: 0 });
  });
});
