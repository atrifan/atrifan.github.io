import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QA_CHECKS,
  DEFAULT_QA_COSTS,
  qaCostsFromEnv,
  creditValueUsdFromEnv,
  autoAcceptDaysFromEnv,
  REVIEW_KEY_TTL_HOURS,
} from '../../src/config/qa.config.ts';
import {
  normalizeChecks,
  computeReserve,
  creditsToUsd,
  usdToCredits,
  remainingCredits,
  meterCall,
  settleReserve,
} from '../../src/lib/qa/qa-credits.ts';

test('default check caps are 60/150/300/450/600/900 credits', () => {
  assert.deepEqual([...QA_CHECKS], ['basic', 'deep_requirements', 'code_review', 'security', 'journey', 'adversarial']);
  assert.deepEqual(DEFAULT_QA_COSTS, {
    basic: 60, deep_requirements: 150, code_review: 300, security: 450, journey: 600, adversarial: 900,
  });
  assert.deepEqual(qaCostsFromEnv({}), DEFAULT_QA_COSTS);
  assert.equal(REVIEW_KEY_TTL_HOURS, 24);
});

test('each cap is overridable with QA_COST_<CHECK>; invalid values throw', () => {
  const costs = qaCostsFromEnv({ QA_COST_BASIC: '80', QA_COST_CODE_REVIEW: '250', QA_COST_DEEP_REQUIREMENTS: ' 10 ' });
  assert.equal(costs.basic, 80);
  assert.equal(costs.code_review, 250);
  assert.equal(costs.deep_requirements, 10);
  assert.equal(costs.security, 450);
  assert.deepEqual(qaCostsFromEnv({ QA_COST_SECURITY: '' }), DEFAULT_QA_COSTS);
  assert.equal(qaCostsFromEnv({ QA_COST_JOURNEY: '0' }).journey, 0);
  for (const bad of ['-1', 'abc', '1.5', 'Infinity']) {
    assert.throws(() => qaCostsFromEnv({ QA_COST_ADVERSARIAL: bad }), /QA_COST_ADVERSARIAL/);
  }
});

test('CREDIT_VALUE_USD defaults to 0.01 and must be positive', () => {
  assert.equal(creditValueUsdFromEnv({}), 0.01);
  assert.equal(creditValueUsdFromEnv({ CREDIT_VALUE_USD: '' }), 0.01);
  assert.equal(creditValueUsdFromEnv({ CREDIT_VALUE_USD: '0.02' }), 0.02);
  for (const bad of ['0', '-0.01', 'x']) {
    assert.throws(() => creditValueUsdFromEnv({ CREDIT_VALUE_USD: bad }), /CREDIT_VALUE_USD/);
  }
});

test('JOBS_AUTO_ACCEPT_DAYS defaults to 7', () => {
  assert.equal(autoAcceptDaysFromEnv({}), 7);
  assert.equal(autoAcceptDaysFromEnv({ JOBS_AUTO_ACCEPT_DAYS: '3' }), 3);
  assert.throws(() => autoAcceptDaysFromEnv({ JOBS_AUTO_ACCEPT_DAYS: '0' }), /JOBS_AUTO_ACCEPT_DAYS/);
  assert.throws(() => autoAcceptDaysFromEnv({ JOBS_AUTO_ACCEPT_DAYS: 'two' }), /JOBS_AUTO_ACCEPT_DAYS/);
});

test('normalizeChecks always includes basic, drops unknowns and duplicates, keeps canonical order', () => {
  assert.deepEqual(normalizeChecks(null), ['basic']);
  assert.deepEqual(normalizeChecks(undefined), ['basic']);
  assert.deepEqual(normalizeChecks([]), ['basic']);
  assert.deepEqual(normalizeChecks(['security', 'code_review', 'security', 'nope', 7, 'basic']), ['basic', 'code_review', 'security']);
  assert.deepEqual(normalizeChecks(['adversarial', 'journey', 'deep_requirements']), ['basic', 'deep_requirements', 'journey', 'adversarial']);
});

test('the platform pays basic; the customer reserves the deeper checks', () => {
  assert.deepEqual(computeReserve(['basic'], DEFAULT_QA_COSTS), { platformCredits: 60, customerCredits: 0, capCredits: 60 });
  assert.deepEqual(computeReserve(['basic', 'code_review', 'security'], DEFAULT_QA_COSTS), {
    platformCredits: 60, customerCredits: 750, capCredits: 810,
  });
  assert.deepEqual(computeReserve([...QA_CHECKS], DEFAULT_QA_COSTS), { platformCredits: 60, customerCredits: 2400, capCredits: 2460 });
  // basic is always counted even if the list omits it
  assert.deepEqual(computeReserve(['journey'], { ...DEFAULT_QA_COSTS, basic: 10 }), { platformCredits: 10, customerCredits: 600, capCredits: 610 });
});

