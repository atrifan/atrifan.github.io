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
  client ??= new Stripe(key, fakeHost());
  return client;
}

/** STRIPE_API_BASE (tests only) points the SDK at a local fake instead of api.stripe.com. */
function fakeHost(): ConstructorParameters<typeof Stripe>[1] {
  const base = process.env.STRIPE_API_BASE;
  if (!base) return undefined;
  const url = new URL(base);
  return {
    host: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    protocol: url.protocol === 'https:' ? 'https' : 'http',
    maxNetworkRetries: 0,
  };
}
