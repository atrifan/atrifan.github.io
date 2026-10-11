/**
 * Can this user bid on this job at this price? Pure.
 *
 * Checks run in a fixed order, so the first failure is what the caller sees:
 *   1. connect_required (403)    — no provider profile, or payouts not enabled
 *   2. own_job (403)             — the bidder posted the job
 *   3. job_not_open (409)        — job status is not 'open'
 *   4. spec_not_approved (409)   — the job's current spec version is not approved
 *   5. invalid_price (400)       — price is not a positive integer of cents
 *   6. price_out_of_bounds (422) — outside JOBS_MIN_BID_CENTS..JOBS_MAX_BID_CENTS (inclusive)
 */

import type { JobStatus } from './job-state.ts';

export const DEFAULT_MIN_BID_CENTS = 500;
export const DEFAULT_MAX_BID_CENTS = 5_000_000;

export interface BidBounds {
  minCents: number;
  maxCents: number;
}

export interface BidEligibilityInput {
  bidderUserId: string;
  provider: { payouts_enabled: boolean } | null;
  job: { user_id: string; status: JobStatus; current_spec_version_id: string | null };
  spec: { id: string; status: 'draft' | 'approved' | 'superseded' } | null;
  priceCents: number;
  bounds: BidBounds;
}

export type BidIneligibleCode =
  | 'connect_required'
  | 'own_job'
  | 'job_not_open'
  | 'spec_not_approved'
  | 'invalid_price'
  | 'price_out_of_bounds';

export type BidEligibility =
  | { ok: true }
  | { ok: false; code: BidIneligibleCode; status: 400 | 403 | 409 | 422 };

export function checkBidEligibility(input: BidEligibilityInput): BidEligibility {
  const { bidderUserId, provider, job, spec, priceCents, bounds } = input;
  if (!provider || provider.payouts_enabled !== true) {
    return { ok: false, code: 'connect_required', status: 403 };
  }
  if (job.user_id === bidderUserId) {
    return { ok: false, code: 'own_job', status: 403 };
  }
  if (job.status !== 'open') {
    return { ok: false, code: 'job_not_open', status: 409 };
  }
  if (!spec || spec.status !== 'approved' || spec.id !== job.current_spec_version_id) {
    return { ok: false, code: 'spec_not_approved', status: 409 };
  }
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    return { ok: false, code: 'invalid_price', status: 400 };
  }
  if (priceCents < bounds.minCents || priceCents > bounds.maxCents) {
    return { ok: false, code: 'price_out_of_bounds', status: 422 };
  }
  return { ok: true };
}

function readPositiveInt(raw: string | undefined, name: string, fallback: number): number {
  const value = raw?.trim();
  if (!value) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new RangeError(`${name} must be a positive integer number of cents, got ${value}`);
  }
  return Number(value);
}

export function bidBoundsFromEnv(env: Record<string, string | undefined> = process.env): BidBounds {
  const minCents = readPositiveInt(env.JOBS_MIN_BID_CENTS, 'JOBS_MIN_BID_CENTS', DEFAULT_MIN_BID_CENTS);
  const maxCents = readPositiveInt(env.JOBS_MAX_BID_CENTS, 'JOBS_MAX_BID_CENTS', DEFAULT_MAX_BID_CENTS);
  if (minCents > maxCents) {
    throw new RangeError(`JOBS_MIN_BID_CENTS (${minCents}) is above JOBS_MAX_BID_CENTS (${maxCents})`);
  }
  return { minCents, maxCents };
}
