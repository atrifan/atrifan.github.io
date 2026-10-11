import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

import { getStripe } from '@/src/lib/stripe';
import { MISCONFIGURED } from '@/src/lib/misconfigured';
import { checkoutReturnUrls, validateTopUp } from '@/src/lib/credits';
import { formatCredits } from '@/src/lib/format';

/**
 * POST { amount } (whole USD, 5 to 500) → { url } of a Stripe Checkout session for a
 * credit top-up. One line item: the credits. There is no separate processing fee; the
 * 1.3x usage markup covers payment costs. Stripe returns the buyer to hub /credits.
 * The billing webhook credits `metadata.rawDepositAmount` (USD) to the balance.
 */
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json(MISCONFIGURED, { status: 500 });

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { amount?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON: { amount }' }, { status: 400 });
  }

  const topUp = validateTopUp(body?.amount);
  if (!topUp.ok) return NextResponse.json({ error: topUp.error }, { status: 400 });

  const { successUrl, cancelUrl } = checkoutReturnUrls();
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `Tulzo credits: ${formatCredits(topUp.credits)}` },
            unit_amount: topUp.amountUsd * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        clerkUserId: userId,
        rawDepositAmount: topUp.amountUsd.toFixed(2),
        credits: String(topUp.credits),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing/checkout] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 502 });
  }
}
