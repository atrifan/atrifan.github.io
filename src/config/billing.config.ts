/**
 * Billing Configuration
 *
 * Controls whether billing/pricing features are enabled.
 * Set NEXT_PUBLIC_ENABLE_BILLING=true in .env to enable pricing page and upgrade banners.
 */

export const BILLING_CONFIG = {
  /**
   * Whether billing features are enabled.
   * When false, hides:
   * - Pricing link in navigation
   * - Upgrade to Pro banners
   * - Subscription management links
   */
  enabled: process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true',
};

/**
 * Check if billing features should be displayed
 */
export const isBillingEnabled = (): boolean => BILLING_CONFIG.enabled;

/**
 * Plan Rankings
 *
 * Numeric rankings for plan comparison.
 * Higher number = more features/access.
 */
export const PLAN_RANKINGS = {
  free: 0,
  pro: 1,
  plus: 2,
} as const;

export type PlanName = keyof typeof PLAN_RANKINGS;

/**
 * Get the numeric rank for a plan name
 */
export const getPlanRank = (plan: string): number => {
  const normalizedPlan = plan.toLowerCase() as PlanName;
  return PLAN_RANKINGS[normalizedPlan] ?? PLAN_RANKINGS.free;
};

/**
 * Check if user's plan is higher or equal to target plan
 * @param userPlan - The user's current plan
 * @param targetPlan - The plan to compare against
 * @returns true if userPlan >= targetPlan
 */
export const isHigherOrEqualTo = (userPlan: string, targetPlan: PlanName): boolean => {
  return getPlanRank(userPlan) >= PLAN_RANKINGS[targetPlan];
};

/**
 * Check if user's plan is lower or equal to target plan
 * @param userPlan - The user's current plan
 * @param targetPlan - The plan to compare against
 * @returns true if userPlan <= targetPlan
 */
export const isLowerOrEqualTo = (userPlan: string, targetPlan: PlanName): boolean => {
  return getPlanRank(userPlan) <= PLAN_RANKINGS[targetPlan];
};

/**
 * Check if a user's plan meets the minimum required plan level
 * @param userPlan - The user's current plan
 * @param requiredPlan - The minimum required plan
 * @returns true if user has access, false otherwise
 * @deprecated Use isHigherOrEqualTo instead
 */
export const hasPlanAccess = (userPlan: string, requiredPlan: PlanName): boolean => {
  return isHigherOrEqualTo(userPlan, requiredPlan);
};

/**
 * Check if user has Pro or higher plan access
 */
export const hasProAccess = (userPlan: string): boolean => {
  return isHigherOrEqualTo(userPlan, 'pro');
};

/**
 * Check if user is on free plan
 */
export const isFreePlan = (userPlan: string): boolean => {
  return getPlanRank(userPlan) === PLAN_RANKINGS.free;
};

