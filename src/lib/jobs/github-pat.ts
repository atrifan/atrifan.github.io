/**
 * Check a provider's GitHub PAT against the submitted repo and pin the commit, via the
 * GitHub REST API at GITHUB_API_BASE (default https://api.github.com; tests point it at a
 * fake). The pure rules live in ./github-pat-policy.ts.
 *
 * Calls, in order: GET /repos/{o}/{r} (private, pull; admin is recorded as ownerAdmin; the response's
 * `github-authentication-token-expiration` header gives the expiry), GET /user/repos
 * (the token must not list any other repo), GET /repos/{o}/{r}/commits/{sha|default branch}.
 *
 * The token is only ever sent in the Authorization header; it never appears in errors or logs.
 */
import { JobsError } from './errors';
import {
  checkExpiry,
  checkRepo,
  checkScope,
  checkTokenFormat,
  isOwnerAdmin,
  normalizeShaInput,
  parseExpirationHeader,
  parseRepoRef,
  patRejectionMessage,
  type GithubRepoInfo,
  type PatRejection,
} from './github-pat-policy';

export interface VerifiedPat {
  repoFullName: string;
  commitSha: string;
  defaultBranch: string;
  /** null when GitHub reported no expiry for the token. */
  expiresAt: Date | null;
  /** GitHub reports the user as an admin of the repo (their role, not the token's). */
  ownerAdmin: boolean;
}

const MAX_REPO_PAGES = 5;
const TIMEOUT_MS = 10_000;

function reject(reason: PatRejection): JobsError {
  return new JobsError(reason, 422, patRejectionMessage(reason));
}

function githubBase(): string {
  return (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, '');
}

async function gh(token: string, path: string): Promise<Response> {
  try {
    return await fetch(`${githubBase()}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tulzo-gigs',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[github-pat] request failed:', path.split('?')[0], err instanceof Error ? err.name : 'error');
    throw new JobsError('github_error', 502, 'GitHub could not be reached. Try again in a minute.');
  }
}

function unexpected(res: Response, what: string): JobsError {
  console.error(`[github-pat] unexpected GitHub status ${res.status} for ${what}`);
  return new JobsError('github_error', 502, `GitHub answered ${res.status} while checking the ${what}. Try again in a minute.`);
}

export async function verifyPatForRepo(input: {
  token: string;
  gitRepo: string;
  commitSha?: string | null;
  now?: Date;
}): Promise<VerifiedPat> {
  const now = input.now ?? new Date();
  const formatProblem = checkTokenFormat(input.token);
  if (formatProblem) throw reject(formatProblem);
  const token = input.token.trim();
  const ref = parseRepoRef(input.gitRepo);
  if (!ref) throw reject('invalid_repo');
  const wantedSha = normalizeShaInput(input.commitSha);
  if (wantedSha === 'invalid') throw reject('invalid_commit_sha');

  const repoRes = await gh(token, `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`);
  if (repoRes.status === 401) throw reject('invalid_pat');
  if (repoRes.status === 403 || repoRes.status === 404) throw reject('repo_not_accessible');
  if (!repoRes.ok) throw unexpected(repoRes, 'repository');
  const { expiresAt } = parseExpirationHeader(repoRes.headers.get('github-authentication-token-expiration'));
  const expiryProblem = checkExpiry(expiresAt, now);
  if (expiryProblem) throw reject(expiryProblem);
  const repo = (await repoRes.json()) as GithubRepoInfo & { default_branch?: string };
  const repoProblem = checkRepo(repo);
  if (repoProblem) throw reject(repoProblem);
  const fullName = typeof repo.full_name === 'string' && parseRepoRef(repo.full_name) ? repo.full_name : ref.fullName;

  const listed: Array<{ full_name?: string }> = [];
  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const res = await gh(token, `/user/repos?per_page=100&page=${page}`);
    if (!res.ok) throw reject('scope_unverifiable');
    const batch = (await res.json()) as Array<{ full_name?: string }>;
    if (!Array.isArray(batch)) throw reject('scope_unverifiable');
    listed.push(...batch);
    const scopeProblem = checkScope(listed, fullName);
    if (scopeProblem) throw reject(scopeProblem);
    if (batch.length < 100) break;
  }

  const defaultBranch = typeof repo.default_branch === 'string' && repo.default_branch ? repo.default_branch : 'main';
  const commitRef = wantedSha ?? defaultBranch;
  const [owner, name] = fullName.split('/');
  const commitRes = await gh(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(commitRef)}`);
  if (commitRes.status === 404 || commitRes.status === 422) throw reject('commit_not_found');
  if (!commitRes.ok) throw unexpected(commitRes, 'commit');
  const commit = (await commitRes.json()) as { sha?: unknown };
  const sha = typeof commit.sha === 'string' ? commit.sha.toLowerCase() : '';
  if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) throw unexpected(commitRes, 'commit');
  if (wantedSha && !sha.startsWith(wantedSha)) throw reject('commit_not_found');

  return { repoFullName: fullName, commitSha: sha, defaultBranch, expiresAt, ownerAdmin: isOwnerAdmin(repo) };
}
