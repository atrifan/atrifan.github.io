/**
 * A tiny in-memory stand-in for the GitHub REST API, for tests only. The app points here
 * through GITHUB_API_BASE. Never talks to GitHub.
 *
 * Each known token maps to the repos it can reach. Responses carry the
 * `github-authentication-token-expiration` header the way GitHub does for tokens that
 * expire. Unknown tokens get 401 "Bad credentials" (that is also what GitHub returns for
 * an expired or revoked token).
 *
 * Endpoints: GET /repos/{o}/{r}, GET /repos/{o}/{r}/commits/{ref}, GET /user/repos.
 * Test control: POST /__fixtures/tokens with a JSON `{ token, ...TokenFixture }` body.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RepoFixture {
  full_name: string;
  private: boolean;
  permissions: { admin: boolean; push: boolean; pull: boolean };
  default_branch: string;
  /** Commit SHA at the head of the default branch. */
  head_sha: string;
  /** Other commits that exist in the repo. */
  commits?: string[];
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
  close(): Promise<void>;
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
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
