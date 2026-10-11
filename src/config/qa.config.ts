/**
 * QA check caps and credit settings. Pure (reads an env object), edge-safe.
 *
 * Check prices are a CAP in credits, reserved at submission and charged at the metered
 * cost of the admin's review agent (via /api/chat with a review key); the rest is released.
 * Basic QA is paid by the platform; the deeper checks the customer chose come out of the
 * customer's `user_budgets` balance. 1 credit = CREDIT_VALUE_USD (default $0.01).
 *
 * Env overrides: QA_COST_BASIC, QA_COST_DEEP_REQUIREMENTS, QA_COST_CODE_REVIEW,
 * QA_COST_SECURITY, QA_COST_JOURNEY, QA_COST_ADVERSARIAL (whole credits),
 * CREDIT_VALUE_USD, CREDIT_MARKUP, QA_REVIEW_MAX_OUTPUT_TOKENS, JOBS_AUTO_ACCEPT_DAYS.
 */

export const QA_CHECKS = ['basic', 'deep_requirements', 'code_review', 'security', 'journey', 'adversarial'] as const;
export type QaCheck = (typeof QA_CHECKS)[number];

export const DEFAULT_QA_COSTS: Readonly<Record<QaCheck, number>> = {
  basic: 60,
  deep_requirements: 150,
  code_review: 300,
  security: 450,
  journey: 600,
  adversarial: 900,
};

export const DEFAULT_CREDIT_VALUE_USD = 0.01;
/** Metered AI cost × CREDIT_MARKUP is what a call costs in credits (covers fees, failed calls, margin). */
export const DEFAULT_CREDIT_MARKUP = 1.3;
/** Output-token cap on a QA review call through /api/chat; bounds the per-call credit hold. */
export const DEFAULT_REVIEW_MAX_OUTPUT_TOKENS = 8192;
export const DEFAULT_AUTO_ACCEPT_DAYS = 7;
/** Lifetime of a QA review key. */
export const REVIEW_KEY_TTL_HOURS = 24;

type Env = Record<string, string | undefined>;

export function qaCostsFromEnv(env: Env = process.env): Record<QaCheck, number> {
  const out = { ...DEFAULT_QA_COSTS };
  for (const check of QA_CHECKS) {
    const name = `QA_COST_${check.toUpperCase()}`;
    const raw = (env[name] ?? '').trim();
    if (!raw) continue;
    if (!/^\d+$/.test(raw)) throw new RangeError(`${name} must be a whole number of credits, got "${raw}"`);
    out[check] = Number(raw);
  }
  return out;
}

export function creditValueUsdFromEnv(env: Env = process.env): number {
  const raw = (env.CREDIT_VALUE_USD ?? '').trim();
  if (!raw) return DEFAULT_CREDIT_VALUE_USD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`CREDIT_VALUE_USD must be a positive number, got "${raw}"`);
  return value;
}

export function autoAcceptDaysFromEnv(env: Env = process.env): number {
  const raw = (env.JOBS_AUTO_ACCEPT_DAYS ?? '').trim();
  if (!raw) return DEFAULT_AUTO_ACCEPT_DAYS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`JOBS_AUTO_ACCEPT_DAYS must be a whole number >= 1, got "${raw}"`);
  return value;
}

export function creditMarkupFromEnv(env: Env = process.env): number {
  const raw = (env.CREDIT_MARKUP ?? '').trim();
  if (!raw) return DEFAULT_CREDIT_MARKUP;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) throw new RangeError(`CREDIT_MARKUP must be a number >= 1, got "${raw}"`);
  return value;
}

export function reviewMaxOutputTokensFromEnv(env: Env = process.env): number {
  const raw = (env.QA_REVIEW_MAX_OUTPUT_TOKENS ?? '').trim();
  if (!raw) return DEFAULT_REVIEW_MAX_OUTPUT_TOKENS;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new RangeError(`QA_REVIEW_MAX_OUTPUT_TOKENS must be a whole number >= 1, got "${raw}"`);
  }
  return Number(raw);
}
