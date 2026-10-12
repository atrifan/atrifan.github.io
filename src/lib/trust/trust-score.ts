/**
 * Provider trust score, 0–100. Pure: src/lib/trust/trust-service.ts loads the inputs and
 * stores the result per provider principal and per agent version.
 *
 * What counts (anti-gaming):
 *  - Only paid contracts that were accepted (completed) or resolved by an admin.
 *  - Self-dealing is excluded: the customer is the provider's own user, or the two share a
 *    Stripe fingerprint (card, Stripe customer, payout account, email). Its reviews too.
 *  - Repeat pairs are capped: the k-th contract (oldest first) with the same customer weighs
 *    0.5^k, so one customer can add at most 2 contracts' worth; same for repeat reviews.
 *  - Reviews are weighted by the reviewer's paid spend (EUR 0 → 0.2, EUR 1,000+ → 1, log
 *    scale) times account and payment age (the younger of the two, over 90 days, floor 0.1).
 *  - Everything decays with a 180-day half-life.
 *
 * Each signal is a Bayesian mean: (prior × strength + Σ weight × value) / (strength + Σ weight),
 * so a new provider starts at the prior and moves as evidence comes in. The score is the
 * weighted sum of the components; QA, disputes and deadlines carry most of the weight.
 */

export type QaAttemptVerdict = 'validated' | 'requires_changes' | 'rejected';

export interface TrustContract {
  contractId: string;
  customerUserId: string;
  providerUserId: string;
  /** A payment for the contract succeeded. */
  paid: boolean;
  /** accepted = completed by the customer or auto-accept; resolved = closed by an admin. */
  outcome: 'accepted' | 'resolved' | 'open';
  /** Acceptance or resolution time; drives decay and the repeat-pair order. */
  closedAt: string;
  /** QA verdicts in attempt order. */
  qaAttempts: QaAttemptVerdict[];
  /** The customer opened a dispute or a chargeback. */
  disputed: boolean;
  /** The dispute ended in a (partial or full) refund. */
  disputeLost: boolean;
  deadline: string | null;
  /** When QA validated the work. */
  deliveredAt: string | null;
  initialPriceCents: number;
  finalPriceCents: number;
  customerFingerprints: string[];
  providerFingerprints: string[];
}

export interface TrustReview {
  contractId: string;
  reviewerUserId: string;
  overall: number;
  quality: number;
  communication: number;
  timeliness: number;
  createdAt: string;
  reviewerSpendCents: number;
  reviewerAccountCreatedAt: string | null;
  reviewerFirstPaymentAt: string | null;
}

export type TrustComponentKey = 'qa_first_pass' | 'qa_severity' | 'disputes' | 'deadline' | 'price_accuracy' | 'reviews';

export interface TrustComponent {
  key: TrustComponentKey;
  label: string;
  /** Posterior mean, 0..1. */
  value: number;
  /** Share of the score. */
  weight: number;
  /** Effective (weighted) number of observations. */
  evidence: number;
}

export interface TrustScore {
  score: number;
  level: 'new' | 'building' | 'established';
  counted: number;
  excluded: { unpaid: number; open: number; self_dealing: number };
  reviewCount: number;
  /** Weighted mean of the overall rating (1–5), one decimal; null without reviews. */
  averageRating: number | null;
  components: TrustComponent[];
}

interface ComponentConfig {
  key: TrustComponentKey;
  label: string;
  weight: number;
  prior: number;
}

export const DEFAULT_TRUST_CONFIG = {
  halfLifeDays: 180,
  priorStrength: 3,
  establishedEvidence: 3,
  components: [
    { key: 'qa_first_pass', label: 'QA first-pass rate', weight: 0.25, prior: 0.6 },
    { key: 'qa_severity', label: 'QA failure severity', weight: 0.15, prior: 0.8 },
    { key: 'disputes', label: 'Disputes', weight: 0.2, prior: 0.85 },
    { key: 'deadline', label: 'Deadline reliability', weight: 0.15, prior: 0.8 },
    { key: 'price_accuracy', label: 'Price accuracy', weight: 0.1, prior: 0.85 },
    { key: 'reviews', label: 'Reviews', weight: 0.15, prior: 0.625 },
  ] as readonly ComponentConfig[],
};

const DAY_MS = 86_400_000;

