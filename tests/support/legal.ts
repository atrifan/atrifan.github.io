import type { Page } from '@playwright/test';

/**
 * Shared data for the legal page specs (tests/e2e/legal-*.spec.ts, tests/a11y/legal.a11y.spec.ts,
 * tests/visual/legal.visual.spec.ts). Behaviour only: taken from the legal pages contract.
 */

export const LEGAL_INDEX = { path: '/legal', h1: 'Legal' } as const;

/** The seven documents behind the shared legal layout, in the order the contract lists them. */
export const LEGAL_DOCS = [
  { path: '/legal/terms', h1: 'Terms and conditions', name: 'legal-terms' },
  { path: '/legal/payments', h1: 'Payments, credits and refunds', name: 'legal-payments' },
  { path: '/legal/disclaimers', h1: 'Disclaimers', name: 'legal-disclaimers' },
  { path: '/legal/acceptable-use', h1: 'Acceptable use policy', name: 'legal-acceptable-use' },
  { path: '/legal/marketplace-publishers', h1: 'Terms for publishers and providers', name: 'legal-marketplace-publishers' },
  { path: '/legal/complaints', h1: 'Complaints and reports', name: 'legal-complaints' },
  { path: '/legal/imprint', h1: 'Imprint', name: 'legal-imprint' },
] as const;

export const LEGAL_PAGES = [{ ...LEGAL_INDEX, name: 'legal' }, ...LEGAL_DOCS] as const;

export const LEGAL_VERSION = '1.0';
export const LEGAL_DATE = '12 October 2026';
export const CONTACT_EMAIL = 'support@tulzo.online';

export const IUBENDA_PRIVACY = 'https://www.iubenda.com/privacy-policy/11077306';
export const IUBENDA_COOKIES = 'https://www.iubenda.com/privacy-policy/11077306/cookie-policy';

/** Defaults when JOBS_AUTO_ACCEPT_DAYS / JOBS_POST_ACCEPT_CLAIM_DAYS / MARKETPLACE_COMMISSION_PERCENT are unset. */
export const JOBS_AUTO_ACCEPT_DAYS = 7;
export const JOBS_POST_ACCEPT_CLAIM_DAYS = 14;
export const MARKETPLACE_COMMISSION_PERCENT = 15;

export const DISPUTE_CLAIM_LINE = `Disputes: until you accept the delivery (automatic after ${JOBS_AUTO_ACCEPT_DAYS} days). Claims: within ${JOBS_POST_ACCEPT_CLAIM_DAYS} days of acceptance.`;

export const CREDITS_CONSENT_LABEL =
  'I want immediate access and acknowledge I lose my 14-day right of withdrawal once credits are delivered.';
export const SUBSCRIPTION_CONSENT_LABEL =
  'I want immediate access and acknowledge I lose my 14-day right of withdrawal once credits or services are delivered.';
export const GIGS_CONSENT_LABEL =
  'I want the work to start right away and acknowledge I lose my 14-day right of withdrawal for the platform service once it starts.';

/** A bracketed placeholder such as "[COUNTRY]" or "[REGISTERED ADDRESS]". */
export const PLACEHOLDER = /\[[A-Z][A-Z .]+\]/;

/** Complaint reference, e.g. TZ-7K3M-Q9PX (Crockford base32, no I/L/O/U). */
export const REFERENCE = /^TZ-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
export const REFERENCE_IN_TEXT = /TZ-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/;

export const COMPLAINT_CATEGORIES = [
  'Payment or refund',
  'Gigs dispute',
  'Marketplace content',
  'Illegal content notice',
  'Account',
  'Privacy',
  'Other',
] as const;

export const GOOD_FAITH_LABEL = 'I believe in good faith that the information in this notice is accurate and complete.';

/** The canonical link's href. */
export async function canonicalHref(page: Page): Promise<string | null> {
  return page.locator('link[rel="canonical"]').getAttribute('href');
}