test('credits convert to dollars at CREDIT_VALUE_USD, rounded to 4 decimals', () => {
  assert.equal(creditsToUsd(300, 0.01), 3);
  assert.equal(creditsToUsd(0.01, 0.01), 0.0001);
  assert.equal(creditsToUsd(123.45, 0.01), 1.2345);
  assert.equal(creditsToUsd(1, 0.02), 0.02);
  assert.equal(creditsToUsd(0, 0.01), 0);
});

test('dollars convert to credits rounded UP to 0.01 credit, so no call is free', () => {
  assert.equal(usdToCredits(3, 0.01), 300);
  assert.equal(usdToCredits(0.000001, 0.01), 0.01);
  assert.equal(usdToCredits(0.0123, 0.01), 1.23);
  assert.equal(usdToCredits(0.01231, 0.01), 1.24);
  assert.equal(usdToCredits(0, 0.01), 0);
  assert.equal(usdToCredits(-1, 0.01), 0);
  assert.equal(usdToCredits(0.07, 0.01), 7); // float noise (0.07/0.01 = 7.000000000000001) is not rounded up
  assert.equal(usdToCredits(1, 0.02), 50);
});

test('remainingCredits never goes below zero', () => {
  assert.equal(remainingCredits(60, 0), 60);
  assert.equal(remainingCredits(60, 59.5), 0.5);
  assert.equal(remainingCredits(60, 60), 0);
  assert.equal(remainingCredits(60, 75), 0);
});

test('meterCall charges up to the cap and reports exhaustion', () => {
  assert.deepEqual(meterCall(100, 0, 30), { charged: 30, used: 30, exhausted: false });
  assert.deepEqual(meterCall(100, 90, 30), { charged: 10, used: 100, exhausted: true });
  assert.deepEqual(meterCall(100, 70, 30), { charged: 30, used: 100, exhausted: true });
  assert.deepEqual(meterCall(100, 100, 5), { charged: 0, used: 100, exhausted: true });
  assert.deepEqual(meterCall(100, 10, 0), { charged: 0, used: 10, exhausted: false });
  assert.deepEqual(meterCall(100, 10, -3), { charged: 0, used: 10, exhausted: false });
  assert.deepEqual(meterCall(0.3, 0.1, 0.1), { charged: 0.1, used: 0.2, exhausted: false });
});

test('settleReserve: platform covers usage up to basic, the customer pays the rest, the unused reserve is released', () => {
  assert.deepEqual(settleReserve({ platformCredits: 60, customerCredits: 750, usedCredits: 0 }), {
    usedCredits: 0, platformCharged: 0, customerCharged: 0, customerReleased: 750,
  });
  assert.deepEqual(settleReserve({ platformCredits: 60, customerCredits: 750, usedCredits: 40 }), {
    usedCredits: 40, platformCharged: 40, customerCharged: 0, customerReleased: 750,
  });
  assert.deepEqual(settleReserve({ platformCredits: 60, customerCredits: 750, usedCredits: 60 }), {
    usedCredits: 60, platformCharged: 60, customerCharged: 0, customerReleased: 750,
  });
  assert.deepEqual(settleReserve({ platformCredits: 60, customerCredits: 750, usedCredits: 260.25 }), {
    usedCredits: 260.25, platformCharged: 60, customerCharged: 200.25, customerReleased: 549.75,
  });
  assert.deepEqual(settleReserve({ platformCredits: 60, customerCredits: 750, usedCredits: 810 }), {
    usedCredits: 810, platformCharged: 60, customerCharged: 750, customerReleased: 0,
  });
  // over-run (concurrent calls past the cap) is never charged to the customer beyond the reserve
  assert.deepEqual(settleReserve({ platformCredits: 60, customerCredits: 750, usedCredits: 900 }), {
    usedCredits: 900, platformCharged: 150, customerCharged: 750, customerReleased: 0,
  });
  assert.deepEqual(settleReserve({ platformCredits: 60, customerCredits: 0, usedCredits: 70 }), {
    usedCredits: 70, platformCharged: 70, customerCharged: 0, customerReleased: 0,
  });
});

test('blank env values fall back to defaults; 1 auto-accept day is allowed', () => {
  assert.equal(creditValueUsdFromEnv({ CREDIT_VALUE_USD: '   ' }), 0.01);
  assert.equal(creditValueUsdFromEnv({ CREDIT_VALUE_USD: ' 0.05 ' }), 0.05);
  assert.equal(autoAcceptDaysFromEnv({ JOBS_AUTO_ACCEPT_DAYS: '   ' }), 7);
  assert.equal(autoAcceptDaysFromEnv({ JOBS_AUTO_ACCEPT_DAYS: '1' }), 1);
});
