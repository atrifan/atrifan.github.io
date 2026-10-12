import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { FAKE_REPOS, FAKE_SHA_HEAD, FAKE_TOKENS, type RepoFixture } from './fake-github';
import { ADMIN_USER, auth, markContractPaid, rand, seedContract } from './gigs-ui';

/**
 * Phase 5 helpers for the delivery specs (tests/e2e/gigs-delivery.spec.ts and the a11y and
 * visual delivery specs). Behaviour only: everything goes through public routes and MCP tools.
 *
 * A contract is driven to "delivered" like a real one: seedContract → paid → provider calls
 * the Jobs MCP send_project (fake GitHub repo acme/private-repo at FAKE_SHA_HEAD) → the admin
 * takes it with qa_credentials_get and marks it validated with a report and one finding.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export const JOBS_MCP = '/api/jobs/mcp';
export const ADMIN_QA_MCP = '/api/admin/qa/mcp';
export const DAY = 86_400_000;
export const BID_CENTS = 30000;
export const QA_REPORT_MD = '## QA report\nAll acceptance criteria pass.';
export const QA_FINDING_TITLE = 'Add a README section on CSV encoding';
export const CRON_SECRET = process.env.CRON_SECRET ?? '';
export const GITHUB_FAKE_URL = process.env.GITHUB_FAKE_URL ?? '';
export const PHASE5_ENV_MISSING =
  !process.env.JOBS_E2E_AUTH_SECRET || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.QA_E2E_ADMIN_USER;

const ALL_TOKENS = Object.values(FAKE_TOKENS);

/** Every PAT the fake GitHub knows plus any registered by a spec; none may appear in a response. */
export const knownTokens: string[] = [...ALL_TOKENS];

export function expectNoPat(text: string, what: string): void {
  for (const token of knownTokens) expect(text, `${what} leaked a PAT`).not.toContain(token);
}

// ---------------------------------------------------------------------------
// MCP

export async function mcpTool(
  request: APIRequestContext,
  path: string,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean; sc: Json }> {
  const res = await request.post(path, {
    headers: { ...auth(userId), 'content-type': 'application/json' },
    data: { jsonrpc: '2.0', id: rand(), method: 'tools/call', params: { name, arguments: args } },
  });
  const text = await res.text();
  expect(res.status(), `${name}: ${text}`).toBe(200);
  const body = JSON.parse(text) as Json;
  expect(body.result, `${name}: ${text}`).toBeDefined();
  return { text, isError: !!body.result.isError, sc: body.result.structuredContent };
}

async function mcpOk(
  request: APIRequestContext,
  path: string,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Json> {
  const r = await mcpTool(request, path, userId, name, args);
  expect(r.isError, `${name}: ${r.text}`).toBe(false);
  return r.sc;
}

// ---------------------------------------------------------------------------
// driving a contract

export type Stage = 'paid' | 'submitted' | 'delivered' | 'rejected';

export interface DeliveryContract {
  customer: string;
  provider: string;
  contractId: string;
  jobId: string;
  totalCents: number;
  title: string;
  submissionId: string | null;
}

/**
 * A contract at `stage`:
 * - paid: active, nothing submitted
 * - submitted: provider called send_project (awaiting QA, delivery locked)
 * - delivered: QA validated with QA_REPORT_MD and one low finding (delivery unlocked)
 * - rejected: QA rejected with a reason (opens a qa_rejected dispute)
 */
export async function contractAt(
  request: APIRequestContext,
  opts: { customer: string; provider: string; title: string; stage: Stage; rejectReason?: string },
): Promise<DeliveryContract> {
  const c = await seedContract(request, {
    customer: opts.customer,
    provider: opts.provider,
    title: opts.title,
    plan: 'Stream the file, validate with a schema, add tests.',
  });
  await markContractPaid(request, c.contractId, c.totalCents);
  const out: DeliveryContract = {
    customer: opts.customer,
    provider: opts.provider,
    contractId: c.contractId,
    jobId: c.jobId,
    totalCents: c.totalCents,
    title: opts.title,
    submissionId: null,
  };
  if (opts.stage === 'paid') return out;

  const sent = await mcpOk(request, JOBS_MCP, opts.provider, 'send_project', {
    contract_id: c.contractId,
    git_repo: FAKE_REPOS.private,
    pat_token: FAKE_TOKENS.good,
  });
  expect(sent.submission.commit_sha).toBe(FAKE_SHA_HEAD);
  out.submissionId = sent.submission.id as string;
  if (opts.stage === 'submitted') return out;

  await mcpOk(request, ADMIN_QA_MCP, ADMIN_USER, 'qa_credentials_get', { submission_id: out.submissionId });
  if (opts.stage === 'rejected') {
    await mcpOk(request, ADMIN_QA_MCP, ADMIN_USER, 'qa_mark', {
      submission_id: out.submissionId,
      verdict: 'rejected',
      reason: opts.rejectReason ?? 'The importer does not exist in the repository.',
      report_md: '## QA report\nNothing to test.',
      findings: [],
    });
    return out;
  }
  const marked = await mcpOk(request, ADMIN_QA_MCP, ADMIN_USER, 'qa_mark', {
    submission_id: out.submissionId,
    verdict: 'validated',
    reason: 'Meets the spec',
    report_md: QA_REPORT_MD,
    findings: [{ severity: 'low', title: QA_FINDING_TITLE }],
  });
  expect(marked.contract_status).toBe('delivered');
  return out;
}

// ---------------------------------------------------------------------------
// HTTP

export async function getJson(
  request: APIRequestContext,
  path: string,
  userId: string | null,
): Promise<{ status: number; body: Json; text: string; res: APIResponse }> {
  const res = await request.get(path, { headers: userId ? auth(userId) : {}, maxRedirects: 0 });
  const text = await res.text();
  expectNoPat(text, `GET ${path}`);
  let body: Json = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status(), body, text, res };
}

