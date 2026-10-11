/**
 * The plans as shown on the hub (pricing, credits). Mirrors the Clerk Billing plans
 * (keys free_user, pro, plus, super). Monthly credits don't roll over; bought credits
 * never expire. Pure.
 */
import { CREDIT_VALUE_USD } from './credits';
import type { PlanKey } from './plans';

export interface PlanInfo {
  key: PlanKey;
  name: string;
  monthlyUsd: number;
  /** Price billed yearly, or null when the plan has no annual option. */
  annualUsd: number | null;
  monthlyCredits: number;
  extras: string[];
}

export const PLAN_CATALOG: readonly PlanInfo[] = [
  {
    key: 'free',
    name: 'Free',
    monthlyUsd: 0,
    annualUsd: null,
    monthlyCredits: 0,
    extras: ['Pay as you go with top-ups', 'Post jobs and bid through the Jobs MCP', 'Basic QA included on every contract'],
  },
  {
    key: 'pro',
    name: 'Pro',
    monthlyUsd: 10,
    annualUsd: 100.08,
    monthlyCredits: 1000,
    extras: ['Device API and MCP access', 'All models'],
  },
  {
    key: 'plus',
    name: 'Plus',
    monthlyUsd: 25,
    annualUsd: 250.08,
    monthlyCredits: 2800,
    extras: ['Everything in Pro', 'Journey and regression QA checks', 'Up to 10 devices'],
  },
  {
    key: 'super',
    name: 'Super',
    monthlyUsd: 60,
    annualUsd: 600,
    monthlyCredits: 7000,
    extras: ['Everything in Plus', 'Adversarial QA checks', 'Human review on request', 'Priority QA queue and enhanced reports'],
  },
];

export function planInfo(key: PlanKey): PlanInfo {
  return PLAN_CATALOG.find((p) => p.key === key) ?? PLAN_CATALOG[0];
}

/** Usage is metered at the real model cost times this markup (covers fees, failed calls, margin). */
export const CREDIT_MARKUP = 1.3;

export interface ReferenceModel {
  name: string;
  inputPer1M: number;
  outputPer1M: number;
}

/** Anthropic list prices per 1M tokens (USD), used for the pricing examples. */
export const REFERENCE_MODELS = {
  opus: { name: 'Opus 5.5', inputPer1M: 4, outputPer1M: 20 },
  sonnet: { name: 'Sonnet 5.5', inputPer1M: 2, outputPer1M: 10 },
  haiku: { name: 'Haiku 5.5', inputPer1M: 0.1, outputPer1M: 0.5 },
} as const satisfies Record<string, ReferenceModel>;

/** How many output tokens a number of credits buys on a model. */
export function outputTokensForCredits(
  credits: number,
  model: ReferenceModel,
  { creditValueUsd = CREDIT_VALUE_USD, markup = CREDIT_MARKUP }: { creditValueUsd?: number; markup?: number } = {},
): number {
  const rawUsd = (credits * creditValueUsd) / markup;
  return Math.floor((rawUsd / model.outputPer1M) * 1_000_000 + 1e-6);
}

/** "385K", "1.3M", "999". */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}
