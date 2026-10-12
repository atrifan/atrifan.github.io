/**
 * A tiny in-memory stand-in for the GitHub REST API, for tests only. The app points here
 * through GITHUB_API_BASE. Never talks to GitHub.
 *
 * Each known token maps to the repos it can reach. Responses carry the
 * `github-authentication-token-expiration` header the way GitHub does for tokens that
 * expire. Unknown tokens get 401 "Bad credentials" (that is also what GitHub returns for
 * an expired or revoked token).
 *
 * Endpoints: GET /repos/{o}/{r}, GET /repos/{o}/{r}/commits/{ref}, GET /user/repos, and for
 * delivery (Phase 5): GET /repos/{o}/{r}/tarball/{sha} (a gzipped tar like GitHub's, via a
 * redirect to an unauthenticated "codeload" URL), GET /repos/{o}/{r}/commits (409 on an empty
 * repo), PUT /repos/{o}/{r}/contents/{path}, POST git/blobs, git/trees, git/commits and
 * PATCH git/refs/heads/{branch}. Writes need `permissions.push`.
 * Test control: POST /__fixtures/tokens with a JSON `{ token, ...TokenFixture }` body.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';

export interface RepoFixture {
  full_name: string;
  private: boolean;
  permissions: { admin: boolean; push: boolean; pull: boolean };
  default_branch: string;
  /** Commit SHA at the head of the default branch. */
  head_sha: string;
  /** Other commits that exist in the repo. */
  commits?: string[];
  /** Files in every commit's tarball (path -> content). Defaults to DEFAULT_REPO_FILES. */
  files?: Record<string, string>;
  /** Paths among `files` that are executable. */
  executables?: string[];
  /** An empty repo (no commits yet), as a push target. */
  empty?: boolean;
}

export const DEFAULT_REPO_FILES: Record<string, string> = {
  'README.md': '# CSV importer\n',
  'src/index.ts': 'export const importCsv = () => 42;\n',
  'bin/run.sh': '#!/bin/sh\necho run\n',
};
export const DEFAULT_EXECUTABLES = ['bin/run.sh'];

/** What a push left in a target repo. */
export interface PushedRepoState {
  empty: boolean;
  refs: Record<string, string>;
  commits: Map<string, { message: string; tree: string; parents: string[] }>;
  trees: Map<string, Array<{ path: string; mode: string; type: string; sha: string }>>;
  blobs: Map<string, string>;
  /** Files at the head of `branch`: path -> { mode, content }. */
  filesAt(branch: string): Record<string, { mode: string; content: string }>;
}

export interface TokenFixture {
  repos: RepoFixture[];
  /** Days from "now" (per request) until the token expires; null = no expiration header. */
  expires_in_days: number | null;
  /** Status for GET /user/repos (e.g. 403 to simulate "cannot list"). Default 200. */
  user_repos_status?: number;
}

export interface RecordedGithubRequest {
  method: string;
  path: string;
  /** True when an Authorization header was sent (never records the token itself). */
  authorized: boolean;
}

export interface FakeGithub {
  url: string;
  requests: RecordedGithubRequest[];
  setToken(token: string, fixture: TokenFixture): void;
  /** Write state of a repo (created on first use). */
  repo(fullName: string): PushedRepoState;
  close(): Promise<void>;
}

// -- tarballs ---------------------------------------------------------------

