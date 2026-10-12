/**
 * Who is looking at a gigs page (server components only). Same identity rules as the gigs
 * API routes (src/lib/jobs/http.ts): the Playwright test identity header when it is
 * enabled (never in production builds), otherwise the Clerk session.
 */
import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { e2eUser } from '../http';
import { isAdminUserId } from '../../admin';
import { surfaceUrl } from '../../surface-url';

export async function currentUserId(): Promise<string | null> {
  const testUser = e2eUser(new Request('http://gigs.local', { headers: headers() }));
  if (testUser) return testUser;
  const { userId } = await auth();
  return userId ?? null;
}

/** The signed-in user, or a redirect to the hub's sign-in page that comes back to `gigsPath`. */
export async function requireUserId(gigsPath: string): Promise<string> {
  const userId = await currentUserId();
  if (userId) return userId;
  const back = surfaceUrl('gigs', gigsPath);
  redirect(`${surfaceUrl('hub', '/sign-in')}?redirect_url=${encodeURIComponent(back)}`);
}

/**
 * Admin by the src/lib/admin.ts rule. The e2e identity has no Clerk user, so for it only
 * ADMIN_USER_IDS counts.
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const e2e = !!e2eUser(new Request('http://gigs.local', { headers: headers() }));
  return isAdminUserId(userId, e2e ? { lookup: null } : {});
}
