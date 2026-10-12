import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRUST_CONFIG,
  computeTrustScore,
  contractSignals,
  decayWeight,
  isSelfDealing,
  pairFactor,
  posterior,
  ratingValue,
  reviewerWeight,
  type TrustContract,
  type TrustReview,
} from '@/src/lib/trust/trust-score';

const NOW = new Date('2026-10-12T00:00:00.000Z');
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

let n = 0;
function contract(over: Partial<TrustContract> = {}): TrustContract {
  n += 1;
  return {
    contractId: `c${n}`,
    customerUserId: `cust${n}`,
    providerUserId: 'prov',
    paid: true,
    outcome: 'accepted',
    closedAt: NOW.toISOString(),
    qaAttempts: ['validated'],
    disputed: false,
    disputeLost: false,
    deadline: '2026-10-10T00:00:00.000Z',
    deliveredAt: '2026-10-09T00:00:00.000Z',
    initialPriceCents: 30000,
    finalPriceCents: 30000,
    customerFingerprints: [],
    providerFingerprints: [],
    ...over,
  };
}

function review(c: TrustContract, over: Partial<TrustReview> = {}): TrustReview {
  return {
    contractId: c.contractId,
    reviewerUserId: c.customerUserId,
    overall: 5,
    quality: 5,
    communication: 5,
    timeliness: 5,
    createdAt: NOW.toISOString(),
    reviewerSpendCents: 100_000,
    reviewerAccountCreatedAt: daysAgo(400),
    reviewerFirstPaymentAt: daysAgo(400),
    ...over,
  };
}

const comp = (s: ReturnType<typeof computeTrustScore>, key: string) => s.components.find((c) => c.key === key)!;

describe('building blocks', () => {
  it('decay halves every 180 days and never grows', () => {
    expect(DEFAULT_TRUST_CONFIG.halfLifeDays).toBe(180);
    expect(decayWeight(NOW.toISOString(), NOW)).toBe(1);
    expect(decayWeight(daysAgo(180), NOW)).toBeCloseTo(0.5, 10);
    expect(decayWeight(daysAgo(360), NOW)).toBeCloseTo(0.25, 10);
    expect(decayWeight(new Date(NOW.getTime() + 10 * DAY).toISOString(), NOW)).toBe(1);
    expect(decayWeight('garbage', NOW)).toBe(0);
  });

  it('repeat pairs count less and less: 1, 0.5, 0.25', () => {
    expect([0, 1, 2, 3].map((k) => pairFactor(k))).toEqual([1, 0.5, 0.25, 0.125]);
  });

  it('posterior blends the prior with the evidence', () => {
    expect(posterior(0.6, 3, 0, 0)).toBe(0.6);
    expect(posterior(0.6, 3, 1, 1)).toBeCloseTo(0.7, 10);
    expect(posterior(0.6, 3, 0, 1)).toBeCloseTo(0.45, 10);
    expect(posterior(0.5, 0, 0, 0)).toBe(0.5);
  });

  it('a rating maps 1..5 to 0..1, weighted 40/30/15/15', () => {
    expect(ratingValue({ overall: 5, quality: 5, communication: 5, timeliness: 5 })).toBe(1);
    expect(ratingValue({ overall: 1, quality: 1, communication: 1, timeliness: 1 })).toBe(0);
    expect(ratingValue({ overall: 5, quality: 1, communication: 1, timeliness: 1 })).toBeCloseTo(0.4, 10);
    expect(ratingValue({ overall: 1, quality: 5, communication: 1, timeliness: 1 })).toBeCloseTo(0.3, 10);
    expect(ratingValue({ overall: 1, quality: 1, communication: 5, timeliness: 1 })).toBeCloseTo(0.15, 10);
    expect(ratingValue({ overall: 1, quality: 1, communication: 1, timeliness: 5 })).toBeCloseTo(0.15, 10);
  });

  it('reviewer weight grows with spend and account/payment age', () => {
    const base = { reviewerAccountCreatedAt: daysAgo(400), reviewerFirstPaymentAt: daysAgo(400) };
    expect(reviewerWeight({ ...base, reviewerSpendCents: 100_000 }, NOW)).toBe(1);
    expect(reviewerWeight({ ...base, reviewerSpendCents: 500_000 }, NOW)).toBe(1);
    expect(reviewerWeight({ ...base, reviewerSpendCents: 0 }, NOW)).toBeCloseTo(0.2, 10);
    // EUR 99 spent: 0.2 + 0.8 * log10(100) / log10(1001)
    expect(reviewerWeight({ ...base, reviewerSpendCents: 9_900 }, NOW)).toBeCloseTo(0.2 + (0.8 * 2) / Math.log10(1001), 10);
    // age: the younger of account and first payment, over 90 days, floor 0.1
    expect(reviewerWeight({ reviewerSpendCents: 100_000, reviewerAccountCreatedAt: daysAgo(400), reviewerFirstPaymentAt: daysAgo(45) }, NOW)).toBeCloseTo(0.5, 10);
    expect(reviewerWeight({ reviewerSpendCents: 100_000, reviewerAccountCreatedAt: daysAgo(30), reviewerFirstPaymentAt: daysAgo(400) }, NOW)).toBeCloseTo(1 / 3, 10);
    expect(reviewerWeight({ reviewerSpendCents: 100_000, reviewerAccountCreatedAt: daysAgo(1), reviewerFirstPaymentAt: daysAgo(1) }, NOW)).toBeCloseTo(0.1, 10);
    expect(reviewerWeight({ reviewerSpendCents: 100_000, reviewerAccountCreatedAt: null, reviewerFirstPaymentAt: daysAgo(400) }, NOW)).toBeCloseTo(0.1, 10);
    expect(reviewerWeight({ reviewerSpendCents: 100_000, reviewerAccountCreatedAt: daysAgo(400), reviewerFirstPaymentAt: null }, NOW)).toBeCloseTo(0.1, 10);
  });

  it('self-dealing: same user, or a shared Stripe fingerprint', () => {
    expect(isSelfDealing(contract())).toBe(false);
    expect(isSelfDealing(contract({ customerUserId: 'prov' }))).toBe(true);
    expect(isSelfDealing(contract({ customerFingerprints: ['card:abc', 'email:a@x'], providerFingerprints: ['email:a@x'] }))).toBe(true);
    expect(isSelfDealing(contract({ customerFingerprints: ['card:abc'], providerFingerprints: ['card:def'] }))).toBe(false);
    expect(isSelfDealing(contract({ customerFingerprints: ['EMAIL:A@X'], providerFingerprints: ['email:a@x'] }))).toBe(true);
    expect(isSelfDealing(contract({ customerFingerprints: [''], providerFingerprints: [''] }))).toBe(false);
  });
});