export function decayWeight(at: string, now: Date, halfLifeDays: number = DEFAULT_TRUST_CONFIG.halfLifeDays): number {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return 0;
  const ageDays = Math.max(0, (now.getTime() - t) / DAY_MS);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/** Weight of the k-th (0-based, oldest first) contract or review from the same counterpart. */
export function pairFactor(k: number): number {
  return Math.pow(0.5, k);
}

export function posterior(prior: number, strength: number, weightedSum: number, weight: number): number {
  if (weight <= 0) return prior;
  return (prior * strength + weightedSum) / (strength + weight);
}

/** A review as 0..1: overall 40%, quality 30%, communication 15%, timeliness 15%. */
export function ratingValue(r: Pick<TrustReview, 'overall' | 'quality' | 'communication' | 'timeliness'>): number {
  const n = (v: number) => (v - 1) / 4;
  return 0.4 * n(r.overall) + 0.3 * n(r.quality) + 0.15 * n(r.communication) + 0.15 * n(r.timeliness);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function ageDays(at: string | null, now: Date): number {
  if (!at) return 0;
  const t = new Date(at).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, (now.getTime() - t) / DAY_MS);
}

export function reviewerWeight(
  r: Pick<TrustReview, 'reviewerSpendCents' | 'reviewerAccountCreatedAt' | 'reviewerFirstPaymentAt'>,
  now: Date,
): number {
  const euros = Math.max(0, r.reviewerSpendCents) / 100;
  const spend = clamp(0.2 + (0.8 * Math.log10(1 + euros)) / Math.log10(1001), 0.2, 1);
  const age = Math.min(ageDays(r.reviewerAccountCreatedAt, now), ageDays(r.reviewerFirstPaymentAt, now));
  return spend * clamp(age / 90, 0.1, 1);
}

const fingerprint = (f: string) => f.trim().toLowerCase();

export function isSelfDealing(c: Pick<TrustContract, 'customerUserId' | 'providerUserId' | 'customerFingerprints' | 'providerFingerprints'>): boolean {
  if (c.customerUserId === c.providerUserId) return true;
  const provider = new Set(c.providerFingerprints.map(fingerprint).filter(Boolean));
  return c.customerFingerprints.map(fingerprint).some((f) => f && provider.has(f));
}

export interface ContractSignals {
  firstPass: number | null;
  severity: number | null;
  dispute: number;
  deadline: number | null;
  price: number | null;
}

/** Each signal of one contract as 0..1 (1 = good); null when the contract says nothing about it. */
export function contractSignals(c: TrustContract): ContractSignals {
  const attempts = c.qaAttempts;
  let firstPass: number | null = null;
  let severity: number | null = null;
  if (attempts.length > 0) {
    firstPass = attempts[0] === 'validated' ? 1 : 0;
    const changes = attempts.filter((a) => a === 'requires_changes').length;
    const hit = 0.34 * changes + (attempts.includes('rejected') ? 1 : 0);
    severity = Math.round(Math.max(0, 1 - hit) * 100) / 100;
  }
  const dispute = c.disputed ? (c.disputeLost ? 0 : 0.5) : 1;
  let deadline: number | null = null;
  if (c.deadline && c.deliveredAt) {
    const lateDays = (new Date(c.deliveredAt).getTime() - new Date(c.deadline).getTime()) / DAY_MS;
    deadline = Math.min(1, Math.max(0, 1 - lateDays / 7));
  }
  let price: number | null = null;
  if (c.initialPriceCents > 0) {
    const overrun = c.finalPriceCents / c.initialPriceCents - 1;
    price = Math.min(1, Math.max(0, 1 - overrun * 2));
  }
  return { firstPass, severity, dispute, deadline, price };
}

type Acc = { sum: number; weight: number };

export function computeTrustScore(
  input: { contracts: TrustContract[]; reviews: TrustReview[]; now: Date },
  config: typeof DEFAULT_TRUST_CONFIG = DEFAULT_TRUST_CONFIG,
): TrustScore {
  const { now } = input;
  const excluded = { unpaid: 0, open: 0, self_dealing: 0 };
  const counted: TrustContract[] = [];
  for (const c of input.contracts) {
    if (!c.paid) excluded.unpaid += 1;
    else if (c.outcome === 'open') excluded.open += 1;
    else if (isSelfDealing(c)) excluded.self_dealing += 1;
    else counted.push(c);
  }
  counted.sort((a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime());

  const acc: Record<Exclude<TrustComponentKey, 'reviews'>, Acc> = {
    qa_first_pass: { sum: 0, weight: 0 },
    qa_severity: { sum: 0, weight: 0 },
    disputes: { sum: 0, weight: 0 },
    deadline: { sum: 0, weight: 0 },
    price_accuracy: { sum: 0, weight: 0 },
  };
  const add = (a: Acc, w: number, v: number | null) => {
    if (v === null) return;
    a.sum += w * v;
    a.weight += w;
  };

  const perCustomer = new Map<string, number>();
  const byId = new Map<string, TrustContract>();
  let evidence = 0;
  for (const c of counted) {
    byId.set(c.contractId, c);
    const k = perCustomer.get(c.customerUserId) ?? 0;
    perCustomer.set(c.customerUserId, k + 1);
    const w = decayWeight(c.closedAt, now, config.halfLifeDays) * pairFactor(k);
    evidence += w;
    const s = contractSignals(c);
    add(acc.qa_first_pass, w, s.firstPass);
    add(acc.qa_severity, w, s.severity);
    add(acc.disputes, w, s.dispute);
    add(acc.deadline, w, s.deadline);
    add(acc.price_accuracy, w, s.price);
  }

  const reviews = input.reviews
    .filter((r) => {
      const c = byId.get(r.contractId);
      return !!c && r.reviewerUserId !== c.providerUserId;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const rev: Acc = { sum: 0, weight: 0 };
  let ratingSum = 0;
  const perReviewer = new Map<string, number>();
  for (const r of reviews) {
    const k = perReviewer.get(r.reviewerUserId) ?? 0;
    perReviewer.set(r.reviewerUserId, k + 1);
    const w = decayWeight(r.createdAt, now, config.halfLifeDays) * reviewerWeight(r, now) * pairFactor(k);
    rev.sum += w * ratingValue(r);
    rev.weight += w;
    ratingSum += w * r.overall;
  }

  const components: TrustComponent[] = config.components.map((cc) => {
    const a = cc.key === 'reviews' ? rev : acc[cc.key];
    return {
      key: cc.key,
      label: cc.label,
      value: posterior(cc.prior, config.priorStrength, a.sum, a.weight),
      weight: cc.weight,
      evidence: a.weight,
    };
  });
  const raw = components.reduce((s, c) => s + c.weight * c.value, 0);

  return {
    score: Math.round(clamp(raw, 0, 1) * 100),
    level: evidence === 0 ? 'new' : evidence < config.establishedEvidence ? 'building' : 'established',
    counted: counted.length,
    excluded,
    reviewCount: reviews.length,
    averageRating: rev.weight > 0 ? Math.round((ratingSum / rev.weight) * 10) / 10 : null,
    components,
  };
}
