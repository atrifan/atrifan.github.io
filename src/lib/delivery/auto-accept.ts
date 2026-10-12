/**
 * The auto-accept scheduler. Pure: for one delivered contract it decides whether the daily
 * cron (app/api/cron/auto-accept) accepts it, sends the 48-hour reminder, or leaves it.
 *
 * The clock starts when QA validates the work (submissions.auto_accept_at =
 * delivery unlocked + JOBS_AUTO_ACCEPT_DAYS). An open dispute pauses it: the contract is
 * `disputed`, or a dispute row is open, and nothing happens until an admin resolves it.
 */
import type { ContractStatus } from '../jobs/job-state.ts';

export const AUTO_ACCEPT_REMINDER_HOURS = 48;
export const DEFAULT_AUTO_ACCEPT_DAYS = 7;
export const DEFAULT_POST_ACCEPT_CLAIM_DAYS = 14;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface AutoAcceptCandidate {
  contractId: string;
  contractStatus: ContractStatus;
  /** submissions.auto_accept_at of the validated submission. */
  autoAcceptAt: string | null;
  /** When the auto_accept_reminder went out, if it did. */
  remindedAt: string | null;
  hasOpenDispute: boolean;
  paymentSucceeded: boolean;
}

export type SkipReason = 'not_delivered' | 'no_clock' | 'disputed' | 'unpaid' | 'not_due' | 'already_reminded';

export type AutoAcceptAction =
  | { contractId: string; action: 'accept' }
  | { contractId: string; action: 'remind'; autoAcceptAt: string }
  | { contractId: string; action: 'skip'; reason: SkipReason };

export function planAutoAccept(
  c: AutoAcceptCandidate,
  now: Date,
  { reminderHours = AUTO_ACCEPT_REMINDER_HOURS }: { reminderHours?: number } = {},
): AutoAcceptAction {
  const skip = (reason: SkipReason): AutoAcceptAction => ({ contractId: c.contractId, action: 'skip', reason });
  if (c.hasOpenDispute || c.contractStatus === 'disputed') return skip('disputed');
  if (c.contractStatus !== 'delivered') return skip('not_delivered');
  if (!c.paymentSucceeded) return skip('unpaid');
  const dueAt = c.autoAcceptAt ? new Date(c.autoAcceptAt).getTime() : Number.NaN;
  if (Number.isNaN(dueAt)) return skip('no_clock');
  const t = now.getTime();
  if (t >= dueAt) return { contractId: c.contractId, action: 'accept' };
  if (t < dueAt - reminderHours * HOUR_MS) return skip('not_due');
  if (c.remindedAt) return skip('already_reminded');
  return { contractId: c.contractId, action: 'remind', autoAcceptAt: c.autoAcceptAt as string };
}

export function autoAcceptAtFrom(unlockedAt: string, days: number): string {
  return new Date(new Date(unlockedAt).getTime() + days * DAY_MS).toISOString();
}

export function reminderDueAt(autoAcceptAt: string, hours: number = AUTO_ACCEPT_REMINDER_HOURS): string {
  return new Date(new Date(autoAcceptAt).getTime() - hours * HOUR_MS).toISOString();
}

type Env = Record<string, string | undefined>;

function wholeDays(env: Env, name: string, fallback: number): number {
  const raw = (env[name] ?? '').trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a whole number >= 1, got "${raw}"`);
  return value;
}

export function autoAcceptDaysFrom(env: Env = process.env): number {
  return wholeDays(env, 'JOBS_AUTO_ACCEPT_DAYS', DEFAULT_AUTO_ACCEPT_DAYS);
}

export function claimDaysFrom(env: Env = process.env): number {
  return wholeDays(env, 'JOBS_POST_ACCEPT_CLAIM_DAYS', DEFAULT_POST_ACCEPT_CLAIM_DAYS);
}
