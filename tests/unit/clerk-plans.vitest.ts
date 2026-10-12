import { describe, expect, it } from 'vitest';
import { clerkGrantCandidates, planFromClerkBilling, planFromClerkUser } from '@/src/lib/credits/clerk-plans';

const T = Date.UTC(2026, 8, 3, 10, 0, 0);

describe('planFromClerkUser', () => {
  it.each([
    [{ plan: 'pro' }, 'pro'],
    [{ plan: 'u:super' }, 'super'],
    [{ plan: 'PLUS' }, 'plus'],
    [{ plan: 'free_user' }, 'free'],
    [{ plan: 'gold' }, 'free'],
    [{ plan: 3 }, 'free'],
    [{}, 'free'],
    [null, 'free'],
    [undefined, 'free'],
  ])('publicMetadata %o → %s', (meta, plan) => {
    expect(planFromClerkUser({ id: 'u', publicMetadata: meta as Record<string, unknown> | null | undefined })).toBe(plan);
  });
});

describe('planFromClerkBilling', () => {
  it('the best active item wins, anchored on its period start', () => {
    expect(
      planFromClerkBilling({
        status: 'active',
        activeAt: T - 1000,
        subscriptionItems: [
          { status: 'active', periodStart: T - 500, plan: { slug: 'pro' } },
          { status: 'active', periodStart: T, plan: { slug: 'super' } },
          { status: 'ended', periodStart: T + 1, plan: { slug: 'plus' } },
        ],
      }),
    ).toEqual({ plan: 'super', anchor: new Date(T) });
  });

  it('a better plan listed first still wins; on a tie the first item is kept', () => {
    expect(
      planFromClerkBilling({
        status: 'active',
        subscriptionItems: [
          { status: 'active', periodStart: T, plan: { slug: 'super' } },
          { status: 'active', periodStart: T + 5, plan: { slug: 'pro' } },
        ],
      }),
    ).toEqual({ plan: 'super', anchor: new Date(T) });
    expect(
      planFromClerkBilling({
        status: 'active',
        subscriptionItems: [
          { status: 'active', periodStart: T, plan: { slug: 'pro' } },
          { status: 'active', periodStart: T + 5, plan: { slug: 'pro' } },
        ],
      })?.anchor,
    ).toEqual(new Date(T));
  });

  it('items that are not active are ignored', () => {
    expect(planFromClerkBilling({ status: 'active', subscriptionItems: [{ status: 'ended', periodStart: T, plan: { slug: 'pro' } }] })).toBeNull();
    expect(planFromClerkBilling({ status: 'active', subscriptionItems: [{ periodStart: T, plan: { slug: 'pro' } }] })).toBeNull();
  });

  it.each(['trialing', 'past_due', 'active'])('%s items count', (status) => {
    expect(planFromClerkBilling({ status: 'active', subscriptionItems: [{ status, periodStart: T, plan: { slug: 'plus' } }] })?.plan).toBe('plus');
  });

  it('falls back to activeAt, then createdAt, for the anchor', () => {
    expect(planFromClerkBilling({ status: 'active', activeAt: T, createdAt: T - 9, subscriptionItems: [{ status: 'active', plan: { slug: 'pro' } }] })?.anchor).toEqual(new Date(T));
    expect(planFromClerkBilling({ status: 'active', activeAt: null, createdAt: T - 9, subscriptionItems: [{ status: 'active', plan: { slug: 'pro' } }] })?.anchor).toEqual(new Date(T - 9));
    expect(planFromClerkBilling({ status: 'active', subscriptionItems: [{ status: 'active', plan: { slug: 'pro' } }] })?.anchor).toBeNull();
  });

  it('null for no subscription, an inactive one, or only free items', () => {
    expect(planFromClerkBilling(null)).toBeNull();
    expect(planFromClerkBilling({ status: 'canceled', subscriptionItems: [{ status: 'active', plan: { slug: 'pro' } }] })).toBeNull();
    expect(planFromClerkBilling({ status: 'active', subscriptionItems: [{ status: 'active', plan: { slug: 'free_user' } }] })).toBeNull();
    expect(planFromClerkBilling({ status: 'active', subscriptionItems: [] })).toBeNull();
    expect(planFromClerkBilling({ status: 'active' })).toBeNull();
    expect(planFromClerkBilling({ status: 'active', subscriptionItems: [{ status: 'active', plan: null }] })).toBeNull();
  });
});

describe('clerkGrantCandidates', () => {
  const users = [
    { id: 'meta_pro', publicMetadata: { plan: 'pro' }, createdAt: T - 100 },
    { id: 'covered', publicMetadata: { plan: 'super' }, createdAt: T },
    { id: 'free', publicMetadata: { plan: 'free' }, createdAt: T },
    { id: 'nothing', publicMetadata: {}, createdAt: T },
    { id: 'no_meta', createdAt: T },
  ];

  it('paid metadata plans not already covered are granted, anchored on sign-up; the rest need a billing lookup', () => {
    expect(clerkGrantCandidates(users, new Set(['covered']))).toEqual({
      grants: [{ userId: 'meta_pro', plan: 'pro', anchor: new Date(T - 100) }],
      lookups: ['nothing', 'no_meta'],
    });
  });

  it('an explicit free plan in metadata is not looked up', () => {
    expect(clerkGrantCandidates([{ id: 'f', publicMetadata: { plan: 'free_user' } }], new Set()).lookups).toEqual([]);
  });

  it('covered users are skipped entirely; no createdAt → no anchor', () => {
    expect(clerkGrantCandidates([{ id: 'a', publicMetadata: { plan: 'plus' } }, { id: 'b' }], new Set(['b']))).toEqual({
      grants: [{ userId: 'a', plan: 'plus', anchor: null }],
      lookups: [],
    });
  });
});