describe('contract signals', () => {
  it('a clean contract is good on every signal', () => {
    expect(contractSignals(contract())).toEqual({ firstPass: 1, severity: 1, dispute: 1, deadline: 1, price: 1 });
  });

  it('QA: first pass and failure severity', () => {
    expect(contractSignals(contract({ qaAttempts: ['requires_changes', 'validated'] }))).toMatchObject({ firstPass: 0, severity: 0.66 });
    expect(contractSignals(contract({ qaAttempts: ['requires_changes', 'requires_changes', 'validated'] }))).toMatchObject({ severity: 0.32 });
    expect(contractSignals(contract({ qaAttempts: ['requires_changes', 'requires_changes', 'requires_changes', 'validated'] }))).toMatchObject({ severity: 0 });
    expect(contractSignals(contract({ qaAttempts: ['rejected'] }))).toMatchObject({ firstPass: 0, severity: 0 });
    expect(contractSignals(contract({ qaAttempts: [] }))).toMatchObject({ firstPass: null, severity: null });
  });

  it('disputes: none 1, won 0.5, lost 0', () => {
    expect(contractSignals(contract({ disputed: true })).dispute).toBe(0.5);
    expect(contractSignals(contract({ disputed: true, disputeLost: true })).dispute).toBe(0);
  });

  it('deadline: on time 1, then minus 1/7 per late day', () => {
    expect(contractSignals(contract({ deliveredAt: '2026-10-10T00:00:00.000Z' })).deadline).toBe(1);
    expect(contractSignals(contract({ deliveredAt: '2026-10-11T00:00:00.000Z' })).deadline).toBeCloseTo(6 / 7, 10);
    expect(contractSignals(contract({ deliveredAt: '2026-10-17T00:00:00.000Z' })).deadline).toBe(0);
    expect(contractSignals(contract({ deliveredAt: '2026-10-30T00:00:00.000Z' })).deadline).toBe(0);
    expect(contractSignals(contract({ deadline: null })).deadline).toBeNull();
    expect(contractSignals(contract({ deliveredAt: null })).deadline).toBeNull();
  });

  it('price accuracy: at or under the bid 1, then minus 2x the overrun', () => {
    expect(contractSignals(contract({ finalPriceCents: 25000 })).price).toBe(1);
    expect(contractSignals(contract({ finalPriceCents: 33000 })).price).toBeCloseTo(0.8, 10);
    expect(contractSignals(contract({ finalPriceCents: 45000 })).price).toBe(0);
    expect(contractSignals(contract({ finalPriceCents: 60000 })).price).toBe(0);
    expect(contractSignals(contract({ initialPriceCents: 0 })).price).toBeNull();
  });
});

