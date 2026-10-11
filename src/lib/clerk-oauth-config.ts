/**
 * Clerk OAuth configuration, read from env only. There are deliberately no
 * hard-coded fallbacks: a missing value means the deploy is misconfigured, and
 * callers answer 500 `{ error: 'server_misconfigured' }` (see src/lib/misconfigured.ts).
 */

type Env = Record<string, string | undefined>;

/** A hostname with a `clerk` label that isn't the last one. */
const CLERK_HOST_RE = /^([a-z0-9-]+\.)*clerk\.[a-z0-9-]+(\.[a-z0-9-]+)*$/i;

/**
 * Clerk frontend API origin. Decoded from the publishable key
 * (`pk_(test|live)_<base64("<host>$")>`), else `CLERK_HOST`, else null.
 */
export function resolveClerkFrontendApi(env: Env): string | null {
  const publishableKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (publishableKey) {
    const base64Part = publishableKey.replace(/^pk_(test|live)_/, '');
    const decoded = Buffer.from(base64Part, 'base64').toString('utf-8').replace(/\$+$/, '');
    // Dev instances decode to `<slug>.clerk.accounts.dev`, production ones to `clerk.<domain>`.
    if (CLERK_HOST_RE.test(decoded)) return `https://${decoded}`;
  }
  return env.CLERK_HOST || null;
}

export interface ClerkOAuthClient {
  clientId: string;
  clientSecret?: string;
}

/** The Clerk OAuth app credentials, or null when a required value is unset. */
export function resolveClerkOAuthClient(env: Env, opts: { requireSecret: boolean }): ClerkOAuthClient | null {
  const clientId = env.NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID;
  if (!clientId) return null;
  if (!opts.requireSecret) return { clientId };
  const clientSecret = env.CLERK_OAUTH_CLIENT_SECRET;
  if (!clientSecret) return null;
  return { clientId, clientSecret };
}
