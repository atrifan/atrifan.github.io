/**
 * QA credit math. Pure and edge-safe (used by /api/chat).
 *
 * A QA request reserves a cap: `platformCredits` (basic, paid by the platform) plus
 * `customerCredits` (the deeper checks, moved out of the customer's balance at submission).
 * Review-key calls are metered against the whole cap. On the verdict, usage is charged
 * platform-first: the platform covers usage up to the basic cap, the customer pays the
 * rest up to their reserve, and the unused customer reserve is released. Usage beyond the
 * cap (concurrent calls racing past it) is absorbed by the platform, never the customer.
 *
 * Credits are kept to 0.01 (= $0.0001 at the default value, the precision of user_budgets).
 */
import { QA_CHECKS, type QaCheck } from '../../config/qa.config.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Known checks in canonical order, de-duplicated; basic is always included. */
export function normalizeChecks(input: readonly unknown[] | null | undefined): QaCheck[] {
  const wanted = new Set<unknown>(input);
  wanted.add('basic');
  return QA_CHECKS.filter((c) => wanted.has(c));
}

export interface QaReserve {
  platformCredits: number;
  customerCredits: number;
  capCredits: number;
}

export function computeReserve(checks: readonly QaCheck[], costs: Readonly<Record<QaCheck, number>>): QaReserve {
  const platformCredits = costs.basic;
  const customerCredits = normalizeChecks(checks)
    .filter((c) => c !== 'basic')
    .reduce((sum, c) => sum + costs[c], 0);
  return { platformCredits, customerCredits, capCredits: platformCredits + customerCredits };
}

export function creditsToUsd(credits: number, creditValueUsd: number): number {
  return round4(credits * creditValueUsd);
}

/** Rounded UP to 0.01 credit (so tiny calls still cost something); float noise is ignored. */
export function usdToCredits(usd: number, creditValueUsd: number): number {
  if (!(usd > 0)) return 0;
  const hundredths = (usd / creditValueUsd) * 100;
  return Math.ceil(hundredths - 1e-6) / 100;
}

export function remainingCredits(capCredits: number, usedCredits: number): number {
  return Math.max(0, round2(capCredits - usedCredits));
}

export interface MeterResult {
  charged: number;
  used: number;
  exhausted: boolean;
}

/** Charge one call against the cap, clamped to what is left. */
export function meterCall(capCredits: number, usedCredits: number, callCredits: number): MeterResult {
  const charged = Math.min(Math.max(0, callCredits), remainingCredits(capCredits, usedCredits));
  const used = round2(usedCredits + charged);
  return { charged: round2(charged), used, exhausted: used >= capCredits };
}

export interface SettleInput {
  platformCredits: number;
  customerCredits: number;
  usedCredits: number;
}

export interface Settlement {
  usedCredits: number;
  platformCharged: number;
  customerCharged: number;
  customerReleased: number;
}

export function settleReserve({ platformCredits, customerCredits, usedCredits }: SettleInput): Settlement {
  const used = Math.max(0, usedCredits);
  const customerCharged = round2(Math.min(customerCredits, Math.max(0, used - platformCredits)));
  return {
    usedCredits: round2(used),
    platformCharged: round2(used - customerCharged),
    customerCharged,
    customerReleased: round2(customerCredits - customerCharged),
  };
}

/** Credits for a metered call: cost × markup, in credits, rounded up to 0.01. */
export function chargedCredits(costUsd: number, markup: number, creditValueUsd: number): number {
  return usdToCredits(costUsd * markup, creditValueUsd);
}

/** Deliberately high input-token estimate for a request body: 1 token per 3 characters. */
export function estimateInputTokens(serialized: string): number {
  return Math.ceil(serialized.length / 3);
}

/** Output cap for a review call: the client's max_tokens if it is a smaller positive integer. */
export function reviewOutputCap(requested: unknown, cap: number): number {
  return typeof requested === 'number' && Number.isInteger(requested) && requested > 0 && requested < cap ? requested : cap;
}
