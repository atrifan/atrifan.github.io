/**
 * Plans as Clerk knows them, for the credit-grant cron's fallback. Pure.
 *
 * plan_subscriptions only has users whose Clerk Billing webhook reached us. The cron also asks
 * Clerk: a user's `publicMetadata.plan` (set by an admin or the dashboard) first, and for users
 * without one, their Clerk Billing subscription (`billing.getUserBillingSubscription`).
 */
import { PLAN_KEYS, normalizePlan, type PlanKey } from '../plans';

export interface ClerkUserLike {
  id: string;
  publicMetadata?: Record<string, unknown> | null;
  /** ms since epoch */
  createdAt?: number | null;
}

export interface ClerkBillingLike {
  status?: string | null;
  activeAt?: number | null;
  createdAt?: number | null;
  subscriptionItems?: Array<{ status?: string | null; periodStart?: number | null; plan?: { slug?: string | null } | null }> | null;
}

const ACTIVE = new Set(['active', 'trialing', 'past_due']);
const rank = (p: PlanKey) => PLAN_KEYS.indexOf(p);
const date = (ms: number | null | undefined) => (typeof ms === 'number' ? new Date(ms) : null);

export function planFromClerkUser(user: ClerkUserLike): PlanKey {
  return normalizePlan(user.publicMetadata?.plan);
}

/** The best paid plan of an active Clerk Billing subscription, or null. */
export function planFromClerkBilling(sub: ClerkBillingLike | null | undefined): { plan: PlanKey; anchor: Date | null } | null {
  if (!sub || !ACTIVE.has(sub.status ?? '')) return null;
  let best: { plan: PlanKey; periodStart: number | null } | null = null;
  for (const item of sub.subscriptionItems ?? []) {
    if (!ACTIVE.has(item.status ?? '')) continue;
    const plan = normalizePlan(item.plan?.slug);
    if (plan === 'free' || (best && rank(plan) <= rank(best.plan))) continue;
    best = { plan, periodStart: item.periodStart ?? null };
  }
  if (!best) return null;
  return { plan: best.plan, anchor: date(best.periodStart) ?? date(sub.activeAt) ?? date(sub.createdAt) };
}

export interface ClerkGrantCandidates {
  /** Paid per publicMetadata.plan: grant, anchored on when the user signed up. */
  grants: Array<{ userId: string; plan: PlanKey; anchor: Date | null }>;
  /** No plan in metadata: ask Clerk Billing. */
  lookups: string[];
}

/** Users the cron should grant (or look up), skipping those plan_subscriptions already covers. */
export function clerkGrantCandidates(users: readonly ClerkUserLike[], covered: ReadonlySet<string>): ClerkGrantCandidates {
  const out: ClerkGrantCandidates = { grants: [], lookups: [] };
  for (const user of users) {
    if (covered.has(user.id)) continue;
    const plan = planFromClerkUser(user);
    if (plan !== 'free') out.grants.push({ userId: user.id, plan, anchor: date(user.createdAt) });
    else if (user.publicMetadata?.plan === undefined) out.lookups.push(user.id);
  }
  return out;
}
