/**
 * The signed-in (Clerk) marketplace user, for the marketplace pages and the web paths of the
 * publish / install / moderation routes. API-key callers use authenticateApiKey instead.
 *
 * Admin = the src/lib/admin.ts allow-list (seed + ADMIN_EMAILS), Clerk publicMetadata.role
 * 'admin', or ADMIN_USER_IDS (same rule as the admin QA tools, src/lib/qa/admin-check.ts).
 * Publishing needs a paid plan, except for admins.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getAdminEmails } from '../admin';
import { isFreePlan } from '../../config/billing.config';
import { planFromClaims, type PlanKey } from '../plans';
import { adminUserIdsFromEnv, isQaAdmin } from '../qa/admin-check';

export interface MarketplaceWebUser {
  userId: string;
  plan: PlanKey;
  isAdmin: boolean;
  canPublish: boolean;
  /** Full name or username; never the email address. */
  displayName: string | null;
}

interface ClerkUserLike {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  emailAddresses?: Array<{ emailAddress: string }>;
  publicMetadata?: Record<string, unknown> | null;
}

export function displayNameOf(user: ClerkUserLike | null): string | null {
  if (!user) return null;
  const full = [user.firstName, user.lastName].filter((s) => s && s.trim()).join(' ').trim();
  return full || user.username?.trim() || null;
}

export async function currentMarketplaceUser(): Promise<MarketplaceWebUser | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;
  let user: ClerkUserLike | null = null;
  try {
    user = (await (await clerkClient()).users.getUser(userId)) as ClerkUserLike;
  } catch {
    user = null;
  }
  const plan = planFromClaims(sessionClaims as Record<string, unknown> | null);
  const isAdmin = isQaAdmin(
    { userId, emails: user?.emailAddresses?.map((e) => e.emailAddress), publicMetadata: user?.publicMetadata ?? null },
    { adminEmails: getAdminEmails(), adminUserIds: adminUserIdsFromEnv() },
  );
  return { userId, plan, isAdmin, canPublish: isAdmin || !isFreePlan(plan), displayName: displayNameOf(user) };
}
