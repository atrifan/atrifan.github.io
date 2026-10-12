/**
 * The live price breakdown shown next to bids, offers and contracts. Pure; uses the
 * same commission math as the server (src/lib/jobs/commission.ts): the commission is
 * added on top, the provider receives the whole bid.
 */
import { computeCommission } from '../commission';
import { formatEuros } from './format';

export interface PriceBreakdown {
  receiveCents: number;
  feeCents: number;
  totalCents: number;
  receive: string;
  fee: string;
  total: string;
  percent: string;
}

/** 1500 → "15%", 1250 → "12.5%". */
export function percentFromBps(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** null until there is a positive whole-cent price (or if the commission is invalid). */
export function priceBreakdown(priceCents: number | null, commissionBps: number): PriceBreakdown | null {
  // Also rejects null and NaN; fractional cents make computeCommission throw (→ null).
  if (!(Number(priceCents) > 0)) return null;
  let c;
  try {
    c = computeCommission(priceCents as number, commissionBps);
  } catch {
    return null;
  }
  return {
    receiveCents: c.providerNetCents,
    feeCents: c.feeCents,
    totalCents: c.customerTotalCents,
    receive: formatEuros(c.providerNetCents),
    fee: formatEuros(c.feeCents),
    total: formatEuros(c.customerTotalCents),
    percent: percentFromBps(c.commissionBps),
  };
}
