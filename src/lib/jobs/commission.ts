/**
 * Marketplace commission math. Pure, integer cents only.
 *
 * The commission is added on top of the bid: the customer pays
 * `bid + fee`, the provider is paid the whole bid.
 *
 * Rounding: the fee is `bid × bps / 10000` rounded half-up to a whole cent,
 * i.e. `floor((bid × bps + 5000) / 10000)`. Example: 10¢ at 15% is 1.5¢ → 2¢;
 * 7¢ at 15% is 1.05¢ → 1¢. All math stays inside Number.MAX_SAFE_INTEGER.
 */

export const DEFAULT_COMMISSION_PERCENT = 15;

const BPS_DENOMINATOR = 10_000;

export interface CommissionBreakdown {
  bidCents: number;
  feeCents: number;
  customerTotalCents: number;
  providerNetCents: number;
  commissionBps: number;
}

/** Convert a percent (e.g. 15 or 12.5) to integer basis points. */
export function commissionBpsFromPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`Commission percent must be between 0 and 100, got ${percent}`);
  }
  const bps = Math.round(percent * 100);
  if (Math.abs(percent * 100 - bps) > 1e-9) {
    throw new RangeError(`Commission percent ${percent} is finer than one basis point`);
  }
  return bps;
}

/**
 * Read `MARKETPLACE_COMMISSION_PERCENT` (default 15). A set-but-invalid value
 * throws instead of silently charging the default.
 */
export function commissionBpsFromEnv(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MARKETPLACE_COMMISSION_PERCENT?.trim();
  if (!raw) return commissionBpsFromPercent(DEFAULT_COMMISSION_PERCENT);
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new RangeError(`MARKETPLACE_COMMISSION_PERCENT is not a number: ${raw}`);
  }
  return commissionBpsFromPercent(Number(raw));
}

export function computeCommission(bidCents: number, commissionBps: number): CommissionBreakdown {
  if (!Number.isInteger(bidCents) || bidCents < 0) {
    throw new RangeError(`Bid must be a non-negative integer number of cents, got ${bidCents}`);
  }
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > BPS_DENOMINATOR) {
    throw new RangeError(`Commission bps must be an integer between 0 and 10000, got ${commissionBps}`);
  }
  if (bidCents > Math.floor(Number.MAX_SAFE_INTEGER / BPS_DENOMINATOR)) {
    throw new RangeError(`Bid is too large: ${bidCents}`);
  }
  const feeCents = Math.floor((bidCents * commissionBps + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
  return {
    bidCents,
    feeCents,
    customerTotalCents: bidCents + feeCents,
    providerNetCents: bidCents,
    commissionBps,
  };
}
