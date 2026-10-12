import { describe, expect, it } from 'vitest';
import {
  CREDIT_MARKUP,
  PLAN_CATALOG,
  REFERENCE_MODELS,
  formatTokenCount,
  outputTokensForCredits,
  planInfo,
} from '@/src/lib/plan-catalog';

describe('PLAN_CATALOG', () => {
  it('matches the decided plans: price, annual price and monthly credits', () => {
    expect(PLAN_CATALOG.map((p) => [p.key, p.name, p.monthlyUsd, p.annualUsd, p.monthlyCredits])).toEqual([
      ['free', 'Free', 0, null, 0],
      ['pro', 'Pro', 10, 100.08, 1000],
      ['plus', 'Plus', 25, 250.08, 2800],
      ['super', 'Super', 60, 600, 7000],
    ]);
  });

  it('every plan lists extras', () => {
    for (const p of PLAN_CATALOG) expect(p.extras.length).toBeGreaterThan(0);
  });

  it('planInfo finds a plan and falls back to free', () => {
    expect(planInfo('plus').monthlyCredits).toBe(2800);
    expect(planInfo('super').name).toBe('Super');
    expect(planInfo('nope' as never).key).toBe('free');
  });
});

describe('what credits buy', () => {
  it('uses the 1.3x markup and reference output prices', () => {
    expect(CREDIT_MARKUP).toBe(1.3);
    expect(REFERENCE_MODELS.opus).toMatchObject({ name: 'Opus 5.5', outputPer1M: 20 });
    expect(REFERENCE_MODELS.sonnet).toMatchObject({ name: 'Sonnet 5.5', outputPer1M: 10 });
  });

  it('1,000 credits buy about 385K Opus or 769K Sonnet output tokens', () => {
    expect(outputTokensForCredits(1000, REFERENCE_MODELS.opus)).toBe(384_615);
    expect(outputTokensForCredits(1000, REFERENCE_MODELS.sonnet)).toBe(769_230);
    expect(outputTokensForCredits(0, REFERENCE_MODELS.opus)).toBe(0);
  });

  it('respects custom credit value and markup', () => {
    expect(outputTokensForCredits(1000, REFERENCE_MODELS.sonnet, { creditValueUsd: 0.02, markup: 1 })).toBe(2_000_000);
  });

  it('formats token counts', () => {
    expect(formatTokenCount(384_615)).toBe('385K');
    expect(formatTokenCount(769_230)).toBe('769K');
    expect(formatTokenCount(2_000_000)).toBe('2M');
    expect(formatTokenCount(1_250_000)).toBe('1.3M');
    expect(formatTokenCount(999)).toBe('999');
    expect(formatTokenCount(1000)).toBe('1K');
    expect(formatTokenCount(1_000_000)).toBe('1M');
    expect(formatTokenCount(999_999)).toBe('1M');
    expect(formatTokenCount(999_499)).toBe('999K');
    expect(formatTokenCount(999_500)).toBe('1M');
  });
});
