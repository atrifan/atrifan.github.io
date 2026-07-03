import { currentUser } from '@clerk/nextjs/server';

/**
 * Admin allow-list = built-in seed + any emails in the ADMIN_EMAILS env var
 * (comma-separated). This lets more people be granted admin (marketplace
 * moderation, package uploads) without a code change.
 */
const SEED_ADMIN_EMAILS = ['trifan.alex.criss@gmail.com'];

function getAdminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...SEED_ADMIN_EMAILS.map(e => e.toLowerCase()), ...fromEnv]));
}

/** Check whether any of the given email addresses is an admin. */
export function isAdminEmail(emails: Array<string | undefined | null>): boolean {
  const admins = getAdminEmails();
  return emails.some(e => !!e && admins.includes(e.toLowerCase()));
}

/**
 * Synchronous admin check for a Clerk user object already in hand
 * (e.g. from currentUser() in a route that also needs the user).
 */
export function isAdminUser(
  user: { emailAddresses?: Array<{ emailAddress: string }> } | null | undefined
): boolean {
  if (!user?.emailAddresses) return false;
  return isAdminEmail(user.emailAddresses.map(e => e.emailAddress));
}

export async function isAdmin(): Promise<boolean> {
  const user = await currentUser();
  return isAdminUser(user);
}
