/**
 * Admin activity: the date range and the money totals. Pure.
 *
 * - Payments: collected checkouts (succeeded, partially refunded, refunded, disputed), gross.
 * - Commission earned: our fee inside payments we kept (a fully refunded payment earns nothing).
 * - Payouts: transfers that reached providers, net of reversals.
 * - Refunds: succeeded refunds.
 */
import { COLLECTED_PAYMENT, EARNED_PAYMENT, PAID_TRANSFER } from './ledger';

export interface DateRange {
  from: string;
  to: string;
}

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 30;
export const MAX_RANGE_DAYS = 366;
/** A real `YYYY-MM-DD` day: it must survive a round trip through Date (so 2026-02-30 fails). */
function validDay(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const dayMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
const dayString = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `from`/`to` as `YYYY-MM-DD` (inclusive). Missing sides default to a 30-day window ending today. */
export function parseRange(from: string | null, to: string | null, now: Date): { ok: true; range: DateRange } | { ok: false; error: string } {
  const f = from?.trim() || '';
  const t = to?.trim() || '';
  if ((f && !validDay(f)) || (t && !validDay(t))) return { ok: false, error: 'Dates must be YYYY-MM-DD' };
  const toDay = t || dayString(now.getTime());
  const fromDay = f || dayString(dayMs(toDay) - (DEFAULT_DAYS - 1) * DAY_MS);
  if (fromDay > toDay) return { ok: false, error: '"From" must be on or before "To"' };
  if ((dayMs(toDay) - dayMs(fromDay)) / DAY_MS + 1 > MAX_RANGE_DAYS) return { ok: false, error: `The range can be at most ${MAX_RANGE_DAYS} days` };
  return { ok: true, range: { from: fromDay, to: toDay } };
}

/** Half-open ISO bounds covering whole UTC days: [from 00:00, day after `to` 00:00). */
export function rangeBounds(range: DateRange): { start: string; end: string } {
  return { start: new Date(dayMs(range.from)).toISOString(), end: new Date(dayMs(range.to) + DAY_MS).toISOString() };
}

export interface AdminActivityInput {
  installs: number;
  publishes: number;
  payments: Array<{ amount_cents: number; amount_refunded_cents: number; status: string; fee_cents: number }>;
  transfers: Array<{ amount_cents: number; amount_reversed_cents: number; status: string }>;
  refunds: Array<{ amount_cents: number; status: string }>;
  disputes: number;
}

export interface AdminTotals {
  installs: number;
  publishes: number;
  paymentsCount: number;
  paymentsCents: number;
  commissionCents: number;
  payoutsCount: number;
  payoutsCents: number;
  refundsCount: number;
  refundsCents: number;
  disputes: number;
}

export function adminTotals(input: AdminActivityInput): AdminTotals {
  const collected = input.payments.filter((p) => COLLECTED_PAYMENT.has(p.status));
  const paid = input.transfers.filter((t) => PAID_TRANSFER.has(t.status));
  const refunds = input.refunds.filter((r) => r.status === 'succeeded');
  return {
    installs: input.installs,
    publishes: input.publishes,
    paymentsCount: collected.length,
    paymentsCents: collected.reduce((s, p) => s + p.amount_cents, 0),
    commissionCents: input.payments.filter((p) => EARNED_PAYMENT.has(p.status)).reduce((s, p) => s + p.fee_cents, 0),
    payoutsCount: paid.length,
    payoutsCents: paid.reduce((s, t) => s + t.amount_cents - t.amount_reversed_cents, 0),
    refundsCount: refunds.length,
    refundsCents: refunds.reduce((s, r) => s + r.amount_cents, 0),
    disputes: input.disputes,
  };
}
