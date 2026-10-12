/**
 * The right-of-withdrawal waiver. Digital content and services start immediately, so under the
 * Consumer Rights Directive 2011/83/EU (art. 16(m), and art. 16(a) for services) a consumer only
 * loses the 14-day withdrawal right after giving prior express consent and acknowledging the loss.
 * The checkout UIs show these exact texts as an unticked checkbox; the APIs refuse without
 * `withdrawal_consent: true` (400 consent_required) and record the consent. Pure.
 */

export const CONSENT_PURCHASES = ['credits', 'subscription', 'gig_contract'] as const;
export type ConsentPurchase = (typeof CONSENT_PURCHASES)[number];

export const CONSENT_TEXT: Record<ConsentPurchase, string> = {
  credits: 'I want immediate access and acknowledge I lose my 14-day right of withdrawal once credits are delivered.',
  subscription:
    'I want immediate access and acknowledge I lose my 14-day right of withdrawal once credits or services are delivered.',
  gig_contract:
    'I want the work to start right away and acknowledge I lose my 14-day right of withdrawal for the platform service once it starts.',
};

export const CONSENT_REQUIRED = { error: 'consent_required' } as const;
export const CONSENT_REQUIRED_MESSAGE = 'Confirm the right-of-withdrawal statement first.';

export function isConsentPurchase(value: unknown): value is ConsentPurchase {
  return (CONSENT_PURCHASES as readonly unknown[]).includes(value);
}

/** Only the literal `true` counts: "true", 1 or a missing field are not consent. */
export function hasWithdrawalConsent(body: unknown): boolean {
  return !!body && typeof body === 'object' && (body as Record<string, unknown>).withdrawal_consent === true;
}