function tarHeader(name: string, size: number, mode: number, type: string): Buffer {
  const h = Buffer.alloc(512);
  h.write(name.slice(0, 100), 0, 'utf8');
  h.write(mode.toString(8).padStart(7, '0') + '\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.write('        ', 148);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

function tarEntry(name: string, data: Buffer, mode: number, type = '0'): Buffer {
  const pad = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([tarHeader(name, data.length, mode, type), data, pad]);
}

function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let len = body.length;
  while (`${len}${body}`.length !== len) len = `${len}${body}`.length;
  return `${len}${body}`;
}

/** A gzipped tarball shaped like GitHub's: a pax global header (comment = sha), one top dir. */
export function buildGithubTarball(fullName: string, sha: string, files: Record<string, string>, executables: string[] = []): Buffer {
  const top = `${fullName.replace('/', '-')}-${sha.slice(0, 7)}/`;
  const parts: Buffer[] = [tarEntry('pax_global_header', Buffer.from(paxRecord('comment', sha)), 0o666, 'g')];
  parts.push(tarEntry(top, Buffer.alloc(0), 0o775, '5'));
  const dirs = new Set<string>();
  for (const path of Object.keys(files).sort()) {
    const segs = path.split('/');
    for (let i = 1; i < segs.length; i += 1) {
      const d = `${segs.slice(0, i).join('/')}/`;
      if (!dirs.has(d)) {
        dirs.add(d);
        parts.push(tarEntry(top + d, Buffer.alloc(0), 0o775, '5'));
      }
    }
    const full = top + path;
    if (full.length > 100) parts.push(tarEntry('pax_header', Buffer.from(paxRecord('path', full)), 0o666, 'x'));
    parts.push(tarEntry(full, Buffer.from(files[path], 'utf8'), executables.includes(path) ? 0o775 : 0o664));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

const gitSha = (kind: string, data: string) => createHash('sha1').update(`${kind} ${data}`).digest('hex');

function newRepoState(empty: boolean): PushedRepoState {
  const state: PushedRepoState = {
    empty,
    refs: {},
    commits: new Map(),
    trees: new Map(),
    blobs: new Map(),
    filesAt(branch) {
      const out: Record<string, { mode: string; content: string }> = {};
      const commit = state.commits.get(state.refs[branch] ?? '');
      for (const e of (commit ? state.trees.get(commit.tree) : undefined) ?? []) {
        out[e.path] = { mode: e.mode, content: state.blobs.get(e.sha) ?? '' };
      }
      return out;
    },
  };
  return state;
}

const pad = (s: string) => s.padEnd(59, '0');

export const FAKE_SHA_HEAD = '1111111111111111111111111111111111111111';
export const FAKE_SHA_OTHER = '2222222222222222222222222222222222222222';
export const FAKE_SHA_OTHER_REPO = '3333333333333333333333333333333333333333';

/** Repo names the default fixtures use. */
export const FAKE_REPOS = {
  private: 'acme/private-repo',
  public: 'acme/public-repo',
  otherPrivate: 'acme/other-private',
} as const;

/** Tokens the default fixtures know (fine-grained format unless named classic). */
export const FAKE_TOKENS = {
  /** Reaches only acme/private-repo (private, pull, no admin); expires in 10 days. */
  good: `github_pat_11GOOD0000000000000000_${pad('good')}`,
  /** Reaches only acme/public-repo, which is public. */
  publicRepo: `github_pat_11PUBLIC00000000000000_${pad('public')}`,
  /** Reaches acme/private-repo AND acme/other-private. */
  broad: `github_pat_11BROAD000000000000000_${pad('broad')}`,
  /** Reaches only acme/private-repo but with admin permission. */
  admin: `github_pat_11ADMIN000000000000000_${pad('admin')}`,
  /** Reaches only acme/private-repo but expires in 90 days. */
  longExpiry: `github_pat_11LONG0000000000000000_${pad('long')}`,
  /** GitHub answers 401 Bad credentials (expired or revoked). */
  revoked: `github_pat_11REVOKED0000000000000_${pad('revoked')}`,
  /** A classic personal access token: rejected before any GitHub call. */
  classic: 'ghp_' + 'C'.repeat(36),
} as const;

const privateRepo = (permissions = { admin: false, push: false, pull: true }): RepoFixture => ({
  full_name: FAKE_REPOS.private,
  private: true,
  permissions,
  default_branch: 'main',
  head_sha: FAKE_SHA_HEAD,
  commits: [FAKE_SHA_OTHER],
});

export function defaultTokenFixtures(): Record<string, TokenFixture> {
  return {
    [FAKE_TOKENS.good]: { repos: [privateRepo()], expires_in_days: 10 },
    [FAKE_TOKENS.publicRepo]: {
      repos: [{
        full_name: FAKE_REPOS.public, private: false, permissions: { admin: false, push: false, pull: true },
        default_branch: 'main', head_sha: FAKE_SHA_HEAD,
      }],
      expires_in_days: 10,
    },
    [FAKE_TOKENS.broad]: {
      repos: [privateRepo(), {
        full_name: FAKE_REPOS.otherPrivate, private: true, permissions: { admin: false, push: false, pull: true },
        default_branch: 'main', head_sha: FAKE_SHA_OTHER_REPO,
      }],
      expires_in_days: 10,
    },
    [FAKE_TOKENS.admin]: { repos: [privateRepo({ admin: true, push: true, pull: true })], expires_in_days: 10 },
    [FAKE_TOKENS.longExpiry]: { repos: [privateRepo()], expires_in_days: 90 },
  };
}

/** GitHub's header format: "2026-10-20 12:00:00 UTC". */
export function githubExpirationHeader(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

export async function startFakeGithub(initial: Record<string, TokenFixture> = defaultTokenFixtures()): Promise<FakeGithub> {
  const tokens = new Map<string, TokenFixture>(Object.entries(initial));
  const requests: RecordedGithubRequest[] = [];
  const repoStates = new Map<string, PushedRepoState>();
  const codeload = new Map<string, Buffer>();
  const stateOf = (fullName: string, empty = false) => {
    const key = fullName.toLowerCase();
    let st = repoStates.get(key);
    if (!st) {
      st = newRepoState(empty);
      repoStates.set(key, st);
    }
    return st;
  };

  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url || '/', 'http://fake');
      const method = req.method || 'GET';
      const path = url.pathname;
      const authHeader = req.headers.authorization || '';
      const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(body));
      };

      if (method === 'POST' && path === '/__fixtures/tokens') {
        try {
          const { token, ...fixture } = JSON.parse(raw) as { token: string } & TokenFixture;
          tokens.set(token, fixture);
          return send(200, { ok: true });
        } catch {
          return send(400, { message: 'bad fixture' });
        }
      }

      requests.push({ method, path, authorized: authHeader.length > 0 });

      // The signed, unauthenticated download URL a tarball request redirects to.
      const cl = path.match(/^\/__codeload\/([a-f0-9]+)$/);
      if (method === 'GET' && cl) {
        const tgz = codeload.get(cl[1]);
        if (!tgz) return send(404, { message: 'Not Found' });
        if (authHeader) return send(400, { message: 'codeload must not receive the token' });
        res.writeHead(200, { 'content-type': 'application/x-gzip', 'content-length': String(tgz.length) });
        return res.end(tgz);
      }

      const token = authHeader.replace(/^(Bearer|token)\s+/i, '');
      const fixture = tokens.get(token);
      if (!fixture) return send(401, { message: 'Bad credentials' });
      const headers: Record<string, string> = {};
      if (fixture.expires_in_days !== null) {
        headers['github-authentication-token-expiration'] = githubExpirationHeader(
          new Date(Date.now() + fixture.expires_in_days * 24 * 60 * 60 * 1000),
        );
      }
      const findRepo = (o: string, r: string) =>
        fixture.repos.find((x) => x.full_name.toLowerCase() === `${o}/${r}`.toLowerCase());

      if (method === 'GET' && path === '/user/repos') {
        if (fixture.user_repos_status && fixture.user_repos_status !== 200) {
          return send(fixture.user_repos_status, { message: 'Resource not accessible by personal access token' }, headers);
        }
        const page = Number(url.searchParams.get('page') || '1');
        const list = page === 1
          ? fixture.repos.map((r) => ({ full_name: r.full_name, private: r.private, permissions: r.permissions }))
          : [];
        return send(200, list, headers);
      }

      let body: Record<string, any> = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return send(400, { message: 'Problems parsing JSON' }, headers);
      }
      const canWrite = (repo: RepoFixture) => repo.permissions.push || repo.permissions.admin;

      const tarball = path.match(/^\/repos\/([^/]+)\/([^/]+)\/tarball\/([^/]+)$/);
      if (method === 'GET' && tarball) {
        const repo = findRepo(tarball[1], tarball[2]);
        if (!repo) return send(404, { message: 'Not Found' }, headers);
        const ref = decodeURIComponent(tarball[3]);
        const all = [repo.head_sha, ...(repo.commits ?? [])];
        if (!all.includes(ref)) return send(404, { message: 'Not Found' }, headers);
        const id = randomBytes(12).toString('hex');
        codeload.set(id, buildGithubTarball(repo.full_name, ref, repo.files ?? DEFAULT_REPO_FILES, repo.executables ?? DEFAULT_EXECUTABLES));
        res.writeHead(302, { location: `http://127.0.0.1:${(server.address() as AddressInfo).port}/__codeload/${id}`, ...headers });
        return res.end();
      }

      const listCommits = path.match(/^\/repos\/([^/]+)\/([^/]+)\/commits$/);
      if (method === 'GET' && listCommits) {
        const repo = findRepo(listCommits[1], listCommits[2]);
        if (!repo) return send(404, { message: 'Not Found' }, headers);
        const st = stateOf(repo.full_name, repo.empty === true);
        if (st.empty) return send(409, { message: 'Git Repository is empty.' }, headers);
        return send(200, [{ sha: st.refs[repo.default_branch] ?? repo.head_sha }], headers);
      }

      const contents = path.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
      if (method === 'PUT' && contents) {
        const repo = findRepo(contents[1], contents[2]);
        if (!repo) return send(404, { message: 'Not Found' }, headers);
        if (!canWrite(repo)) return send(403, { message: 'Resource not accessible by personal access token' }, headers);
        const st = stateOf(repo.full_name, repo.empty === true);
        const content = Buffer.from(String(body.content ?? ''), 'base64').toString('utf8');
        const blob = gitSha('blob', content);
        st.blobs.set(blob, content);
        const filePath = decodeURIComponent(contents[3]);
        const tree = gitSha('tree', `${filePath}:${blob}`);
        st.trees.set(tree, [{ path: filePath, mode: '100644', type: 'blob', sha: blob }]);
        const commitSha = gitSha('commit', `${tree}:${String(body.message)}:${Date.now()}`);
        st.commits.set(commitSha, { message: String(body.message ?? ''), tree, parents: [] });
        st.refs[String(body.branch ?? repo.default_branch)] = commitSha;
        st.empty = false;
        return send(201, { content: { path: filePath }, commit: { sha: commitSha } }, headers);
      }

      const git = path.match(/^\/repos\/([^/]+)\/([^/]+)\/git\/(blobs|trees|commits|refs\/heads\/.+)$/);
      if (git && (method === 'POST' || method === 'PATCH')) {
        const repo = findRepo(git[1], git[2]);
        if (!repo) return send(404, { message: 'Not Found' }, headers);
        if (!canWrite(repo)) return send(403, { message: 'Resource not accessible by personal access token' }, headers);
        const st = stateOf(repo.full_name, repo.empty === true);
        if (st.empty) return send(409, { message: 'Git Repository is empty.' }, headers);
        const what = git[3];
        if (what === 'blobs' && method === 'POST') {
          const content = body.encoding === 'base64' ? Buffer.from(String(body.content), 'base64').toString('utf8') : String(body.content);
          const sha = gitSha('blob', content);
          st.blobs.set(sha, content);
          return send(201, { sha }, headers);
        }
        if (what === 'trees' && method === 'POST') {
          const entries = (body.tree ?? []) as Array<{ path: string; mode: string; type: string; sha: string }>;
          if (entries.some((e) => !st.blobs.has(e.sha))) return send(422, { message: 'Invalid tree info' }, headers);
          const sha = gitSha('tree', JSON.stringify(entries));
          st.trees.set(sha, entries);
          return send(201, { sha }, headers);
        }
        if (what === 'commits' && method === 'POST') {
          if (!st.trees.has(String(body.tree))) return send(422, { message: 'Tree SHA does not exist' }, headers);
          const sha = gitSha('commit', `${body.tree}:${body.message}:${JSON.stringify(body.parents ?? [])}`);
          st.commits.set(sha, { message: String(body.message), tree: String(body.tree), parents: body.parents ?? [] });
          return send(201, { sha }, headers);
        }
        if (what.startsWith('refs/heads/') && method === 'PATCH') {
          const branch = what.slice('refs/heads/'.length);
          if (!st.commits.has(String(body.sha))) return send(422, { message: 'Object does not exist' }, headers);
          if (!st.refs[branch]) return send(422, { message: 'Reference does not exist' }, headers);
          st.refs[branch] = String(body.sha);
          return send(200, { ref: `refs/heads/${branch}`, object: { sha: body.sha } }, headers);
        }
        return send(404, { message: 'Not Found' }, headers);
      }

      const commit = path.match(/^\/repos\/([^/]+)\/([^/]+)\/commits\/([^/]+)$/);
      if (method === 'GET' && commit) {
        const repo = findRepo(commit[1], commit[2]);
        if (!repo) return send(404, { message: 'Not Found' }, headers);
        const ref = decodeURIComponent(commit[3]);
        if (ref === repo.default_branch) return send(200, { sha: repo.head_sha }, headers);
        const all = [repo.head_sha, ...(repo.commits ?? [])];
        const hit = /^[0-9a-f]{7,40}$/i.test(ref) ? all.find((s) => s.startsWith(ref.toLowerCase())) : undefined;
        if (hit) return send(200, { sha: hit }, headers);
        return send(422, { message: `No commit found for SHA: ${ref}` }, headers);
      }

      const repoMatch = path.match(/^\/repos\/([^/]+)\/([^/]+)$/);
      if (method === 'GET' && repoMatch) {
        const repo = findRepo(repoMatch[1], repoMatch[2]);
        if (!repo) return send(404, { message: 'Not Found' }, headers);
        return send(200, {
          full_name: repo.full_name,
          private: repo.private,
          visibility: repo.private ? 'private' : 'public',
          default_branch: repo.default_branch,
          permissions: repo.permissions,
        }, headers);
      }

      return send(404, { message: 'Not Found' }, headers);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    setToken: (token, fixture) => tokens.set(token, fixture),
    repo: (fullName) => stateOf(fullName),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
