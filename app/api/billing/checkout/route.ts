import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const amount = body.amount;

    if (!amount || typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 500) {
      return NextResponse.json({ error: 'Invalid amount. Must be an integer between 1 and 500.' }, { status: 400 });
    }

    const baseAmountCents = amount * 100;
    const feeCents = Math.round(amount * 0.10 * 100);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'AI Assistant Token Pool Pack' },
            unit_amount: baseAmountCents,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'usd',
            product_data: { name: 'Payment Network Processing Fee' },
            unit_amount: feeCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        clerkUserId: userId,
        rawDepositAmount: amount.toFixed(2),
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL}/dashboard?billing=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL}/dashboard?billing=canceled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing/checkout] Error:', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
