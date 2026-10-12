/**
 * Monthly plan credits: grant math and periods. Pure.
 *
 * Each paid plan grants its monthly credits once per user per monthly period
 * (credit_grants is unique on user + period). Monthly credits don't roll over: at the next
 * grant (or when the period ends) the unused remainder of the previous grant expires.
 * Bought credits never expire.
 *
 * The balance is one number (user_budgets.remaining_balance, in USD), so the grant ledger
 * works out the grant's remainder instead of keeping a second balance. Spending is taken
 * from monthly credits first:
 *
 *   spent since grant = balance right after the grant + inflows since − balance now
 *   grant remainder   = clamp(grant − spent, 0, min(grant, balance now))
 *
 * "Inflows" are credits added since the grant that are not part of it (top-ups). QA reserves
 * and their releases only move the balance, so they count as (net) spending.
 * Amounts are credits, rounded to hundredths.
 */
import { planInfo } from '../plan-catalog.ts';
import type { PlanKey } from '../plans.ts';

export function monthlyCreditsFor(plan: PlanKey): number {
  return planInfo(plan).monthlyCredits;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface MonthlyPeriod {
  /** YYYY-MM-DD of the period start (UTC): the credit_grants period. */
  key: string;
  start: string;
  end: string;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The anchor's day and time of day, in the given month (day clamped to the month's length). */
function cycleStart(anchor: Date, year: number, month: number): Date {
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInMonth(y, m));
  return new Date(Date.UTC(y, m, day, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()));
}

/**
 * The monthly cycle that contains `now`, anchored on the subscription's start (same day of
 * month and time; day 29–31 clamps to short months). Annual plans also get monthly grants.
 */
export function monthlyPeriod(anchor: Date, now: Date): MonthlyPeriod {
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  if (now.getTime() < anchor.getTime()) {
    year = anchor.getUTCFullYear();
    month = anchor.getUTCMonth();
  }
  let start = cycleStart(anchor, year, month);
  if (start.getTime() > now.getTime() && now.getTime() >= anchor.getTime()) {
    month -= 1;
    start = cycleStart(anchor, year, month);
  }
  const end = cycleStart(anchor, year, month + 1);
  return { key: start.toISOString().slice(0, 10), start: start.toISOString(), end: end.toISOString() };
}

/** Clerk sends unix seconds or milliseconds (and sometimes ISO strings). */
export function timestampToDate(value: unknown): Date | null {
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value < 1e12 ? value * 1000 : value);
}

interface SubscriptionTimes {
  items?: Array<{ status?: unknown; period_start?: unknown }> | null;
  current_period_start?: unknown;
  created_at?: unknown;
}

/** When the subscription's billing cycle is anchored: the active item's period start, else the subscription's. */
export function periodAnchorFromSubscription(data: SubscriptionTimes | null | undefined): Date | null {
  if (!data) return null;
  const active = (data.items ?? []).find((i) => i?.status === 'active');
  return timestampToDate(active?.period_start) ?? timestampToDate(data.current_period_start) ?? timestampToDate(data.created_at);
}

export interface GrantLedgerState {
  grantCredits: number;
  /** The balance (credits) right after the grant was added. */
  balanceAfterGrantCredits: number;
  /** Bought credits added since the grant. */
  inflowCreditsSinceGrant: number;
}

export function grantRemainingCredits(g: GrantLedgerState & { balanceNowCredits: number }): number {
  const spent = g.balanceAfterGrantCredits + g.inflowCreditsSinceGrant - g.balanceNowCredits;
  const remaining = Math.min(g.grantCredits - spent, g.grantCredits, g.balanceNowCredits);
  return round2(Math.max(0, remaining));
}

/** What expires of a grant now: its unused remainder, or nothing if it already expired. */
export function expiringCredits(g: GrantLedgerState & { balanceNowCredits: number; alreadyExpired?: boolean }): number {
  return g.alreadyExpired ? 0 : grantRemainingCredits(g);
}

export interface GrantPlan {
  grantCredits: number;
  expireCredits: number;
  balanceAfterCredits: number;
}

/** A new period's grant: expire the previous grant's remainder, then add the plan's credits. */
export function planGrant(input: {
  plan: PlanKey;
  balanceNowCredits: number;
  previous: (GrantLedgerState & { alreadyExpired?: boolean }) | null;
}): GrantPlan {
  const expireCredits = input.previous ? expiringCredits({ ...input.previous, balanceNowCredits: input.balanceNowCredits }) : 0;
  const grantCredits = monthlyCreditsFor(input.plan);
  return { grantCredits, expireCredits, balanceAfterCredits: round2(input.balanceNowCredits - expireCredits + grantCredits) };
}
