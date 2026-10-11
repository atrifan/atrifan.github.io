/**
 * Pure policy for the GitHub PAT a provider hands over with `send_project`.
 * The HTTP side (calls to GITHUB_API_BASE) lives in ./github-pat.ts.
 *
 * Rules:
 *  - fine-grained `github_pat_` tokens only; classic `ghp_` (and other gh?_) tokens are rejected
 *  - the repo must be private (paid work never sits in a public repo), readable (pull),
 *    and the token must not carry admin
 *  - the token must not reach any repo besides the submitted one
 *  - the token must not be expired, and must expire within 30 days (when GitHub reports it)
 */

export const MAX_PAT_LIFETIME_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const PAT_REJECTIONS = [
  'classic_pat',
  'invalid_pat',
  'invalid_repo',
  'public_repo',
  'repo_not_accessible',
  'pat_admin',
  'pat_too_broad',
  'pat_expired',
  'pat_expiry_too_long',
  'invalid_commit_sha',
  'commit_not_found',
  'scope_unverifiable',
] as const;
export type PatRejection = (typeof PAT_REJECTIONS)[number];

const MESSAGES: Record<PatRejection, string> = {
  classic_pat:
    'Classic personal access tokens (ghp_...) are not accepted. Create a fine-grained token (github_pat_...) with read-only Contents access to this one repository.',
  invalid_pat: 'GitHub did not accept this token: it is malformed, revoked or expired. Create a new fine-grained token (github_pat_...).',
  invalid_repo: 'git_repo must be "owner/repo" or a https://github.com/owner/repo URL.',
  public_repo:
    'This repository is public. Paid work must be delivered from a private repository: make it private (or push the work to a new private repo) and submit again.',
  repo_not_accessible: 'The token cannot read this repository. Grant it read access (Contents: read) to the repository you are submitting.',
  pat_admin: 'The token grants admin on the repository. Use a fine-grained token with read-only access (Contents: read, Metadata: read).',
  pat_too_broad:
    'The token reaches other repositories too. Create a fine-grained token with "Only select repositories" set to only the submitted repository.',
  pat_expired: 'The token has expired. Create a new fine-grained token that expires within 30 days.',
  pat_expiry_too_long: `The token expires more than ${MAX_PAT_LIFETIME_DAYS} days from now. Create a fine-grained token that expires within ${MAX_PAT_LIFETIME_DAYS} days.`,
  invalid_commit_sha: 'commit_sha must be 7 to 40 hexadecimal characters.',
  commit_not_found: 'That commit does not exist in the repository (or the token cannot see it).',
  scope_unverifiable: 'GitHub would not list the repositories this token can reach, so its scope cannot be checked. Use a fine-grained token limited to this one repository.',
};

export function patRejectionMessage(reason: PatRejection): string {
  return MESSAGES[reason];
}

/** null when the token looks like a fine-grained PAT. The token itself is never echoed. */
export function checkTokenFormat(token: string): PatRejection | null {
  if (typeof token !== 'string') return 'invalid_pat';
  const t = token.trim();
  if (/^gh[pousr]_/.test(t)) return 'classic_pat';
  if (!/^github_pat_[A-Za-z0-9_]{20,245}$/.test(t)) return 'invalid_pat';
  return null;
}

export interface RepoRef {
  owner: string;
  repo: string;
  fullName: string;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,98}[A-Za-z0-9])?$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** Parse `owner/repo`, `https://github.com/owner/repo(.git)` or `git@github.com:owner/repo.git`. */
export function parseRepoRef(input: string): RepoRef | null {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  const ssh = s.match(/^git@github\.com:(.+)/);
  if (ssh) {
    s = ssh[1];
  } else {
    const url = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)/i);
    if (url) s = url[1];
    else if (s.includes(':') || s.includes('github.com')) return null;
  }
  s = s.replace(/\/$/, '').replace(/\.git$/, '');
  const parts = s.split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!OWNER.test(owner) || !NAME.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo, fullName: `${owner}/${repo}` };
}

/**
 * Parse `github-authentication-token-expiration` ("2026-10-20 12:30:45 UTC" or with a
 * "+0130"-style offset). `present` is false when the header is missing.
 */
export function parseExpirationHeader(value: string | null | undefined): { present: boolean; expiresAt: Date | null } {
  if (!value) return { present: false, expiresAt: null };
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (UTC|[+-]\d{4})$/);
  if (!m) return { present: true, expiresAt: null };
  const offset = m[3] === 'UTC' ? 'Z' : `${m[3].slice(0, 3)}:${m[3].slice(3)}`;
  const date = new Date(`${m[1]}T${m[2]}${offset}`);
  return { present: true, expiresAt: Number.isNaN(date.getTime()) ? null : date };
}

/** Expired, or living longer than `maxDays`. A missing expiry cannot be judged and passes. */
export function checkExpiry(expiresAt: Date | null, now: Date, maxDays = MAX_PAT_LIFETIME_DAYS): PatRejection | null {
  if (!expiresAt) return null;
  if (expiresAt.getTime() <= now.getTime()) return 'pat_expired';
  if (expiresAt.getTime() - now.getTime() > maxDays * DAY_MS) return 'pat_expiry_too_long';
  return null;
}

export interface GithubRepoInfo {
  full_name?: string;
  private?: boolean;
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
}

/** `GET /repos/{o}/{r}` as seen with the token: private, pull, no admin. */
export function checkRepo(repo: GithubRepoInfo): PatRejection | null {
  if (repo.private !== true) return 'public_repo';
  if (repo.permissions?.pull !== true) return 'repo_not_accessible';
  if (repo.permissions.admin === true) return 'pat_admin';
  return null;
}

/** The repos the token can list must be only the target (case-insensitive). */
export function checkScope(listed: Array<{ full_name?: string }>, targetFullName: string): PatRejection | null {
  const target = targetFullName.toLowerCase();
  const other = listed.some((r) => r.full_name?.toLowerCase() !== target);
  return other ? 'pat_too_broad' : null;
}

/** null when not given; 'invalid' when malformed; otherwise the lower-cased SHA. */
export function normalizeShaInput(sha: string | null | undefined): string | null | 'invalid' {
  if (sha === null || sha === undefined) return null;
  const s = sha.trim();
  if (!s) return null;
  return /^[0-9a-fA-F]{7,40}$/.test(s) ? s.toLowerCase() : 'invalid';
}
