/**
 * Who counts as a QA admin. Pure.
 *
 * Admin if any of: an email in the admin allow-list (src/lib/admin.ts: seed + ADMIN_EMAILS),
 * Clerk `publicMetadata.role === 'admin'`, or the user id in ADMIN_USER_IDS
 * (comma-separated Clerk user ids; also how the e2e suite names its admin).
 */

export interface AdminSubject {
  userId: string;
  emails?: Array<string | null | undefined>;
  publicMetadata?: Record<string, unknown> | null;
}

export interface AdminPolicy {
  adminEmails: readonly string[];
  adminUserIds: readonly string[];
}

export function adminUserIdsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isQaAdmin(subject: AdminSubject, policy: AdminPolicy): boolean {
  if (subject.userId && policy.adminUserIds.includes(subject.userId)) return true;
  if (subject.publicMetadata?.role === 'admin') return true;
  const admins = policy.adminEmails.map((e) => e.toLowerCase());
  return (subject.emails ?? []).some((e) => !!e && admins.includes(e.toLowerCase()));
}