describe('computeTrustScore', () => {
  it('no history: the prior, labelled new', () => {
    const s = computeTrustScore({ contracts: [], reviews: [], now: NOW });
    expect(s.score).toBe(74);
    expect(s.level).toBe('new');
    expect(s.counted).toBe(0);
    expect(s.reviewCount).toBe(0);
    expect(s.averageRating).toBeNull();
    expect(s.components.map((c) => [c.key, c.weight])).toEqual([
      ['qa_first_pass', 0.25],
      ['qa_severity', 0.15],
      ['disputes', 0.2],
      ['deadline', 0.15],
      ['price_accuracy', 0.1],
      ['reviews', 0.15],
    ]);
    expect(comp(s, 'qa_first_pass').value).toBe(0.6);
    expect(comp(s, 'reviews').value).toBe(0.625);
    for (const c of s.components) expect(c.evidence).toBe(0);
  });

  it('one clean, five-star contract: the exact blend', () => {
    const c = contract();
    const s = computeTrustScore({ contracts: [c], reviews: [review(c)], now: NOW });
    expect(comp(s, 'qa_first_pass').value).toBeCloseTo(0.7, 10);
    expect(comp(s, 'qa_severity').value).toBeCloseTo(0.85, 10);
    expect(comp(s, 'disputes').value).toBeCloseTo(0.8875, 10);
    expect(comp(s, 'deadline').value).toBeCloseTo(0.85, 10);
    expect(comp(s, 'price_accuracy').value).toBeCloseTo(0.8875, 10);
    expect(comp(s, 'reviews').value).toBeCloseTo(0.71875, 10);
    expect(comp(s, 'qa_first_pass').evidence).toBe(1);
    expect(s.score).toBe(80);
    expect(s.level).toBe('building');
    expect(s.counted).toBe(1);
    expect(s.reviewCount).toBe(1);
    expect(s.averageRating).toBe(5);
  });

  it('more clean history moves the score further from the prior', () => {
    const one = [contract()];
    const ten = Array.from({ length: 10 }, () => contract());
    const s1 = computeTrustScore({ contracts: one, reviews: [], now: NOW });
    const s10 = computeTrustScore({ contracts: ten, reviews: [], now: NOW });
    expect(s10.score).toBeGreaterThan(s1.score);
    expect(s10.level).toBe('established');
  });

  it('a rejected QA and a lost dispute pull the score down', () => {
    const good = computeTrustScore({ contracts: [contract(), contract()], reviews: [], now: NOW });
    const bad = computeTrustScore({
      contracts: [contract(), contract({ qaAttempts: ['rejected'], disputed: true, disputeLost: true, outcome: 'resolved' })],
      reviews: [],
      now: NOW,
    });
    expect(bad.score).toBeLessThan(good.score);
    expect(comp(bad, 'qa_first_pass').value).toBeCloseTo((0.6 * 3 + 1) / 5, 10);
    expect(comp(bad, 'disputes').value).toBeCloseTo((0.85 * 3 + 1) / 5, 10);
  });

  it('only paid, accepted or resolved contracts count', () => {
    const s = computeTrustScore({
      contracts: [contract({ paid: false }), contract({ outcome: 'open' }), contract({ outcome: 'resolved' })],
      reviews: [],
      now: NOW,
    });
    expect(s.counted).toBe(1);
    expect(s.excluded).toEqual({ unpaid: 1, open: 1, self_dealing: 0 });
  });

  it('self-dealing contracts and their reviews are excluded', () => {
    const self = contract({ customerFingerprints: ['card:same'], providerFingerprints: ['card:same'], qaAttempts: ['validated'] });
    const s = computeTrustScore({ contracts: [self], reviews: [review(self)], now: NOW });
    expect(s.counted).toBe(0);
    expect(s.excluded.self_dealing).toBe(1);
    expect(s.reviewCount).toBe(0);
    expect(s.score).toBe(74);
  });

  it('reviews on uncounted contracts, by the provider, or unknown contracts are ignored', () => {
    const open = contract({ outcome: 'open' });
    const ok = contract();
    const s = computeTrustScore({
      contracts: [open, ok],
      reviews: [review(open), review(ok, { reviewerUserId: 'prov', overall: 1 }), { ...review(ok), contractId: 'nope' }],
      now: NOW,
    });
    expect(s.reviewCount).toBe(0);
  });

  it('a repeat customer counts less than the same number of different customers', () => {
    const repeat = Array.from({ length: 4 }, (_, i) => contract({ customerUserId: 'same', closedAt: daysAgo(i) }));
    const distinct = Array.from({ length: 4 }, () => contract());
    const r = computeTrustScore({ contracts: repeat, reviews: [], now: NOW });
    const d = computeTrustScore({ contracts: distinct, reviews: [], now: NOW });
    expect(comp(d, 'qa_first_pass').evidence).toBe(4);
    // 1 + 0.5 + 0.25 + 0.125 with a little decay on the older ones
    expect(comp(r, 'qa_first_pass').evidence).toBeLessThan(1.875);
    expect(comp(r, 'qa_first_pass').evidence).toBeGreaterThan(1.85);
  });

  it('the oldest repeat contract gets the full pair weight', () => {
    const repeat = [contract({ customerUserId: 'same', closedAt: daysAgo(0), qaAttempts: ['rejected'] }), contract({ customerUserId: 'same', closedAt: daysAgo(1) })];
    const s = computeTrustScore({ contracts: repeat, reviews: [], now: NOW });
    // the older (good) one gets weight ~1, the newer (bad) one 0.5
    const w1 = decayWeight(daysAgo(1), NOW);
    expect(comp(s, 'qa_first_pass').value).toBeCloseTo((0.6 * 3 + w1) / (3 + w1 + 0.5), 10);
  });

  it('weighted reviews: a big, old customer outweighs a fresh one', () => {
    const a = contract();
    const b = contract();
    const s = computeTrustScore({
      contracts: [a, b],
      reviews: [
        review(a, { overall: 5, quality: 5, communication: 5, timeliness: 5 }),
        review(b, { overall: 1, quality: 1, communication: 1, timeliness: 1, reviewerSpendCents: 0, reviewerAccountCreatedAt: daysAgo(1), reviewerFirstPaymentAt: daysAgo(1) }),
      ],
      now: NOW,
    });
    const wFresh = 0.2 * 0.1;
    expect(comp(s, 'reviews').value).toBeCloseTo((0.625 * 3 + 1) / (3 + 1 + wFresh), 10);
    expect(comp(s, 'reviews').evidence).toBeCloseTo(1 + wFresh, 10);
    expect(s.averageRating).toBeCloseTo((5 * 1 + 1 * wFresh) / (1 + wFresh), 1);
    expect(s.reviewCount).toBe(2);
  });

  it('repeat reviews by one reviewer are capped like contracts', () => {
    const cs = [contract({ customerUserId: 'same' }), contract({ customerUserId: 'same', closedAt: daysAgo(0) })];
    const s = computeTrustScore({ contracts: cs, reviews: cs.map((c) => review(c)), now: NOW });
    expect(comp(s, 'reviews').evidence).toBeCloseTo(1.5, 10);
  });

  it('old problems fade: the same bad contract hurts less a year ago', () => {
    const recent = computeTrustScore({ contracts: [contract({ qaAttempts: ['rejected'] })], reviews: [], now: NOW });
    const old = computeTrustScore({ contracts: [contract({ qaAttempts: ['rejected'], closedAt: daysAgo(365) })], reviews: [], now: NOW });
    expect(old.score).toBeGreaterThan(recent.score);
  });

  it('an empty signal leaves its component at the prior', () => {
    const s = computeTrustScore({ contracts: [contract({ deadline: null, qaAttempts: [], initialPriceCents: 0 })], reviews: [], now: NOW });
    expect(comp(s, 'deadline').value).toBe(0.8);
    expect(comp(s, 'deadline').evidence).toBe(0);
    expect(comp(s, 'qa_first_pass').value).toBe(0.6);
    expect(comp(s, 'price_accuracy').value).toBe(0.85);
    expect(comp(s, 'disputes').evidence).toBe(1);
  });

  it('stays within 0..100 for the worst and best records', () => {
    const worst = Array.from({ length: 40 }, () =>
      contract({ qaAttempts: ['rejected'], disputed: true, disputeLost: true, deliveredAt: '2026-12-01T00:00:00.000Z', finalPriceCents: 90000 }),
    );
    const w = computeTrustScore({ contracts: worst, reviews: worst.map((c) => review(c, { overall: 1, quality: 1, communication: 1, timeliness: 1 })), now: NOW });
    expect(w.score).toBeGreaterThanOrEqual(0);
    expect(w.score).toBeLessThan(15);
    const best = Array.from({ length: 40 }, () => contract());
    const b = computeTrustScore({ contracts: best, reviews: best.map((c) => review(c)), now: NOW });
    expect(b.score).toBeLessThanOrEqual(100);
    expect(b.score).toBeGreaterThan(90);
  });

  it('level: established from 3 contract-equivalents of evidence', () => {
    const three = Array.from({ length: 3 }, () => contract());
    expect(computeTrustScore({ contracts: three, reviews: [], now: NOW }).level).toBe('established');
    const two = Array.from({ length: 2 }, () => contract());
    expect(computeTrustScore({ contracts: [...two, contract({ closedAt: daysAgo(30) })], reviews: [], now: NOW }).level).toBe('building');
  });
});
