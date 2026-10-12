/**
 * GitHub calls for delivery, through GITHUB_API_BASE (tests point it at a fake).
 *
 *  - fetchCommitTarball: the provider's sealed read PAT fetches the tarball of the exact QA'd
 *    SHA. GitHub answers with a redirect to a short-lived, pre-signed codeload URL; that URL is
 *    fetched WITHOUT the token, so the PAT only ever goes to the API host.
 *  - verifyPushTarget / pushTree: the customer's own fine-grained write PAT and an empty private
 *    repo. The files are written with the git data API (blobs → tree → commit → ref). GitHub's
 *    git data API refuses an empty repo, so a placeholder file is created first through the
 *    contents API; the delivered commit then replaces it (no parent, branch force-updated).
 *
 * Tokens only travel in the Authorization header and never appear in errors or logs.
 */
import { JobsError } from '../jobs/errors';
import { checkTokenFormat, parseRepoRef, patRejectionMessage, type RepoRef } from '../jobs/github-pat-policy';
import type { TarFile } from './tar';

const TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

export function githubApiBase(): string {
  return (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, '');
}

function headers(token: string | null): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'tulzo-gigs',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function gh(token: string, path: string, init: { method?: string; body?: unknown; redirect?: RequestRedirect } = {}): Promise<Response> {
  try {
    return await fetch(`${githubApiBase()}${path}`, {
      method: init.method ?? 'GET',
      headers: { ...headers(token), ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      redirect: init.redirect ?? 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[delivery] GitHub request failed:', path.split('?')[0], err instanceof Error ? err.name : 'error');
    throw new JobsError('github_error', 502, 'GitHub could not be reached. Try again in a minute.');
  }
}

const enc = (s: string) => encodeURIComponent(s);
const repoPath = (ref: RepoRef) => `/repos/${enc(ref.owner)}/${enc(ref.repo)}`;

/** The gzipped tarball of `sha`, as a streaming response. */
export async function fetchCommitTarball(token: string, repoFullName: string, sha: string): Promise<Response> {
  const ref = parseRepoRef(repoFullName);
  if (!ref) throw new JobsError('invalid_repo', 422, 'The submitted repository name is invalid');
  const res = await gh(token, `${repoPath(ref)}/tarball/${enc(sha)}`, { redirect: 'manual' });
  if (res.status === 401) throw new JobsError('invalid_pat', 409, "The provider's access to the repository has expired or was revoked");
  if (res.status === 403 || res.status === 404) throw new JobsError('repo_not_accessible', 409, 'The delivered commit is no longer reachable');
  let download = res;
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (!location) throw new JobsError('github_error', 502, 'GitHub sent no download location');
    try {
      download = await fetch(location, { headers: { 'User-Agent': 'tulzo-gigs' }, cache: 'no-store', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    } catch (err) {
      console.error('[delivery] codeload request failed:', err instanceof Error ? err.name : 'error');
      throw new JobsError('github_error', 502, 'GitHub could not be reached. Try again in a minute.');
    }
  }
  if (!download.ok || !download.body) {
    console.error(`[delivery] unexpected GitHub status ${download.status} for a tarball`);
    throw new JobsError('github_error', 502, `GitHub answered ${download.status} for the download. Try again in a minute.`);
  }
  return download;
}

export interface PushTarget {
  ref: RepoRef;
  defaultBranch: string;
}

/** The customer's repo must be private, writable with this fine-grained PAT, and empty. */
export async function verifyPushTarget(token: string, repo: string): Promise<PushTarget> {
  const format = checkTokenFormat(token);
  if (format) throw new JobsError(format, 422, patRejectionMessage(format));
  const ref = parseRepoRef(repo);
  if (!ref) throw new JobsError('invalid_repo', 422, patRejectionMessage('invalid_repo'));
  const t = token.trim();
  const res = await gh(t, repoPath(ref));
  if (res.status === 401) throw new JobsError('invalid_pat', 422, patRejectionMessage('invalid_pat'));
  if (res.status === 403 || res.status === 404) throw new JobsError('repo_not_accessible', 422, patRejectionMessage('repo_not_accessible'));
  if (!res.ok) throw new JobsError('github_error', 502, `GitHub answered ${res.status} while checking your repository`);
  const info = (await res.json()) as { private?: boolean; default_branch?: string; permissions?: { push?: boolean; admin?: boolean } };
  if (info.private !== true) throw new JobsError('public_repo', 422, 'The target repository must be private');
  if (!info.permissions?.push && !info.permissions?.admin) {
    throw new JobsError('push_not_allowed', 422, 'The token cannot write to that repository. Give it "Contents: Read and write" on this repository only.');
  }
  const commits = await gh(t, `${repoPath(ref)}/commits?per_page=1`);
  if (commits.status !== 409) {
    if (commits.ok) throw new JobsError('repo_not_empty', 422, 'The target repository must be empty (no commits yet)');
    throw new JobsError('github_error', 502, `GitHub answered ${commits.status} while checking your repository`);
  }
  return { ref, defaultBranch: info.default_branch || 'main' };
}

async function expectJson<T>(res: Response, what: string): Promise<T> {
  if (res.status === 401) throw new JobsError('invalid_pat', 422, patRejectionMessage('invalid_pat'));
  if (res.status === 403 || res.status === 404) throw new JobsError('push_not_allowed', 422, `GitHub refused the push (${what})`);
  if (!res.ok) throw new JobsError('push_failed', 502, `GitHub answered ${res.status} (${what})`);
  return (await res.json()) as T;
}

const PLACEHOLDER = '.tulzo-delivery';

/** Write `files` as one commit on the default branch of an empty repo. Returns the new commit SHA. */
export async function pushTree(
  token: string,
  target: PushTarget,
  files: TarFile[],
  message: string,
  { concurrency = 6 }: { concurrency?: number } = {},
): Promise<string> {
  const t = token.trim();
  const base = repoPath(target.ref);
  // Initialise the empty repo: the git data API needs at least one commit.
  await expectJson(
    await gh(t, `${base}/contents/${PLACEHOLDER}`, {
      method: 'PUT',
      body: { message: 'Prepare delivery', content: Buffer.from('Delivered by Tulzo\n').toString('base64'), branch: target.defaultBranch },
    }),
    'initialise',
  );

  const entries: Array<{ path: string; mode: string; type: 'blob'; sha: string }> = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const i = next;
      next += 1;
      const f = files[i];
      const blob = await expectJson<{ sha: string }>(
        await gh(t, `${base}/git/blobs`, { method: 'POST', body: { content: f.data.toString('base64'), encoding: 'base64' } }),
        'blob',
      );
      entries[i] = { path: f.path, mode: f.gitMode, type: 'blob', sha: blob.sha };
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, files.length)) }, worker));

  const tree = await expectJson<{ sha: string }>(await gh(t, `${base}/git/trees`, { method: 'POST', body: { tree: entries } }), 'tree');
  const commit = await expectJson<{ sha: string }>(
    await gh(t, `${base}/git/commits`, { method: 'POST', body: { message, tree: tree.sha, parents: [] } }),
    'commit',
  );
  await expectJson(
    await gh(t, `${base}/git/refs/heads/${enc(target.defaultBranch)}`, { method: 'PATCH', body: { sha: commit.sha, force: true } }),
    'branch',
  );
  return commit.sha;
}
