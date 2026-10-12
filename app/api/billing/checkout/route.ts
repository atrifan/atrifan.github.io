import { NextRequest, NextResponse } from 'next/server';

import { getStripe } from '@/src/lib/stripe';
import { MISCONFIGURED } from '@/src/lib/misconfigured';
import { checkoutReturnUrls, validateTopUp } from '@/src/lib/credits';
import { formatCredits } from '@/src/lib/format';
import { sessionUserId } from '@/src/lib/session-user';
import { CONSENT_REQUIRED, hasWithdrawalConsent } from '@/src/lib/legal/consent';
import { consentMetadata, recordConsent } from '@/src/lib/legal/consent-service';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';

/** Shown above Stripe's pay button. */
function topUpCheckoutMessage(): string {
  return `Credits are non-refundable and have no cash value. Terms: ${absoluteSurfaceUrl('hub', '/legal/payments')}`;
}

/**
 * POST { amount, withdrawal_consent: true } (whole USD, 5 to 500) → { url } of a Stripe Checkout
 * session for a credit top-up. One line item: the credits. There is no separate processing fee;
 * the 1.3x usage markup covers payment costs. Stripe returns the buyer to hub /credits.
 * The billing webhook credits `metadata.rawDepositAmount` (USD) to the balance.
 *
 * The buyer must waive the 14-day withdrawal right first (src/lib/legal/consent.ts): without
 * `withdrawal_consent: true` → 400 consent_required. The consent is recorded before the session
 * is created and its id, the terms version and the flag go into the session metadata; the
 * "non-refundable" notice is shown above the pay button (custom_text.submit).
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json(MISCONFIGURED, { status: 500 });

  const userId = await sessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { amount?: unknown; withdrawal_consent?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON: { amount }' }, { status: 400 });
  }

  const topUp = validateTopUp(body?.amount);
  if (!topUp.ok) return NextResponse.json({ error: topUp.error }, { status: 400 });
  if (!hasWithdrawalConsent(body)) return NextResponse.json(CONSENT_REQUIRED, { status: 400 });

  let consent;
  try {
    consent = await recordConsent({ userId, purchase: 'credits', amountCents: topUp.amountUsd * 100, currency: 'usd' });
  } catch (err) {
    console.error('[billing/checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'consent_not_recorded' }, { status: 503 });
  }

  const { successUrl, cancelUrl } = checkoutReturnUrls();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Tulzo credits: ${formatCredits(topUp.credits)}`,
              description: 'Non-refundable, no cash value, not transferable. Purchased credits never expire.',
            },
            unit_amount: topUp.amountUsd * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        clerkUserId: userId,
        rawDepositAmount: topUp.amountUsd.toFixed(2),
        credits: String(topUp.credits),
        ...consentMetadata(consent),
      },
      custom_text: { submit: { message: topUpCheckoutMessage() } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing/checkout] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 502 });
  }
}
