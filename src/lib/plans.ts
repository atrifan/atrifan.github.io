/**
 * Plan keys, in rank order. These match the Clerk Billing plan keys,
 * except Clerk's free plan key is `free_user`.
 */
export const PLAN_KEYS = ['free', 'pro', 'plus', 'super'] as const;

export type PlanKey = (typeof PLAN_KEYS)[number];

const ALIASES: Record<string, PlanKey> = {
  free_user: 'free',
};

/**
 * Normalize a plan value from Clerk (session claim `pla` such as "u:super",
 * a plan key, or metadata) to one of our plan keys. Anything unknown is free.
 */
export function normalizePlan(raw: unknown): PlanKey {
  if (typeof raw !== 'string') return 'free';
  let value = raw.trim().toLowerCase();
  const colon = value.indexOf(':');
  if (colon !== -1) value = value.slice(colon + 1);
  if (value in ALIASES) return ALIASES[value];
  return (PLAN_KEYS as readonly string[]).includes(value) ? (value as PlanKey) : 'free';
}

/**
 * Read the plan from Clerk session claims (`pla`).
 */
export function planFromClaims(sessionClaims: Record<string, unknown> | null | undefined): PlanKey {
  return normalizePlan(sessionClaims?.pla);
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

interface SubscriptionLike {
  plan_id?: unknown;
  plan?: { slug?: unknown } | null;
  items?: Array<{ status?: unknown; plan?: { slug?: unknown } | null }> | null;
}

/**
 * Resolve the plan from a Clerk Billing subscription webhook payload.
 * Clerk sends plan details per subscription item; older payloads carry a
 * single plan_id/plan. The highest-ranked active item wins; unknown is free.
 */
export function planFromSubscription(data: SubscriptionLike | null | undefined): PlanKey {
  if (!data) return 'free';
  if (Array.isArray(data.items) && data.items.length > 0) {
    let best: PlanKey = 'free';
    for (const item of data.items) {
      if (typeof item?.status !== 'string' || !ACTIVE_STATUSES.has(item.status)) continue;
      const plan = normalizePlan(item.plan?.slug);
      if (PLAN_KEYS.indexOf(plan) > PLAN_KEYS.indexOf(best)) best = plan;
    }
    return best;
  }
  const fromSlug = normalizePlan(data.plan?.slug);
  if (fromSlug !== 'free') return fromSlug;
  return normalizePlan(data.plan_id);
}
