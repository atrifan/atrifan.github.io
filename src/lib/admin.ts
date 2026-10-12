/**
 * Who is an admin: the one rule every admin check calls (hub admin pages, the admin QA MCP,
 * marketplace moderation and package uploads, gigs admin, admin notification recipients).
 *
 * A user is an admin if any of these holds:
 *  1. Primary: one of their **verified** email addresses is in the seed list below or in
 *     ADMIN_EMAILS (comma-separated), compared case-insensitively. Unverified addresses never count.
 *  2. Fallback: Clerk `publicMetadata.role === 'admin'` (Clerk dashboard → user → Metadata → Public
 *     `{"role":"admin"}`).
 *  3. Their Clerk user id is in ADMIN_USER_IDS (comma-separated; also how the gigs e2e runner names its
 *     admin, since the e2e identity header has no Clerk user to look up).
 *
 * The rule itself is pure; Clerk is only called by isAdmin and the default `lookup` of isAdminUserId.
 */

import { clerkClient, currentUser } from '@clerk/nextjs/server';

const SEED_ADMIN_EMAILS = ['trifan.alex.criss@gmail.com'];

type Env = Record<string, string | undefined>;

export interface AdminEmailAddress {
  emailAddress: string;
  verification?: { status?: string | null } | null;
}

/** The parts of a Clerk user the rule reads. */
export interface AdminSubject {
  id?: string | null;
  emailAddresses?: readonly AdminEmailAddress[] | null;
  publicMetadata?: Record<string, unknown> | null;
}

/** A row of user_contacts (synced from Clerk). */
export interface AdminContact {
  userId: string;
  email: string | null;
  emailVerified: boolean;
}

function list(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Seed + ADMIN_EMAILS, lowercased and deduplicated. */
export function getAdminEmails(env: Env = process.env): string[] {
  return Array.from(new Set([...SEED_ADMIN_EMAILS, ...list(env.ADMIN_EMAILS)].map((e) => e.toLowerCase())));
}

export function adminUserIdsFromEnv(env: Env = process.env): string[] {
  return list(env.ADMIN_USER_IDS);
}

function isAdminAddress(email: string | null | undefined, env: Env): boolean {
  return !!email && getAdminEmails(env).includes(email.toLowerCase());
}

function hasAdminUserId(id: string | null | undefined, env: Env): boolean {
  return !!id && adminUserIdsFromEnv(env).includes(id);
}

/** The admin rule for a Clerk user (or anything shaped like one). */
export function isAdminSubject(subject: AdminSubject | null | undefined, env: Env = process.env): boolean {
  if (!subject) return false;
  const verifiedAdminEmail = (subject.emailAddresses ?? []).some(
    (e) => e.verification?.status === 'verified' && isAdminAddress(e.emailAddress, env),
  );
  return verifiedAdminEmail || subject.publicMetadata?.role === 'admin' || hasAdminUserId(subject.id, env);
}

/** Sync check for a Clerk user already in hand (e.g. from currentUser()). */
export function isAdminUser(user: AdminSubject | null | undefined): boolean {
  return isAdminSubject(user);
}

export type AdminLookup = (userId: string) => Promise<AdminSubject | null>;

async function clerkLookup(userId: string): Promise<AdminSubject | null> {
  return (await (await clerkClient()).users.getUser(userId)) as AdminSubject;
}

/**
 * Admin check by user id. ADMIN_USER_IDS answers without a lookup; otherwise the user is looked up
 * (Clerk by default) and the rule applied. `lookup: null` (the e2e identity) means ids only.
 */
export async function isAdminUserId(
  userId: string,
  { lookup = clerkLookup, env = process.env }: { lookup?: AdminLookup | null; env?: Env } = {},
): Promise<boolean> {
  if (!userId) return false;
  if (hasAdminUserId(userId, env)) return true;
  if (!lookup) return false;
  try {
    const user = await lookup(userId);
    return isAdminSubject(user ? { ...user, id: userId } : null, env);
  } catch (err) {
    console.error('[admin] user lookup failed:', err instanceof Error ? err.message : 'error');
    return false;
  }
}

/** Is the signed-in Clerk user an admin? */
export async function isAdmin(): Promise<boolean> {
  return isAdminSubject((await currentUser()) as AdminSubject | null);
}

/**
 * Everyone to notify as an admin: ADMIN_USER_IDS, contacts with a verified admin email, and the given
 * Clerk users (those known from user_contacts) that match the rule, which covers the role fallback.
 */
export function adminRecipientIds({
  contacts,
  users,
  env = process.env,
}: {
  contacts: readonly AdminContact[];
  users: readonly AdminSubject[];
  env?: Env;
}): string[] {
  const ids = new Set(adminUserIdsFromEnv(env));
  for (const c of contacts) if (c.emailVerified && isAdminAddress(c.email, env)) ids.add(c.userId);
  for (const u of users) if (u.id && isAdminSubject(u, env)) ids.add(u.id);
  return Array.from(ids);
}
