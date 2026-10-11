import Stripe from 'stripe';

let client: Stripe | null = null;

/**
 * Lazily built Stripe client. Constructing it at module load made `next build`
 * fail whenever STRIPE_SECRET_KEY was absent (CI, previews). Returns null when
 * the key is unset; callers answer 500 `{ error: 'server_misconfigured' }`.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}
