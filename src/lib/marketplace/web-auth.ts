/**
 * The signed-in (Clerk) marketplace user, for the marketplace pages and the web paths of the
 * publish / install / moderation routes. API-key callers use authenticateApiKey instead.
 *
 * Admin = the rule in src/lib/admin.ts (verified admin email, Clerk role, or ADMIN_USER_IDS), the
 * same one every admin check uses.
 * Publishing needs a paid plan, except for admins.
 */
import { auth, clerkClient } from '@clerk/nextjs/server';
import { isAdminSubject, type AdminEmailAddress } from '../admin';
import { isFreePlan } from '../../config/billing.config';
import { planFromClaims, type PlanKey } from '../plans';

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
  emailAddresses?: AdminEmailAddress[];
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
  const isAdmin = isAdminSubject({ ...user, id: userId });
  return { userId, plan, isAdmin, canPublish: isAdmin || !isFreePlan(plan), displayName: displayNameOf(user) };
}