export async function postJson(
  request: APIRequestContext,
  path: string,
  userId: string | null,
  data: unknown = {},
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: Json; text: string }> {
  const res = await request.post(path, {
    headers: { ...(userId ? auth(userId) : {}), 'content-type': 'application/json', ...extraHeaders },
    data: data as Record<string, unknown>,
    maxRedirects: 0,
  });
  const text = await res.text();
  expectNoPat(text, `POST ${path}`);
  let body: Json = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status(), body, text };
}

/** `{ error: code, message }` with this status. */
export function expectApiError(r: { status: number; body: Json; text: string }, status: number, code?: string | RegExp): void {
  expect(r.status, r.text).toBe(status);
  expect(r.body, r.text).toBeTruthy();
  if (code instanceof RegExp) expect(String(r.body.error), r.text).toMatch(code);
  else if (code) expect(r.body.error, r.text).toBe(code);
  expect(typeof r.body.message, r.text).toBe('string');
}

export const deliveryPath = (contractId: string) => `/api/contracts/${contractId}/delivery`;

export async function getDelivery(request: APIRequestContext, contractId: string, userId: string): Promise<Json> {
  const r = await getJson(request, deliveryPath(contractId), userId);
  expect(r.status, r.text).toBe(200);
  return r.body;
}

export async function acceptDelivery(request: APIRequestContext, contractId: string, customer: string): Promise<Json> {
  const r = await postJson(request, `/api/contracts/${contractId}/accept`, customer, {});
  expect(r.status, r.text).toBe(200);
  return r.body;
}

export async function openDispute(
  request: APIRequestContext,
  contractId: string,
  customer: string,
  data: { category: string; reason: string; evidence?: string } = {
    category: 'incomplete',
    reason: 'The importer skips every row with a quoted comma.',
  },
): Promise<Json> {
  const r = await postJson(request, `/api/contracts/${contractId}/dispute`, customer, data);
  expect(r.status, r.text).toBe(201);
  return r.body.dispute;
}

export async function postReview(
  request: APIRequestContext,
  contractId: string,
  userId: string,
  scores: { overall: number; quality: number; communication: number; timeliness: number; body?: string },
): Promise<{ status: number; body: Json; text: string }> {
  return postJson(request, `/api/contracts/${contractId}/reviews`, userId, scores);
}

// ---------------------------------------------------------------------------
// fake GitHub push targets

/** A fine-grained-looking token unique to this call. */
export function newFineGrainedToken(): string {
  const core = `${Date.now().toString(36)}${rand()}`.toUpperCase().padEnd(22, '0').slice(0, 22);
  return `github_pat_11${core}_${`${rand()}${rand()}${rand()}`.padEnd(59, '0')}`;
}

