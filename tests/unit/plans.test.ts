import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlan, planFromClaims, planFromSubscription, PLAN_KEYS } from '../../src/lib/plans.ts';

test('known Clerk plan keys map to themselves', () => {
  assert.equal(normalizePlan('pro'), 'pro');
  assert.equal(normalizePlan('plus'), 'plus');
  assert.equal(normalizePlan('super'), 'super');
  assert.equal(normalizePlan('free'), 'free');
});

test('Clerk free_user key is free', () => {
  assert.equal(normalizePlan('free_user'), 'free');
});

test('user/org scoped claim "u:super" and "o:plus" are parsed', () => {
  assert.equal(normalizePlan('u:super'), 'super');
  assert.equal(normalizePlan('o:plus'), 'plus');
  assert.equal(normalizePlan('u:free_user'), 'free');
});

test('case and whitespace are ignored', () => {
  assert.equal(normalizePlan(' Super '), 'super');
  assert.equal(normalizePlan('U:PRO'), 'pro');
});

test('unknown, empty and non-string values fall back to free', () => {
  assert.equal(normalizePlan('enterprise'), 'free');
  assert.equal(normalizePlan(''), 'free');
  assert.equal(normalizePlan(undefined), 'free');
  assert.equal(normalizePlan(null), 'free');
  assert.equal(normalizePlan(42), 'free');
  assert.equal(normalizePlan('u:'), 'free');
});

test('planFromClaims reads the pla claim', () => {
  assert.equal(planFromClaims({ pla: 'u:super' }), 'super');
  assert.equal(planFromClaims({ pla: 'u:pro' }), 'pro');
  assert.equal(planFromClaims({}), 'free');
  assert.equal(planFromClaims(null), 'free');
  assert.equal(planFromClaims(undefined), 'free');
});

test('PLAN_KEYS lists every plan in rank order', () => {
  assert.deepEqual([...PLAN_KEYS], ['free', 'pro', 'plus', 'super']);
});

test('planFromSubscription reads plan_id or slug, unknown is free', () => {
  assert.equal(planFromSubscription({ plan_id: 'super' }), 'super');
  assert.equal(planFromSubscription({ plan: { slug: 'plus' } }), 'plus');
  assert.equal(planFromSubscription({ plan_id: 'cplan_x', plan: { slug: 'pro' } }), 'pro');
  assert.equal(planFromSubscription({ plan_id: 'cplan_unknown' }), 'free');
  assert.equal(planFromSubscription({}), 'free');
});

test('planFromSubscription picks the highest active item', () => {
  assert.equal(
    planFromSubscription({
      items: [
        { status: 'ended', plan: { slug: 'super' } },
        { status: 'active', plan: { slug: 'pro' } },
        { status: 'active', plan: { slug: 'free_user' } },
      ],
    }),
    'pro',
  );
  assert.equal(planFromSubscription({ items: [{ status: 'upcoming', plan: { slug: 'plus' } }] }), 'free');
  assert.equal(planFromSubscription({ items: [{ status: 'trialing', plan: { slug: 'plus' } }] }), 'plus');
});
