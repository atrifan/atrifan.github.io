import Stripe from 'stripe';
import { JobsError } from './errors';

/**
 * Stripe client for gigs. `STRIPE_API_BASE` (tests only) points the SDK at a local fake
 * or stripe-mock instead of api.stripe.com.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new JobsError('stripe_not_configured', 503, 'Stripe is not configured');
  const base = process.env.STRIPE_API_BASE;
  if (base) {
    const url = new URL(base);
    return new Stripe(key, {
      host: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      protocol: url.protocol === 'https:' ? 'https' : 'http',
      maxNetworkRetries: 0,
    });
  }
  return new Stripe(key);
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
}

export function stripeFailure(err: unknown, context: string): JobsError {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[jobs] Stripe ${context} failed:`, message);
  return new JobsError('stripe_error', 502, `Stripe ${context} failed`);
}
