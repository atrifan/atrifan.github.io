import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCommission,
  commissionBpsFromPercent,
  commissionBpsFromEnv,
  DEFAULT_COMMISSION_PERCENT,
} from '../../src/lib/jobs/commission.ts';

test('a 300 EUR bid at the default 15% is charged 345 EUR', () => {
  assert.equal(DEFAULT_COMMISSION_PERCENT, 15);
  assert.deepEqual(computeCommission(30000, 1500), {
    bidCents: 30000,
    feeCents: 4500,
    customerTotalCents: 34500,
    providerNetCents: 30000,
    commissionBps: 1500,
  });
});

test('the plan example: a 300 bid at 20% is charged 360', () => {
  assert.equal(computeCommission(30000, 2000).customerTotalCents, 36000);
});

test('commission is added on top; the provider keeps the whole bid', () => {
  const r = computeCommission(12345, 1500);
  assert.equal(r.providerNetCents, 12345);
  assert.equal(r.customerTotalCents, r.bidCents + r.feeCents);
});

test('fee rounds half-up to the cent', () => {
  // 10 * 15% = 1.5 cents -> 2
  assert.equal(computeCommission(10, 1500).feeCents, 2);
  // 13 * 15% = 1.95 -> 2
  assert.equal(computeCommission(13, 1500).feeCents, 2);
  // 3 * 15% = 0.45 -> 0
  assert.equal(computeCommission(3, 1500).feeCents, 0);
  // 1 * 50% = 0.5 -> 1
  assert.equal(computeCommission(1, 5000).feeCents, 1);
  // 1 * 49.99% = 0.4999 -> 0
  assert.equal(computeCommission(1, 4999).feeCents, 0);
  // 7 * 15% = 1.05 -> 1
  assert.equal(computeCommission(7, 1500).feeCents, 1);
});

test('zero commission and zero bid are allowed', () => {
  assert.equal(computeCommission(30000, 0).feeCents, 0);
  assert.equal(computeCommission(30000, 0).customerTotalCents, 30000);
  assert.equal(computeCommission(0, 1500).customerTotalCents, 0);
});

test('100% commission doubles the price', () => {
  assert.equal(computeCommission(30000, 10000).customerTotalCents, 60000);
});

test('negative or non-integer bids are rejected', () => {
  assert.throws(() => computeCommission(-1, 1500), RangeError);
  assert.throws(() => computeCommission(10.5, 1500), RangeError);
  assert.throws(() => computeCommission(Number.NaN, 1500), RangeError);
  assert.throws(() => computeCommission(Number.POSITIVE_INFINITY, 1500), RangeError);
});

test('bids that would overflow safe integer math are rejected', () => {
  assert.throws(() => computeCommission(Number.MAX_SAFE_INTEGER, 1500), RangeError);
  // the largest bid whose product with 10000 bps stays safe is accepted
  const max = Math.floor(Number.MAX_SAFE_INTEGER / 10000);
  assert.equal(computeCommission(max, 0).bidCents, max);
  assert.throws(() => computeCommission(max + 1, 0), RangeError);
});

test('commission bps must be an integer between 0 and 10000', () => {
  assert.throws(() => computeCommission(100, -1), RangeError);
  assert.throws(() => computeCommission(100, 10001), RangeError);
  assert.throws(() => computeCommission(100, 1.5), RangeError);
  assert.doesNotThrow(() => computeCommission(100, 10000));
});

test('percent converts to basis points', () => {
  assert.equal(commissionBpsFromPercent(15), 1500);
  assert.equal(commissionBpsFromPercent(12.5), 1250);
  assert.equal(commissionBpsFromPercent(0), 0);
  assert.equal(commissionBpsFromPercent(100), 10000);
  assert.equal(commissionBpsFromPercent(0.01), 1);
});

test('percent outside 0..100, NaN, or finer than a basis point is rejected', () => {
  assert.throws(() => commissionBpsFromPercent(-0.01), RangeError);
  assert.throws(() => commissionBpsFromPercent(100.01), RangeError);
  assert.throws(() => commissionBpsFromPercent(Number.NaN), RangeError);
  assert.throws(() => commissionBpsFromPercent(15.005), RangeError);
});

test('env: unset or blank means the 15% default', () => {
  assert.equal(commissionBpsFromEnv({}), 1500);
  assert.equal(commissionBpsFromEnv({ MARKETPLACE_COMMISSION_PERCENT: '' }), 1500);
  assert.equal(commissionBpsFromEnv({ MARKETPLACE_COMMISSION_PERCENT: '  ' }), 1500);
});

test('env: a configured percent is used', () => {
  assert.equal(commissionBpsFromEnv({ MARKETPLACE_COMMISSION_PERCENT: '20' }), 2000);
  assert.equal(commissionBpsFromEnv({ MARKETPLACE_COMMISSION_PERCENT: ' 7.5 ' }), 750);
});

test('env: garbage is rejected rather than silently defaulted', () => {
  assert.throws(() => commissionBpsFromEnv({ MARKETPLACE_COMMISSION_PERCENT: 'abc' }), RangeError);
  assert.throws(() => commissionBpsFromEnv({ MARKETPLACE_COMMISSION_PERCENT: '15%' }), RangeError);
  assert.throws(() => commissionBpsFromEnv({ MARKETPLACE_COMMISSION_PERCENT: '-5' }), RangeError);
});
