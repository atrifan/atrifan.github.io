import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkBidEligibility,
  bidBoundsFromEnv,
  DEFAULT_MIN_BID_CENTS,
  DEFAULT_MAX_BID_CENTS,
  type BidEligibilityInput,
} from '../../src/lib/jobs/bid-eligibility.ts';

function base(over: Partial<BidEligibilityInput> = {}): BidEligibilityInput {
  return {
    bidderUserId: 'provider',
    provider: { payouts_enabled: true },
    job: { user_id: 'customer', status: 'open', current_spec_version_id: 'spec1' },
    spec: { id: 'spec1', status: 'approved' },
    priceCents: 30000,
    bounds: { minCents: 500, maxCents: 5_000_000 },
    ...over,
  };
}

test('an enabled provider bidding a sane price on an open, approved job is eligible', () => {
  assert.deepEqual(checkBidEligibility(base()), { ok: true });
});

test('no provider profile -> connect_required (403)', () => {
  assert.deepEqual(checkBidEligibility(base({ provider: null })), {
    ok: false, code: 'connect_required', status: 403,
  });
});

test('payouts not enabled -> connect_required (403)', () => {
  assert.deepEqual(checkBidEligibility(base({ provider: { payouts_enabled: false } })), {
    ok: false, code: 'connect_required', status: 403,
  });
});

test('connect_required wins over every other failure', () => {
  const r = checkBidEligibility(base({
    provider: null,
    bidderUserId: 'customer',
    job: { user_id: 'customer', status: 'draft', current_spec_version_id: null },
    spec: null,
    priceCents: -1,
  }));
  assert.equal(r.ok === false && r.code, 'connect_required');
});

test('bidding on your own job -> own_job (403)', () => {
  assert.deepEqual(checkBidEligibility(base({ bidderUserId: 'customer' })), {
    ok: false, code: 'own_job', status: 403,
  });
});

test('own_job is checked before job state', () => {
  const r = checkBidEligibility(base({
    bidderUserId: 'customer',
    job: { user_id: 'customer', status: 'draft', current_spec_version_id: null },
  }));
  assert.equal(r.ok === false && r.code, 'own_job');
});

test('job not open -> job_not_open (409)', () => {
  for (const status of ['draft', 'awarded', 'in_progress', 'delivered', 'completed', 'cancelled', 'disputed'] as const) {
    assert.deepEqual(
      checkBidEligibility(base({ job: { user_id: 'customer', status, current_spec_version_id: 'spec1' } })),
      { ok: false, code: 'job_not_open', status: 409 },
      status,
    );
  }
});

test('spec missing, not approved, or not the current version -> spec_not_approved (409)', () => {
  assert.deepEqual(checkBidEligibility(base({ spec: null })), { ok: false, code: 'spec_not_approved', status: 409 });
  assert.deepEqual(checkBidEligibility(base({ spec: { id: 'spec1', status: 'draft' } })), {
    ok: false, code: 'spec_not_approved', status: 409,
  });
  assert.deepEqual(checkBidEligibility(base({ spec: { id: 'spec1', status: 'superseded' } })), {
    ok: false, code: 'spec_not_approved', status: 409,
  });
  assert.deepEqual(checkBidEligibility(base({ spec: { id: 'other', status: 'approved' } })), {
    ok: false, code: 'spec_not_approved', status: 409,
  });
  assert.deepEqual(
    checkBidEligibility(base({ job: { user_id: 'customer', status: 'open', current_spec_version_id: null } })),
    { ok: false, code: 'spec_not_approved', status: 409 },
  );
});

test('non-integer or non-positive price -> invalid_price (400)', () => {
  for (const priceCents of [0, -100, 10.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(checkBidEligibility(base({ priceCents })), {
      ok: false, code: 'invalid_price', status: 400,
    }, String(priceCents));
  }
});

test('price bounds are inclusive', () => {
  assert.deepEqual(checkBidEligibility(base({ priceCents: 500 })), { ok: true });
  assert.deepEqual(checkBidEligibility(base({ priceCents: 5_000_000 })), { ok: true });
  assert.deepEqual(checkBidEligibility(base({ priceCents: 499 })), {
    ok: false, code: 'price_out_of_bounds', status: 422,
  });
  assert.deepEqual(checkBidEligibility(base({ priceCents: 5_000_001 })), {
    ok: false, code: 'price_out_of_bounds', status: 422,
  });
});

test('bounds default to 500..5,000,000 cents', () => {
  assert.equal(DEFAULT_MIN_BID_CENTS, 500);
  assert.equal(DEFAULT_MAX_BID_CENTS, 5_000_000);
  assert.deepEqual(bidBoundsFromEnv({}), { minCents: 500, maxCents: 5_000_000 });
  assert.deepEqual(bidBoundsFromEnv({ JOBS_MIN_BID_CENTS: '', JOBS_MAX_BID_CENTS: ' ' }), {
    minCents: 500, maxCents: 5_000_000,
  });
});

test('bounds come from env', () => {
  assert.deepEqual(bidBoundsFromEnv({ JOBS_MIN_BID_CENTS: '1000', JOBS_MAX_BID_CENTS: '200000' }), {
    minCents: 1000, maxCents: 200000,
  });
  assert.deepEqual(bidBoundsFromEnv({ JOBS_MIN_BID_CENTS: '1000' }), { minCents: 1000, maxCents: 5_000_000 });
  assert.deepEqual(bidBoundsFromEnv({ JOBS_MAX_BID_CENTS: '9000' }), { minCents: 500, maxCents: 9000 });
});

test('bad bounds are rejected', () => {
  assert.throws(() => bidBoundsFromEnv({ JOBS_MIN_BID_CENTS: 'x' }), RangeError);
  assert.throws(() => bidBoundsFromEnv({ JOBS_MIN_BID_CENTS: '0' }), RangeError);
  assert.throws(() => bidBoundsFromEnv({ JOBS_MIN_BID_CENTS: '10.5' }), RangeError);
  assert.throws(() => bidBoundsFromEnv({ JOBS_MAX_BID_CENTS: '-1' }), RangeError);
  assert.throws(() => bidBoundsFromEnv({ JOBS_MIN_BID_CENTS: '2000', JOBS_MAX_BID_CENTS: '1000' }), RangeError);
  assert.deepEqual(bidBoundsFromEnv({ JOBS_MIN_BID_CENTS: '1000', JOBS_MAX_BID_CENTS: '1000' }), {
    minCents: 1000, maxCents: 1000,
  });
});
