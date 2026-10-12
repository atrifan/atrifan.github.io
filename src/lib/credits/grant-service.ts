/**
 * Monthly plan credits: the grant ledger (credit_grants + balance_transactions rows of type
 * plan_grant / plan_expiry) on top of the one USD balance in user_budgets.
 *
 * Granted once per user per monthly period, from the Clerk subscription webhook
 * (active / renewed) and, as a fallback for missed webhooks, by the daily
 * app/api/cron/credit-grants. The cron covers plan_subscriptions and also asks Clerk for paid
 * users it has no subscription row for (publicMetadata.plan, else Clerk Billing; see
 * ./clerk-plans.ts) who have no grant for the current period. The previous grant's unused remainder expires at the next grant;
 * grants whose period ended without a renewal expire in the cron. Bought credits never expire.
 * The math is in ./grants.ts; the SQL functions apply it atomically, guarded on the balance
 * the math was computed from (a concurrent spend makes it retry).
 */
import { clerkClient } from '@clerk/nextjs/server';
import { jobsDb } from '../jobs/db';
import { JobsError, dbError } from '../jobs/errors';
import { creditValueUsdFromEnv } from '../../config/qa.config';
import type { PlanKey } from '../plans';
import { grantRemainingCredits, monthlyCreditsFor, monthlyPeriod, planGrant, type MonthlyPeriod } from './grants';
import { clerkGrantCandidates, planFromClerkBilling, type ClerkBillingLike, type ClerkUserLike } from './clerk-plans';

interface GrantRow {
  id: string;
  user_id: string;
  period: string;
  period_start: string;
  period_end: string;
  plan: PlanKey;
  credits: number | string;
  credit_value_usd: number | string;
  balance_after_usd: number | string;
  expired_credits: number | string | null;
  expired_at: string | null;
  created_at: string;
  source: 'webhook' | 'cron';
}

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const ACTIVE = new Set(['active', 'trialing', 'past_due']);
const MAX_ATTEMPTS = 3;

export function isPaidPlan(plan: PlanKey): plan is 'pro' | 'plus' | 'super' {
  return monthlyCreditsFor(plan) > 0;
}

async function balanceUsd(userId: string): Promise<number> {
  const { data, error } = await jobsDb().from('user_budgets').select('remaining_balance').eq('user_id', userId).maybeSingle();
  if (error) throw dbError(error, 'read balance');
  return n((data as { remaining_balance?: string } | null)?.remaining_balance);
}

async function latestGrant(userId: string, beforePeriod?: string): Promise<GrantRow | null> {
  let q = jobsDb().from('credit_grants').select('*').eq('user_id', userId).order('period_start', { ascending: false }).limit(1);
  if (beforePeriod) q = q.lt('period', beforePeriod);
  const { data, error } = await q.maybeSingle();
  if (error) throw dbError(error, 'latest grant');
  return data as GrantRow | null;
}

/** Bought credits (top-ups) added since a grant, in credits. */
async function inflowCreditsSince(grant: GrantRow): Promise<number> {
  const { data, error } = await jobsDb()
    .from('balance_transactions')
    .select('amount')
    .eq('user_id', grant.user_id)
    .eq('type', 'deposit')
    .gt('created_at', grant.created_at);
  if (error) throw dbError(error, 'inflows since grant');
  const usd = ((data ?? []) as Array<{ amount: string | number }>).reduce((s, r) => s + n(r.amount), 0);
  return usd / n(grant.credit_value_usd);
}

async function ledgerState(grant: GrantRow, balanceNowUsd: number) {
  const value = n(grant.credit_value_usd);
  return {
    grantCredits: n(grant.credits),
    balanceAfterGrantCredits: n(grant.balance_after_usd) / value,
    inflowCreditsSinceGrant: await inflowCreditsSince(grant),
    balanceNowCredits: balanceNowUsd / value,
    alreadyExpired: grant.expired_at !== null,
  };
}

