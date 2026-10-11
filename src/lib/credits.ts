/**
 * Credits: the one unit for all AI spend (assistant chat and QA). Balances are stored in
 * USD (`user_budgets.remaining_balance`); the UI shows them as credits.
 * 1 credit = CREDIT_VALUE_USD ($0.01). Pure: safe on the server and in the browser.
 */
import { surfaceUrl } from './surface-url';

export const CREDIT_VALUE_USD = 0.01;
export const MIN_TOP_UP_USD = 5;
export const MAX_TOP_UP_USD = 500;
export const TOP_UP_PRESETS_USD = [5, 10, 25] as const;

/** Float noise allowance for USD → credit division (0.29 / 0.01 = 28.999999999999996). */
const EPSILON = 1e-6;

/** USD to whole credits, rounded to the nearest credit (transaction amounts). */
export function creditsForUsd(usd: number, creditValueUsd: number = CREDIT_VALUE_USD): number {
  return Math.round(usd / creditValueUsd) || 0;
}

/** A balance in whole credits, rounded down so it is never overstated. */
export function balanceCredits(usd: number, creditValueUsd: number = CREDIT_VALUE_USD): number {
  if (!Number.isFinite(usd)) return 0;
  return Math.floor(usd / creditValueUsd + EPSILON) || 0;
}

export type TopUpResult = { ok: true; amountUsd: number; credits: number } | { ok: false; error: string };

/** A top-up is a whole number of dollars from MIN_TOP_UP_USD to MAX_TOP_UP_USD. */
export function validateTopUp(raw: unknown): TopUpResult {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return { ok: false, error: 'Enter a whole number of dollars.' };
  }
  if (raw < MIN_TOP_UP_USD) return { ok: false, error: `The minimum top-up is $${MIN_TOP_UP_USD}.` };
  if (raw > MAX_TOP_UP_USD) return { ok: false, error: `The maximum top-up is $${MAX_TOP_UP_USD}.` };
  return { ok: true, amountUsd: raw, credits: creditsForUsd(raw) };
}

type Env = Record<string, string | undefined>;

/** Where Stripe Checkout sends the buyer back: hub /credits. */
export function checkoutReturnUrls(env: Env = process.env): { successUrl: string; cancelUrl: string } {
  const root = (env.NEXT_PUBLIC_ROOT_DOMAIN ?? '').trim();
  const at = (query: string) => {
    const path = `/credits?topup=${query}`;
    if (root) return surfaceUrl('hub', path, { rootDomain: root });
    const base = (env.NEXT_PUBLIC_APP_URL || env.NEXT_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return base + path;
  };
  return { successUrl: at('success'), cancelUrl: at('canceled') };
}
