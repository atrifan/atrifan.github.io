/**
 * Stripe Connect rules. Pure.
 *
 * The platform is an EU Stripe account using Express accounts with separate charges
 * and transfers. Until cross-border payouts are checked in the Stripe dashboard,
 * onboarding is limited to the EEA, the UK and Switzerland.
 */

export const SUPPORTED_CONNECT_COUNTRIES = [
  // EU 27
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // rest of the EEA
  'IS', 'LI', 'NO',
  // UK and Switzerland
  'GB', 'CH',
] as const;
export type ConnectCountry = (typeof SUPPORTED_CONNECT_COUNTRIES)[number];

export function isSupportedConnectCountry(country: string): country is ConnectCountry {
  return (SUPPORTED_CONNECT_COUNTRIES as readonly string[]).includes(country.toUpperCase());
}

export type ConnectStatus = 'none' | 'pending' | 'restricted' | 'enabled' | 'disabled';

export interface AccountLike {
  payouts_enabled?: boolean | null;
  charges_enabled?: boolean | null;
  details_submitted?: boolean | null;
  requirements?: { disabled_reason?: string | null } | null;
}

/**
 * - disabled:   Stripe rejected the account (`requirements.disabled_reason` = rejected.*)
 * - enabled:    payouts are enabled
 * - restricted: details were submitted, or Stripe gave a disabled reason, but no payouts yet
 * - pending:    onboarding not finished
 */
export function connectStatusFromAccount(account: AccountLike): ConnectStatus {
  const reason = account.requirements?.disabled_reason ?? null;
  if (reason && reason.startsWith('rejected')) return 'disabled';
  if (account.payouts_enabled === true) return 'enabled';
  if (account.details_submitted === true || reason) return 'restricted';
  return 'pending';
}