export type GrantOutcome =
  | { status: 'granted'; grant_id: string; period: string; credits: number; expired_usd: number }
  | { status: 'duplicate'; period: string }
  | { status: 'skipped'; reason: 'free_plan' };

/** Grant `plan`'s credits for the monthly period containing `now` (anchored on `anchor`). Idempotent. */
export async function grantForPeriod(input: { userId: string; plan: PlanKey; anchor: Date | null; now?: Date; source: 'webhook' | 'cron' }): Promise<GrantOutcome> {
  const now = input.now ?? new Date();
  if (!isPaidPlan(input.plan)) return { status: 'skipped', reason: 'free_plan' };
  const period: MonthlyPeriod = monthlyPeriod(input.anchor ?? now, now);
  const creditValue = creditValueUsdFromEnv();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const balance = await balanceUsd(input.userId);
    const previous = await latestGrant(input.userId, period.key);
    const ledger = previous ? await ledgerState(previous, balance) : null;
    const plan = planGrant({ plan: input.plan, balanceNowCredits: balance / creditValue, previous: ledger });
    const { data, error } = await jobsDb().rpc('apply_credit_grant', {
      p_user_id: input.userId,
      p_period: period.key,
      p_period_start: period.start,
      p_period_end: period.end,
      p_plan: input.plan,
      p_credits: plan.grantCredits,
      p_credit_value_usd: creditValue,
      p_source: input.source,
      p_previous_grant_id: previous?.id ?? null,
      p_expire_credits: plan.expireCredits,
      p_expected_balance_usd: balance,
    });
    if (error) throw dbError(error, 'apply credit grant');
    const r = data as { ok: boolean; duplicate?: boolean; grant_id?: string; expired_usd?: number; error?: string };
    if (r.ok && r.duplicate) return { status: 'duplicate', period: period.key };
    if (r.ok) return { status: 'granted', grant_id: r.grant_id as string, period: period.key, credits: plan.grantCredits, expired_usd: n(r.expired_usd) };
    if (r.error !== 'balance_changed') throw new JobsError('db_error', 500, `Credit grant failed: ${r.error}`);
  }
  throw new JobsError('db_error', 500, 'The balance kept changing; the credit grant will be retried by the cron');
}

/** Expire grants whose period ended (no renewal, or a downgrade). Returns how many expired. */
export async function expireEndedGrants(now: Date = new Date(), limit = 500): Promise<number> {
  const { data, error } = await jobsDb()
    .from('credit_grants')
    .select('*')
    .is('expired_at', null)
    .lte('period_end', now.toISOString())
    .order('period_end', { ascending: true })
    .limit(limit);
  if (error) throw dbError(error, 'ended grants');
  let expired = 0;
  for (const grant of (data ?? []) as GrantRow[]) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const balance = await balanceUsd(grant.user_id);
      const state = await ledgerState(grant, balance);
      const credits = grantRemainingCredits(state);
      const { data: res, error: rpcError } = await jobsDb().rpc('expire_credit_grant', {
        p_grant_id: grant.id,
        p_expire_credits: credits,
        p_expected_balance_usd: balance,
      });
      if (rpcError) throw dbError(rpcError, 'expire grant');
      const r = res as { ok: boolean; error?: string };
      if (r.ok) {
        expired += 1;
        break;
      }
      if (r.error !== 'balance_changed') break;
    }
  }
  return expired;
}

