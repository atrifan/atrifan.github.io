import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { isJobsEvent, processJobsStripeEvent } from '@/src/lib/jobs/stripe-webhooks';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function getSupabase() {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Verify against the platform webhook secret, then the Connect endpoint secret if one is
 * configured (Connect events such as account.updated may come from a separate endpoint).
 */
function verifyEvent(body: string, signature: string): Stripe.Event {
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(
    (s): s is string => !!s
  );
  let lastError: unknown = new Error('No webhook secret configured');
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = verifyEvent(body, signature);
    } catch (err) {
      console.error('[billing/webhook] Signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Gigs: contract checkouts (metadata.kind=contract), Connect accounts, refunds, disputes.
    // Idempotent through stripe_events. Credit top-ups fall through to the code below unchanged.
    if (isJobsEvent(event)) {
      const result = await processJobsStripeEvent(event);
      return NextResponse.json(
        result.duplicate ? { received: true, duplicate: true } : { received: true },
        { status: 200 }
      );
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const clerkUserId = session.metadata?.clerkUserId;
      const rawDepositAmount = session.metadata?.rawDepositAmount;

      if (!clerkUserId || !rawDepositAmount) {
        console.error('[billing/webhook] Missing metadata in session:', session.id);
        return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
      }

      const supabase = getSupabase();
      const { error } = await supabase.rpc('increment_user_balance', {
        target_user_id: clerkUserId,
        amount_to_add: parseFloat(rawDepositAmount),
      });

      if (error) {
        console.error('[billing/webhook] Failed to increment balance:', error);
        return NextResponse.json({ error: 'Database error' }, { status: 500 });
      }

      await supabase.from('balance_transactions').insert({
        user_id: clerkUserId,
        type: 'deposit',
        amount: parseFloat(rawDepositAmount),
        stripe_session_id: session.id,
        description: `AI Token Pool - $${rawDepositAmount}`,
      });

      console.log(`[billing/webhook] Deposited $${rawDepositAmount} for user ${clerkUserId}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[billing/webhook] Unexpected error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