/** Register a token on the fake GitHub that reaches one repo. Returns the token. */
export async function registerPushTarget(
  request: APIRequestContext,
  repo: Partial<RepoFixture> & { full_name: string },
  token = newFineGrainedToken(),
): Promise<string> {
  expect(GITHUB_FAKE_URL, 'GITHUB_FAKE_URL not set').not.toBe('');
  const fixture: RepoFixture = {
    private: true,
    permissions: { admin: false, push: true, pull: true },
    default_branch: 'main',
    head_sha: 'a'.repeat(40),
    ...repo,
  };
  const res = await request.post(`${GITHUB_FAKE_URL}/__fixtures/tokens`, {
    data: { token, repos: [fixture], expires_in_days: 10 },
  });
  expect(res.status(), await res.text()).toBe(200);
  knownTokens.push(token);
  return token;
}

/** An empty private repo the token may push to. */
export async function emptyTarget(request: APIRequestContext): Promise<{ repo: string; token: string }> {
  const repo = `cust/target-${rand()}`;
  const token = await registerPushTarget(request, { full_name: repo, empty: true });
  return { repo, token };
}

/** Head commit of a repo on the fake GitHub, read with `token`. */
export async function fakeGithubHead(request: APIRequestContext, repo: string, token: string): Promise<string | null> {
  const res = await request.get(`${GITHUB_FAKE_URL}/repos/${repo}/commits`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });
  if (res.status() !== 200) return null;
  const list = (await res.json()) as Array<{ sha: string }>;
  return list[0]?.sha ?? null;
}

// ---------------------------------------------------------------------------
// formatting

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "19 Oct 2026" (UTC). */
export function dMonYyyy(iso: string | number | Date): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Either the UTC or the local calendar date, as a regex alternative (the page may render either). */
export function dateRe(iso: string | number | Date): string {
  const d = new Date(iso);
  const local = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const utc = dMonYyyy(d);
  return utc === local ? escapeRe(utc) : `(?:${escapeRe(utc)}|${escapeRe(local)})`;
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const deliveryUrl = (contractId: string) => `/gigs/contracts/${contractId}/delivery`;

/** Masks for screenshots: SHAs, dates, ids. */
export function deliveryMasks(page: Page) {
  return [
    page.locator('[data-ad-slot]'),
    page.locator('.cl-footer'),
    page.locator('.cl-userButtonBox'),
    page.locator('#main code'),
    page.locator('#main time'),
    page.locator('#main td'),
    page.getByText(/Auto-accepts on/),
    page.getByText(/You can file a claim until/),
  ];
}

// ---------------------------------------------------------------------------
// fixed page states for the a11y and visual specs

export type PageState = 'locked' | 'ready' | 'provider' | 'accepted' | 'disputed';

export const PAGE_STATES: Array<{ state: PageState; name: string; heading: string; text: string }> = [
  { state: 'locked', name: 'locked (customer)', heading: 'Delivery', text: 'The delivery unlocks once QA validates the work' },
  { state: 'ready', name: 'ready (customer)', heading: 'Delivered commit', text: 'Download .tar.gz' },
  { state: 'provider', name: 'provider view (delivered)', heading: 'Delivery', text: 'Waiting for the customer to accept.' },
  { state: 'accepted', name: 'accepted with the review form', heading: 'Leave a review', text: 'You can file a claim until' },
  { state: 'disputed', name: 'disputed (customer)', heading: 'Delivery', text: 'A dispute is open' },
];

/** Seed a contract in `state` with a fixed title; returns who views it and the contract id. */
export async function seedPageState(
  request: APIRequestContext,
  state: PageState,
  word: string,
): Promise<{ viewer: string; contractId: string }> {
  const customer = `e2e_${word}_cust_${rand()}`;
  const provider = `e2e_${word}_prov_${rand()}`;
  const c = await contractAt(request, {
    customer,
    provider,
    title: `CSV importer for the ${word} shop`,
    stage: state === 'locked' ? 'submitted' : 'delivered',
  });
  if (state === 'accepted') await acceptDelivery(request, c.contractId, customer);
  if (state === 'disputed') {
    await openDispute(request, c.contractId, customer, {
      category: 'incomplete',
      reason: 'The export command is missing from the delivery.',
      evidence: 'README has no export section.',
    });
  }
  return { viewer: state === 'provider' ? provider : customer, contractId: c.contractId };
}