/** Keep the subscription state the cron needs (plan, status, billing anchor). */
export async function recordSubscription(input: { userId: string; plan: PlanKey; status: string; anchor: Date | null; subscriptionId: string | null }): Promise<void> {
  const { error } = await jobsDb()
    .from('plan_subscriptions')
    .upsert(
      {
        user_id: input.userId,
        plan: input.plan,
        status: input.status,
        period_anchor: input.anchor ? input.anchor.toISOString() : null,
        clerk_subscription_id: input.subscriptionId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error) throw dbError(error, 'record subscription');
}

/** Clerk subscription webhook: remember it, and grant this period's credits when it is active. */
export async function onSubscriptionEvent(input: { userId: string; plan: PlanKey; status: string | undefined; anchor: Date | null; subscriptionId: string | null; now?: Date }): Promise<GrantOutcome | null> {
  const status = input.status ?? 'active';
  await recordSubscription({ userId: input.userId, plan: input.plan, status, anchor: input.anchor, subscriptionId: input.subscriptionId });
  if (!ACTIVE.has(status) || !isPaidPlan(input.plan)) return null;
  return grantForPeriod({ userId: input.userId, plan: input.plan, anchor: input.anchor, now: input.now, source: 'webhook' });
}

const CLERK_PAGE = 100;
const CLERK_MAX_USERS = 5000;
const CLERK_MAX_BILLING_LOOKUPS = 200;

/** Every Clerk user (id, publicMetadata, createdAt), up to CLERK_MAX_USERS. */
async function clerkUsers(): Promise<ClerkUserLike[]> {
  const client = await clerkClient();
  const out: ClerkUserLike[] = [];
  for (let offset = 0; offset < CLERK_MAX_USERS; offset += CLERK_PAGE) {
    const page = (await client.users.getUserList({ limit: CLERK_PAGE, offset, orderBy: '+created_at' })) as unknown as
      | { data: ClerkUserLike[] }
      | ClerkUserLike[];
    const users = Array.isArray(page) ? page : page.data;
    out.push(...users.map((u) => ({ id: u.id, publicMetadata: u.publicMetadata ?? null, createdAt: u.createdAt ?? null })));
    if (users.length < CLERK_PAGE) break;
  }
  return out;
}

async function clerkBilling(userId: string): Promise<ClerkBillingLike | null> {
  try {
    const client = (await clerkClient()) as unknown as { billing?: { getUserBillingSubscription(id: string): Promise<ClerkBillingLike> } };
    if (!client.billing) return null;
    return await client.billing.getUserBillingSubscription(userId);
  } catch {
    return null; // no subscription (404), or billing not enabled
  }
}

export interface ClerkFallbackRun {
  granted: number;
  duplicates: number;
  errors: number;
}

/**
 * Paid users per Clerk that plan_subscriptions doesn't cover: grant the current period unless
 * they already have a live grant. The cycle is anchored on the Clerk Billing period start,
 * else the previous grant, else when the user signed up.
 */
async function grantFromClerk(covered: ReadonlySet<string>, now: Date): Promise<ClerkFallbackRun> {
  const out: ClerkFallbackRun = { granted: 0, duplicates: 0, errors: 0 };
  let users: ClerkUserLike[];
  try {
    users = await clerkUsers();
  } catch (err) {
    console.error('[credits] Clerk user list failed:', err instanceof Error ? err.message : 'error');
    out.errors += 1;
    return out;
  }
  const { grants, lookups } = clerkGrantCandidates(users, covered);
  const due: Array<{ userId: string; plan: PlanKey; anchor: Date | null }> = [...grants];
  for (const userId of lookups.slice(0, CLERK_MAX_BILLING_LOOKUPS)) {
    const found = planFromClerkBilling(await clerkBilling(userId));
    if (found) due.push({ userId, ...found });
  }
  for (const c of due) {
    try {
      const last = await latestGrant(c.userId);
      if (last && !last.expired_at && new Date(last.period_end).getTime() > now.getTime()) {
        out.duplicates += 1;
        continue;
      }
      const anchor = c.anchor ?? (last ? new Date(last.period_start) : null);
      const r = await grantForPeriod({ userId: c.userId, plan: c.plan, anchor, now, source: 'cron' });
      if (r.status === 'granted') out.granted += 1;
      else if (r.status === 'duplicate') out.duplicates += 1;
    } catch (err) {
      out.errors += 1;
      console.error('[credits] Clerk fallback grant failed:', err instanceof Error ? err.message : 'error');
    }
  }
  return out;
}

/**
 * The daily cron: grant missing periods for active paid subscriptions, then for paid users per
 * Clerk that have no subscription row, then expire ended grants.
 */
export async function runGrantCron(now: Date = new Date()): Promise<{ granted: number; duplicates: number; expired: number; errors: number; clerk: ClerkFallbackRun }> {
  const { data, error } = await jobsDb().from('plan_subscriptions').select('*').in('status', Array.from(ACTIVE)).neq('plan', 'free').limit(5000);
  if (error) throw dbError(error, 'active subscriptions');
  let granted = 0;
  let duplicates = 0;
  let errors = 0;
  for (const sub of (data ?? []) as Array<{ user_id: string; plan: PlanKey; period_anchor: string | null }>) {
    try {
      const r = await grantForPeriod({ userId: sub.user_id, plan: sub.plan, anchor: sub.period_anchor ? new Date(sub.period_anchor) : null, now, source: 'cron' });
      if (r.status === 'granted') granted += 1;
      else if (r.status === 'duplicate') duplicates += 1;
    } catch (err) {
      errors += 1;
      console.error('[credits] cron grant failed:', err instanceof Error ? err.message : 'error');
    }
  }
  // Any plan_subscriptions row (cancelled ones too) means Clerk's webhook reached us and is the
  // source of truth for that user; the Clerk fallback covers only users we never heard about.
  const { data: known, error: knownError } = await jobsDb().from('plan_subscriptions').select('user_id').limit(20000);
  if (knownError) throw dbError(knownError, 'known subscriptions');
  const clerk = await grantFromClerk(new Set(((known ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)), now);
  const expired = await expireEndedGrants(now);
  return { granted: granted + clerk.granted, duplicates: duplicates + clerk.duplicates, expired, errors: errors + clerk.errors, clerk };
}

export interface GrantView {
  plan: PlanKey | null;
  monthly_credits: number;
  current: { period: string; period_start: string; period_end: string; credits: number; remaining_credits: number; plan: PlanKey } | null;
  history: Array<{ period: string; plan: PlanKey; credits: number; expired_credits: number | null; expired_at: string | null; created_at: string }>;
}

/** What hub /credits shows: this period's grant and how much of it is left, plus past grants. */
export async function creditGrantView(userId: string, now: Date = new Date()): Promise<GrantView> {
  const [subRes, grantsRes] = await Promise.all([
    jobsDb().from('plan_subscriptions').select('plan, status').eq('user_id', userId).maybeSingle(),
    jobsDb().from('credit_grants').select('*').eq('user_id', userId).order('period_start', { ascending: false }).limit(12),
  ]);
  if (subRes.error) throw dbError(subRes.error, 'subscription view');
  if (grantsRes.error) throw dbError(grantsRes.error, 'grants view');
  const sub = subRes.data as { plan: PlanKey; status: string } | null;
  const grants = (grantsRes.data ?? []) as GrantRow[];
  const live = grants.find((g) => !g.expired_at && new Date(g.period_end).getTime() > now.getTime());
  let current: GrantView['current'] = null;
  if (live) {
    const state = await ledgerState(live, await balanceUsd(userId));
    current = {
      period: live.period,
      period_start: live.period_start,
      period_end: live.period_end,
      credits: n(live.credits),
      remaining_credits: grantRemainingCredits(state),
      plan: live.plan,
    };
  }
  const plan = sub && ACTIVE.has(sub.status) ? sub.plan : null;
  return {
    plan,
    monthly_credits: plan ? monthlyCreditsFor(plan) : 0,
    current,
    history: grants.map((g) => ({
      period: g.period,
      plan: g.plan,
      credits: n(g.credits),
      expired_credits: g.expired_credits === null ? null : n(g.expired_credits),
      expired_at: g.expired_at,
      created_at: g.created_at,
    })),
  };
}
