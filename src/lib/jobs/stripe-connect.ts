/**
 * Stripe Connect for providers: Express accounts (EEA/UK/CH only), onboarding and
 * login links, and status sync from `account.updated` or an explicit refresh.
 */
import type Stripe from 'stripe';
import { jobsDb } from './db';
import { JobsError, dbError } from './errors';
import { ensureProviderProfile, getProviderProfile } from './principals';
import { connectStatusFromAccount, isSupportedConnectCountry, type ConnectStatus } from './connect-rules';
import { getStripe, appBaseUrl, stripeFailure } from './stripe';
import { appUrl } from '@/src/lib/notify/urls';
import type { ProviderProfileRow } from './types';

/** Where a provider finishes Stripe Connect onboarding: the Connect card on the hub profile. */
export function connectOnboardingUrl(): string {
  return process.env.JOBS_CONNECT_ONBOARDING_URL || appUrl('hub', '/profile#connect');
}

export interface ConnectStatusView {
  connected: boolean;
  account_id: string | null;
  connect_status: ConnectStatus;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  details_submitted: boolean;
  country: string | null;
}

export interface OnboardResult {
  url: string;
  account_id: string;
  kind: 'onboarding' | 'login';
}

function connectUrls(): { returnUrl: string; refreshUrl: string } {
  const base = appBaseUrl();
  return {
    returnUrl: process.env.STRIPE_CONNECT_RETURN_URL || `${base}/profile?connect=return`,
    refreshUrl: process.env.STRIPE_CONNECT_REFRESH_URL || `${base}/profile?connect=refresh`,
  };
}

function toView(profile: ProviderProfileRow | null): ConnectStatusView {
  return {
    connected: !!profile?.stripe_account_id,
    account_id: profile?.stripe_account_id ?? null,
    connect_status: profile?.connect_status ?? 'none',
    payouts_enabled: profile?.payouts_enabled ?? false,
    charges_enabled: profile?.charges_enabled ?? false,
    details_submitted: profile?.details_submitted ?? false,
    country: profile?.country ?? null,
  };
}

function accountFields(account: Pick<Stripe.Account, 'payouts_enabled' | 'charges_enabled' | 'details_submitted' | 'requirements' | 'country'>) {
  return {
    connect_status: connectStatusFromAccount(account),
    payouts_enabled: account.payouts_enabled === true,
    charges_enabled: account.charges_enabled === true,
    details_submitted: account.details_submitted === true,
    ...(account.country ? { country: account.country.toUpperCase() } : {}),
  };
}

/** Create the provider's Express account if needed and return where to send them. */
export async function startOnboarding(userId: string, rawCountry: string): Promise<OnboardResult> {
  const country = rawCountry.trim().toUpperCase();
  if (!isSupportedConnectCountry(country)) {
    throw new JobsError('unsupported_country', 400, 'Stripe Connect is available for the EEA, the UK and Switzerland');
  }
  let profile = await ensureProviderProfile(userId);
  const stripe = getStripe();

  if (!profile.stripe_account_id) {
    let account: Stripe.Account;
    try {
      account = await stripe.accounts.create(
        {
          type: 'express',
          country,
          capabilities: { transfers: { requested: true } },
          metadata: { clerk_user_id: userId, provider_profile_id: profile.id },
        },
        { idempotencyKey: `connect_account_${profile.id}` },
      );
    } catch (err) {
      throw stripeFailure(err, 'account create');
    }
    const { data, error } = await jobsDb()
      .from('provider_profiles')
      .update({ stripe_account_id: account.id, ...accountFields({ ...account, country }) })
      .eq('id', profile.id)
      .eq('user_id', userId)
      .is('stripe_account_id', null)
      .select('*')
      .maybeSingle();
    if (error) throw dbError(error, 'save connect account');
    if (data) {
      profile = data as ProviderProfileRow;
    } else {
      // A concurrent request linked an account first; use that one.
      profile = (await getProviderProfile(userId))!;
      console.warn(`[jobs] orphan Connect account ${account.id} for ${userId}`);
    }
  }

  const accountId = profile.stripe_account_id!;
  try {
    if (profile.payouts_enabled) {
      const link = await stripe.accounts.createLoginLink(accountId);
      return { url: link.url, account_id: accountId, kind: 'login' };
    }
    const { returnUrl, refreshUrl } = connectUrls();
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    return { url: link.url, account_id: accountId, kind: 'onboarding' };
  } catch (err) {
    throw stripeFailure(err, 'account link');
  }
}

/** Update the profile that owns this account. Returns false if no profile has it. */
export async function syncAccount(
  account: Pick<Stripe.Account, 'id' | 'payouts_enabled' | 'charges_enabled' | 'details_submitted' | 'requirements' | 'country'>,
): Promise<boolean> {
  const { data, error } = await jobsDb()
    .from('provider_profiles')
    .update(accountFields(account))
    .eq('stripe_account_id', account.id)
    .select('id');
  if (error) throw dbError(error, 'sync connect account');
  return (data ?? []).length > 0;
}

export async function getConnectStatus(userId: string, opts: { refresh?: boolean } = {}): Promise<ConnectStatusView> {
  let profile = await getProviderProfile(userId);
  if (opts.refresh && profile?.stripe_account_id) {
    let account: Stripe.Account;
    try {
      account = await getStripe().accounts.retrieve(profile.stripe_account_id);
    } catch (err) {
      throw stripeFailure(err, 'account retrieve');
    }
    await syncAccount(account);
    profile = await getProviderProfile(userId);
  }
  return toView(profile);
}
