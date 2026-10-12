/**
 * Who is looking at a gigs page (server components only). Same identity rules as the gigs
 * API routes (src/lib/jobs/http.ts): the Playwright test identity header when it is
 * enabled (never in production builds), otherwise the Clerk session.
 */
import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { e2eUser } from '../http';
import { getAdminEmails } from '../../admin';
import { adminUserIdsFromEnv, isQaAdmin } from '../../qa/admin-check';
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

/** Admin by ADMIN_USER_IDS, the admin e-mail allow-list or Clerk publicMetadata.role (src/lib/qa/admin-check.ts). */
export async function isAdminUser(userId: string): Promise<boolean> {
  const policy = { adminEmails: getAdminEmails(), adminUserIds: adminUserIdsFromEnv() };
  if (isQaAdmin({ userId }, policy)) return true;
  if (e2eUser(new Request('http://gigs.local', { headers: headers() }))) return false;
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    return isQaAdmin(
      {
        userId,
        emails: (user.emailAddresses ?? []).map((e: { emailAddress: string }) => e.emailAddress),
        publicMetadata: (user.publicMetadata ?? {}) as Record<string, unknown>,
      },
      policy,
    );
  } catch {
    return false;
  }
}
