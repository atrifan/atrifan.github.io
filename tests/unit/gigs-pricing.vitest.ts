import { describe, expect, it } from 'vitest';
import { percentFromBps, priceBreakdown } from '@/src/lib/jobs/client/pricing';
import { normalizeQaChecks, qaOptions, qaReserveCredits, qaStorageKey, parseStoredQaChecks } from '@/src/lib/jobs/client/qa-checks';
import { sortBids } from '@/src/lib/jobs/client/bids-sort';
import { DEFAULT_QA_COSTS } from '@/src/config/qa.config';

describe('percentFromBps', () => {
  it('formats basis points as a short percent', () => {
    expect(percentFromBps(1500)).toBe('15%');
    expect(percentFromBps(1250)).toBe('12.5%');
    expect(percentFromBps(1234)).toBe('12.34%');
    expect(percentFromBps(0)).toBe('0%');
    expect(percentFromBps(10000)).toBe('100%');
    expect(percentFromBps(5)).toBe('0.05%');
  });
});

describe('priceBreakdown', () => {
  it('shows what the provider receives and the customer pays (commission on top)', () => {
    expect(priceBreakdown(30000, 1500)).toEqual({
      receiveCents: 30000,
      feeCents: 4500,
      totalCents: 34500,
      receive: '€300',
      fee: '€45',
      total: '€345',
      percent: '15%',
    });
  });

  it('rounds the fee half-up like the server', () => {
    const b = priceBreakdown(15000, 1500)!;
    expect([b.fee, b.total]).toEqual(['€22.50', '€172.50']);
    expect(priceBreakdown(10, 1500)!.feeCents).toBe(2);
    expect(priceBreakdown(7, 1500)!.feeCents).toBe(1);
  });

  it('has no breakdown without a positive whole-cent price', () => {
    expect(priceBreakdown(null, 1500)).toBeNull();
    expect(priceBreakdown(Number.NaN, 1500)).toBeNull();
    expect(priceBreakdown(0, 1500)).toBeNull();
    expect(priceBreakdown(-100, 1500)).toBeNull();
    expect(priceBreakdown(10.5, 1500)).toBeNull();
  });

  it('works at 0% commission', () => {
    expect(priceBreakdown(500, 0)).toMatchObject({ fee: '€0', total: '€5', percent: '0%' });
  });

  it('returns null for an invalid commission instead of throwing', () => {
    expect(priceBreakdown(500, -1)).toBeNull();
    expect(priceBreakdown(Number.MAX_SAFE_INTEGER, 1500)).toBeNull();
  });
});

describe('QA checks', () => {
  it('lists every check in order, basic included, with its credit cap', () => {
    expect(qaOptions(DEFAULT_QA_COSTS)).toEqual([
      { id: 'basic', label: 'Basic QA', credits: 60, included: true },
      { id: 'deep_requirements', label: 'Deep requirements review', credits: 150, included: false },
      { id: 'code_review', label: 'Code review', credits: 300, included: false },
      { id: 'security', label: 'Security review', credits: 450, included: false },
      { id: 'journey', label: 'User journey test', credits: 600, included: false },
      { id: 'adversarial', label: 'Adversarial testing', credits: 900, included: false },
    ]);
  });

  it('normalises a choice: basic first, canonical order, no duplicates or unknowns', () => {
    expect(normalizeQaChecks([])).toEqual(['basic']);
    expect(normalizeQaChecks(['security', 'code_review', 'security', 'nope', 'basic'])).toEqual(['basic', 'code_review', 'security']);
    expect(normalizeQaChecks('code_review')).toEqual(['basic']);
    expect(normalizeQaChecks(null)).toEqual(['basic']);
    expect(normalizeQaChecks([1, 'adversarial'])).toEqual(['basic', 'adversarial']);
  });

  it('reserves credits for the paid checks only (basic comes out of the commission)', () => {
    expect(qaReserveCredits(['basic'], DEFAULT_QA_COSTS)).toBe(0);
    expect(qaReserveCredits(['basic', 'code_review', 'security'], DEFAULT_QA_COSTS)).toBe(750);
    expect(qaReserveCredits(['code_review', 'code_review'], DEFAULT_QA_COSTS)).toBe(300);
  });

  it('stores the choice per job', () => {
    expect(qaStorageKey('abc')).toBe('tulzo.gigs.qa.abc');
    expect(parseStoredQaChecks('["code_review","basic"]')).toEqual(['basic', 'code_review']);
    expect(parseStoredQaChecks(null)).toEqual(['basic']);
    expect(parseStoredQaChecks('not json')).toEqual(['basic']);
    expect(parseStoredQaChecks('{"a":1}')).toEqual(['basic']);
  });
});

describe('sortBids', () => {
  const bids = [
    { id: 'a', price_cents: 50000, eta_days: 3, trust_score: null, created_at: '2026-10-01T00:00:00Z' },
    { id: 'b', price_cents: 30000, eta_days: 10, trust_score: 0.9, created_at: '2026-10-02T00:00:00Z' },
    { id: 'c', price_cents: 30000, eta_days: 5, trust_score: 0.4, created_at: '2026-10-03T00:00:00Z' },
    { id: 'd', price_cents: 40000, eta_days: 3, trust_score: null, created_at: '2026-10-04T00:00:00Z' },
  ];
  const ids = (list: typeof bids) => list.map((b) => b.id);

  it('sorts by lowest price, then faster delivery', () => {
    expect(ids(sortBids(bids, 'price'))).toEqual(['c', 'b', 'd', 'a']);
  });

  it('sorts by fastest delivery, then lower price', () => {
    expect(ids(sortBids(bids, 'delivery'))).toEqual(['d', 'a', 'c', 'b']);
  });

  it('sorts by trust (unknown last), then price', () => {
    expect(ids(sortBids(bids, 'trust'))).toEqual(['b', 'c', 'd', 'a']);
  });

  it('keeps the earliest bid first on a full tie and does not mutate the input', () => {
    const tie = [
      { id: 'x', price_cents: 100, eta_days: 1, trust_score: null, created_at: '2026-10-02T00:00:00Z' },
      { id: 'y', price_cents: 100, eta_days: 1, trust_score: null, created_at: '2026-10-01T00:00:00Z' },
    ];
    expect(sortBids(tie, 'price').map((b) => b.id)).toEqual(['y', 'x']);
    expect(sortBids(tie, 'trust').map((b) => b.id)).toEqual(['y', 'x']);
    expect(tie.map((b) => b.id)).toEqual(['x', 'y']);
  });
});
