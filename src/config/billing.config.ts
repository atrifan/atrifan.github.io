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

