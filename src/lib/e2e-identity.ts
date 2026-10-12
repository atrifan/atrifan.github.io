/**
 * The gigs Playwright identity header (`x-e2e-user` + `x-e2e-secret`, see src/lib/jobs/http.ts
 * e2eUser) for the middleware, which runs on the edge runtime without node:crypto. Same rules:
 * never when NODE_ENV is 'production' (`next build` inlines it, so production bundles never take
 * this path) and only with a JOBS_E2E_AUTH_SECRET of 16+ characters. It only lets the request past
 * the middleware's sign-in redirect; the page still decides who the user is and what they may see.
 */

/** Compares every character, so the time taken doesn't reveal how much of the secret matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function e2eIdentity(
  headers: { get(name: string): string | null },
  env: Record<string, string | undefined> = { NODE_ENV: process.env.NODE_ENV, JOBS_E2E_AUTH_SECRET: process.env.JOBS_E2E_AUTH_SECRET },
): string | null {
  if (env.NODE_ENV === 'production') return null;
  const secret = env.JOBS_E2E_AUTH_SECRET;
  if (!secret || secret.length < 16) return null;
  const user = headers.get('x-e2e-user');
  const given = headers.get('x-e2e-secret');
  if (!user || !given || !constantTimeEqual(given, secret)) return null;
  return user;
}
