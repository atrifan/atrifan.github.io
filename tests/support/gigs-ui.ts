import { expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext, type Locator, type Page, type Response, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import Stripe from 'stripe';
import { FAKE_REPOS, FAKE_TOKENS } from './fake-github';

/**
 * Shared helpers for the gigs UI specs (tests/e2e/gigs-ui.spec.ts,
 * tests/a11y/gigs.a11y.spec.ts, tests/visual/gigs.visual.spec.ts).
 *
 * They run under `npm run test:e2e:gigs`: a dev server with a throwaway DB, a fake
 * Stripe and the e2e identity header (x-e2e-user + x-e2e-secret = signed in as that
 * user, for API calls and page loads alike).
 */

export const E2E_SECRET = process.env.JOBS_E2E_AUTH_SECRET ?? '';
export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
export const ADMIN_USER = process.env.QA_E2E_ADMIN_USER ?? '';
export const GIGS_ENV_MISSING = !process.env.JOBS_E2E_AUTH_SECRET || !process.env.STRIPE_WEBHOOK_SECRET;

/** A fixed deadline so rendered dates never depend on today. Rendered as "1 Mar 2027". */
export const FIXED_DEADLINE = '2027-03-01T12:00:00.000Z';
export const FIXED_DEADLINE_TEXT = '1 Mar 2027';

const stripe = new Stripe('sk_test_x');

// ---------------------------------------------------------------------------
// identity

export function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function uid(role: string): string {
  return `e2e_${role}_${Date.now()}_${rand()}`;
}

/** Letters only, so it is one search token and never a substring of another word. */
export function uniqueWord(prefix: string): string {
  const letters = (Date.now().toString(36) + rand()).replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);
  return `${prefix}${letters}`;
}

export function auth(userId: string): Record<string, string> {
  return { 'x-e2e-user': userId, 'x-e2e-secret': E2E_SECRET };
}

/** Sign a browser context in as `userId` (navigations and the page's own fetches carry the headers). */
export async function signIn(context: BrowserContext, userId: string): Promise<void> {
  await context.setExtraHTTPHeaders(auth(userId));
}

/** A second browser context with the project's viewport/theme, signed in as `userId` (or signed out). */
export async function newProjectContext(
  browser: Browser,
  testInfo: TestInfo,
  userId: string | null,
): Promise<BrowserContext> {
  const use = testInfo.project.use;
  return browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    colorScheme: use.colorScheme,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    extraHTTPHeaders: userId ? auth(userId) : undefined,
  });
}

/** A standalone API context for beforeAll seeding (the `request` fixture is test-scoped). */
export async function newApi(
  playwright: { request: { newContext: (o: { baseURL?: string }) => Promise<APIRequestContext> } },
  testInfo: TestInfo,
): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
}

// ---------------------------------------------------------------------------
// Stripe

interface WebhookEvent {
  id: string;
  object: 'event';
  type: string;
  api_version: string;
  created: number;
  livemode: boolean;
  data: { object: Record<string, unknown> };
}

function makeEvent(type: string, object: Record<string, unknown>): WebhookEvent {
  return {
    id: `evt_${Date.now()}_${rand()}`,
    object: 'event',
    type,
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object },
  };
}

export async function postSignedWebhook(request: APIRequestContext, payload: string): Promise<APIResponse> {
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return request.post('/api/billing/webhook', {
    data: payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
  });
}

/** Link Stripe Connect for `userId` (onboard DE, then a signed account.updated). Idempotent. */
export async function linkStripe(request: APIRequestContext, userId: string): Promise<string> {
  const onboard = await request.post('/api/connect/onboard', { headers: auth(userId), data: { country: 'DE' } });
  expect(onboard.status(), await onboard.text()).toBe(200);
  const { account_id } = (await onboard.json()) as { account_id: string };
  const payload = JSON.stringify(
    makeEvent('account.updated', {
      id: account_id,
      object: 'account',
      country: 'DE',
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
      requirements: { disabled_reason: null, currently_due: [] },
    }),
  );
  const hook = await postSignedWebhook(request, payload);
  expect(hook.status()).toBe(200);
  return account_id;
}

/** Simulate Stripe Checkout completing for a contract (pending_payment → active). */
export async function markContractPaid(request: APIRequestContext, contractId: string, amountCents: number): Promise<void> {
  const suffix = `${Date.now()}_${rand()}`;
  const payload = JSON.stringify(
    makeEvent('checkout.session.completed', {
      id: `cs_test_${suffix}`,
      object: 'checkout.session',
      mode: 'payment',
      payment_status: 'paid',
      status: 'complete',
      amount_total: amountCents,
      currency: 'eur',
      payment_intent: `pi_test_${suffix}`,
      metadata: { kind: 'contract', contract_id: contractId },
    }),
  );
  const hook = await postSignedWebhook(request, payload);
  expect(hook.status()).toBe(200);
}

// ---------------------------------------------------------------------------
// seeding

export interface JobInput {
  title: string;
  description?: string;
  category?: string;
  budget_min_cents?: number | null;
  budget_max_cents?: number | null;
  deadline?: string | null;
}

export interface SpecInput {
  requirements: string[];
  deliverables: string[];
  acceptance_criteria: string[];
  constraints: string[];
  deadline: string | null;
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  permitted_tools: string[];
  security: { data_sensitivity: 'public' | 'internal' | 'confidential'; secrets_allowed: boolean; notes: string };
}

export type Job = Record<string, unknown> & { id: string; title: string; status: string };

const DEFAULT_DESCRIPTION = 'Import customer CSV files into the app and report invalid rows clearly.';

/** POST /api/jobs → the draft job. Unset fields are omitted, so "no budget"/"no deadline" is expressible. */
export async function createJob(request: APIRequestContext, userId: string, input: JobInput): Promise<Job> {
  const data: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? DEFAULT_DESCRIPTION,
  };
  if (input.category) data.category = input.category;
  if (input.budget_min_cents != null) data.budget_min_cents = input.budget_min_cents;
  if (input.budget_max_cents != null) data.budget_max_cents = input.budget_max_cents;
  if (input.deadline) data.deadline = input.deadline;
  const res = await request.post('/api/jobs', { headers: auth(userId), data });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { job: Job }).job;
}

export function manualSpec(job: JobInput, overrides: Partial<SpecInput> = {}): SpecInput {
  return {
    requirements: ['Accept CSV uploads up to 10 MB', 'Validate every row against the schema'],
    deliverables: ['Pull request with the importer', 'README section on the file format'],
    acceptance_criteria: ['All sample files import without errors', 'Invalid rows are listed with a reason'],
    constraints: ['TypeScript only'],
    deadline: job.deadline ?? null,
    budget_min_cents: job.budget_min_cents ?? null,
    budget_max_cents: job.budget_max_cents ?? null,
    permitted_tools: ['node', 'vitest'],
    security: { data_sensitivity: 'internal', secrets_allowed: false, notes: 'Use the anonymised sample files only' },
    ...overrides,
  };
}

/** Create a job, save a manual spec and approve it → an open (public) job. */
export async function publishJob(
  request: APIRequestContext,
  userId: string,
  input: JobInput,
  specOverrides: Partial<SpecInput> = {},
): Promise<Job & { spec: SpecInput }> {
  const job = await createJob(request, userId, input);
  const spec = manualSpec(input, specOverrides);
  const draft = await request.post(`/api/jobs/${job.id}/spec/draft`, { headers: auth(userId), data: { spec } });
  expect(draft.status(), await draft.text()).toBe(201);
  const approve = await request.post(`/api/jobs/${job.id}/spec/approve`, { headers: auth(userId), data: {} });
  expect(approve.status(), await approve.text()).toBe(200);
  return { ...job, status: 'open', spec };
}

export interface BidInput {
  price_cents: number;
  eta_days: number;
  plan?: string;
  deliverables?: string[];
  included_steering_credits?: number;
  assumptions?: string[];
}

export async function placeBid(
  request: APIRequestContext,
  userId: string,
  jobId: string,
  bid: BidInput,
): Promise<{ id: string }> {
  const res = await request.post(`/api/jobs/${jobId}/bids`, { headers: auth(userId), data: bid });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { bid: { id: string } }).bid;
}

export async function acceptBid(
  request: APIRequestContext,
  userId: string,
  bidId: string,
  qaChecks?: string[],
): Promise<{ contractId: string; checkoutUrl: string; totalCents: number }> {
  const res = await request.post(`/api/bids/${bidId}/accept`, {
    headers: auth(userId),
    data: qaChecks ? { qa_checks: qaChecks } : {},
  });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as {
    contract: { id: string };
    version: { customer_total_cents: number };
    checkout_url: string;
  };
  return { contractId: body.contract.id, checkoutUrl: body.checkout_url, totalCents: body.version.customer_total_cents };
}

export interface OfferInput {
  title: string;
  description: string;
  price_cents: number;
  delivery_days: number;
  tags?: string[];
  category?: string;
}

export async function createOffer(request: APIRequestContext, userId: string, offer: OfferInput): Promise<{ id: string }> {
  const res = await request.post('/api/offers', { headers: auth(userId), data: offer });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { offer: { id: string } }).offer;
}

export async function countJobs(request: APIRequestContext, userId: string, q: string): Promise<number> {
  const res = await request.get(`/api/jobs?q=${encodeURIComponent(q)}&limit=50`, { headers: auth(userId) });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { total: number }).total;
}

export async function countOffers(request: APIRequestContext, userId: string, q: string): Promise<number> {
  const res = await request.get(`/api/offers?q=${encodeURIComponent(q)}&limit=50`, { headers: auth(userId) });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { total: number }).total;
}

/** A job with an approved spec plus one bid, accepted by the customer (contract pending payment). */
export async function seedContract(
  request: APIRequestContext,
  opts: { customer: string; provider: string; title: string; plan: string; qaChecks?: string[] },
): Promise<{ jobId: string; bidId: string; contractId: string; totalCents: number; spec: SpecInput }> {
  await linkStripe(request, opts.provider);
  const job = await publishJob(request, opts.customer, {
    title: opts.title,
    category: 'development',
    budget_min_cents: 20000,
    budget_max_cents: 40000,
    deadline: FIXED_DEADLINE,
  });
  const bid = await placeBid(request, opts.provider, job.id, {
    price_cents: 30000,
    eta_days: 5,
    plan: opts.plan,
    deliverables: ['Pull request with the importer'],
    included_steering_credits: 2,
    assumptions: ['Sample files are representative'],
  });
  const accepted = await acceptBid(request, opts.customer, bid.id, opts.qaChecks);
  return { jobId: job.id, bidId: bid.id, contractId: accepted.contractId, totalCents: accepted.totalCents, spec: job.spec };
}

// ---------------------------------------------------------------------------
// fixed per-project data (screenshots)

/** A short letters-only tag per themed project, e.g. "lightdesk". */
export function projectTag(testInfo: TestInfo): string {
  const tags: Record<string, string> = {
    'light-desktop': 'lightdesk',
    'light-mobile': 'lightmob',
    'dark-desktop': 'darkdesk',
    'dark-mobile': 'darkmob',
  };
  return tags[testInfo.project.name] ?? testInfo.project.name.replace(/[^a-z]/gi, '').toLowerCase();
}

export const isMobileProject = (testInfo: TestInfo): boolean => testInfo.project.name.endsWith('-mobile');
export const isDesktopProject = (testInfo: TestInfo): boolean => testInfo.project.name.endsWith('-desktop');

export const TABLET = { width: 768, height: 1024 } as const;

// ---------------------------------------------------------------------------
// pages

/** Consent banner, analytics and ads never reach a test. */
export const THIRD_PARTY = /(iubenda|googletagmanager|google-analytics|googlesyndication|doubleclick|adservice)/;

/** An ad slot container; the AdSense <ins> also carries data-ad-slot and is not a slot. */
export const AD_SLOT = '[data-ad-slot]:not(ins)';

/**
 * Go to a gigs page and wait until it is settled: #main visible, Clerk loaded
 * ("Sign in" link for signed-out contexts), fonts ready, a short settle.
 */
export async function openGigs(page: Page, path: string, opts: { signedIn?: boolean } = {}): Promise<Response | null> {
  await page.route(THIRD_PARTY, (route) => route.abort('blockedbyclient'));
  const res = await page.goto(path, { waitUntil: 'load' });
  await settle(page, opts);
  return res;
}

export async function settle(page: Page, opts: { signedIn?: boolean } = {}): Promise<void> {
  await page.locator('#main').waitFor({ state: 'visible' });
  const signInLink = page.getByRole('link', { name: 'Sign in', exact: true, includeHidden: true }).first();
  if (opts.signedIn) {
    // Clerk's client may or may not know about the e2e identity; wait for it to settle either way.
    await signInLink
      .or(page.locator('.cl-userButtonBox').first())
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 })
      .catch(() => undefined);
  } else {
    await signInLink.waitFor({ state: 'attached', timeout: 30_000 });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

export function screenshotMasks(page: Page): Locator[] {
  // [data-volatile]: times that depend on when a row was written (job room)
  return [page.locator('[data-ad-slot]'), page.locator('.cl-footer'), page.locator('.cl-userButtonBox'), page.locator('[data-volatile]')];
}

/** Fulfil the (fake) Stripe Checkout page so the redirect can be asserted without leaving the test. */
export async function mockStripeCheckout(page: Page): Promise<void> {
  await page.route('https://checkout.stripe.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Stripe Checkout (mock)</h1>' }),
  );
}

/** All robots meta contents on the page, joined. */
export async function robotsMeta(page: Page): Promise<string> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('meta[name="robots"]'))
      .map((m) => m.getAttribute('content') ?? '')
      .join(','),
  );
}

/** Count POST requests the page sends to the app itself (fetches and server actions alike). */
export function trackAppPosts(page: Page, baseURL: string | undefined): () => number {
  const origin = new URL(baseURL ?? 'http://localhost:3100').origin;
  let n = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).origin === origin) n += 1;
  });
  return () => n;
}

/** A role=status element whose text matches. */
export function statusWith(page: Page, text: string | RegExp): Locator {
  return page.getByRole('status').filter({ hasText: text });
}

/** The "N jobs" / "N offers" result count. */
export function resultCount(page: Page): Locator {
  return page.getByRole('status').filter({ hasText: /\b\d+ (jobs?|offers?)\b/ });
}

export function jobCards(page: Page): Locator {
  return page.getByRole('list', { name: 'Jobs' }).getByRole('listitem');
}

export function offerCards(page: Page): Locator {
  return page.getByRole('list', { name: 'Offers' }).getByRole('listitem');
}

export function cardTitled(cards: Locator, page: Page, title: string): Locator {
  return cards.filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

export async function expectAbsentOrDisabled(locator: Locator): Promise<void> {
  const count = await locator.count();
  if (count === 0) return;
  await expect(locator.first()).toHaveAttribute('aria-disabled', 'true');
}

// ---------------------------------------------------------------------------
// a11y

const BLOCKING = ['serious', 'critical'];

export async function expectNoBlockingAxe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
  const blocking = results.violations.filter((v) => BLOCKING.includes(v.impact ?? ''));
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n'),
  ).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// ---------------------------------------------------------------------------
// post-a-job wizard driving (UI)

export interface WizardData {
  title: string;
  description: string;
  requirements: string[];
  deliverables: string[];
  acceptance: string[];
  constraints: string[];
  tools: string[];
}

export function wizardData(title: string): WizardData {
  return {
    title,
    description: 'Import customer CSV files into the app and report invalid rows clearly.',
    requirements: ['Accept CSV uploads up to 10 MB', 'Validate every row against the schema'],
    deliverables: ['Pull request with the importer', 'README section on the file format'],
    acceptance: ['All sample files import without errors'],
    constraints: ['TypeScript only'],
    tools: ['node', 'vitest'],
  };
}

export async function fillDescribe(page: Page, d: WizardData): Promise<void> {
  await page.getByRole('textbox', { name: 'Title' }).fill(d.title);
  await page.getByRole('textbox', { name: 'What do you need done?' }).fill(d.description);
  await page.getByRole('combobox', { name: 'Category' }).selectOption('development');
  await page.getByRole('spinbutton', { name: 'Min budget (€)' }).fill('200');
  await page.getByRole('spinbutton', { name: 'Max budget (€)' }).fill('400');
  await page.getByLabel('Deadline', { exact: true }).fill('2027-03-01');
}

/** From the Describe step: Continue → Draft step; returns the new job id from the URL. */
export async function continueToDraft(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/[?&]step=draft/);
  await expect(page.getByRole('heading', { level: 2, name: 'Draft the spec' })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('job');
  expect(id).toBeTruthy();
  return id as string;
}

export async function fillEdit(page: Page, d: WizardData): Promise<void> {
  await page.getByLabel('Requirements (one per line)').fill(d.requirements.join('\n'));
  await page.getByLabel('Deliverables (one per line)').fill(d.deliverables.join('\n'));
  await page.getByLabel('Acceptance criteria (one per line)').fill(d.acceptance.join('\n'));
  await page.getByLabel('Constraints (one per line)').fill(d.constraints.join('\n'));
  await page.getByLabel('Permitted tools (one per line)').fill(d.tools.join('\n'));
  await page.getByRole('combobox', { name: 'Data sensitivity' }).selectOption({ label: 'Internal' });
  await page.getByRole('textbox', { name: 'Security notes' }).fill('Use the anonymised sample files only');
}

/** Drive the wizard from /gigs/post to the given step (signed-in page). Returns the job id (null on describe). */
export async function wizardTo(
  page: Page,
  step: 'describe' | 'draft' | 'edit' | 'publish',
  d: WizardData,
  opts: { qa?: string[] } = {},
): Promise<string | null> {
  await openGigs(page, '/gigs/post', { signedIn: true });
  await expect(page.getByRole('heading', { level: 2, name: 'Describe the outcome' })).toBeVisible();
  if (step === 'describe') return null;
  await fillDescribe(page, d);
  const jobId = await continueToDraft(page);
  if (step === 'draft') return jobId;
  await page.getByRole('button', { name: 'Write it myself' }).click();
  await page.waitForURL(/[?&]step=edit/);
  await expect(page.getByRole('heading', { level: 2, name: 'Edit the spec' })).toBeVisible();
  await fillEdit(page, d);
  for (const name of opts.qa ?? []) {
    await page.getByRole('group', { name: 'QA checks' }).getByRole('checkbox', { name: new RegExp(name) }).check();
  }
  if (step === 'edit') return jobId;
  await page.getByRole('button', { name: 'Review and publish' }).click();
  await page.waitForURL(/[?&]step=publish/);
  await expect(page.getByRole('heading', { level: 2, name: 'Review and publish' })).toBeVisible();
  return jobId;
}

// ---------------------------------------------------------------------------
// fixed scenarios for the a11y and visual specs (everything rendered is fixed per word)

/** Listing seed for `word`: three open jobs (one with a bid) and two offers. Idempotent. */
export async function ensureListing(api: APIRequestContext, word: string): Promise<void> {
  const customer = `fx_${word}_customer`;
  const provider = `fx_${word}_provider`;
  const unlinked = `fx_${word}_writer`;
  if ((await countJobs(api, customer, word)) === 0) {
    await linkStripe(api, provider);
    await publishJob(api, customer, {
      title: `CSV importer for the ${word} shop`,
      description: `Import ${word} customer CSV files, validate every row and list the invalid ones with a reason.`,
      category: 'development',
      budget_min_cents: 20000,
      budget_max_cents: 40000,
      deadline: FIXED_DEADLINE,
    });
    const withBid = await publishJob(api, customer, {
      title: `Logo refresh for ${word}`,
      description: `A cleaner vector logo for the ${word} brand, delivered as SVG and PNG.`,
      category: 'design',
      budget_min_cents: 15000,
      budget_max_cents: 15000,
    });
    await placeBid(api, provider, withBid.id, { price_cents: 15000, eta_days: 4, plan: 'Three concepts, two rounds.' });
    await publishJob(api, customer, {
      title: `Nightly backups for ${word}`,
      description: `Set up nightly database backups for ${word} with a tested restore.`,
      category: 'devops',
    });
  }
  if ((await countOffers(api, customer, word)) === 0) {
    await linkStripe(api, provider);
    await createOffer(api, provider, {
      title: `Spreadsheet clean-up (${word})`,
      description: `I clean, dedupe and normalise ${word} spreadsheets and hand back a tidy file.`,
      price_cents: 15000,
      delivery_days: 5,
      tags: ['csv', 'cleanup'],
      category: 'data',
    });
    await createOffer(api, unlinked, {
      title: `Landing page copy (${word})`,
      description: `Clear, friendly landing page copy for ${word}, one round of edits included.`,
      price_cents: 1250,
      delivery_days: 1,
      tags: ['copy'],
      category: 'writing',
    });
  }
}

export function detailJobInput(word: string): JobInput {
  return {
    title: `CSV importer for the ${word} shop`,
    description: `Import ${word} customer CSV files, validate every row and list the invalid ones with a reason.`,
    category: 'development',
    budget_min_cents: 20000,
    budget_max_cents: 40000,
    deadline: FIXED_DEADLINE,
  };
}

/** A fresh open job with three bids from Stripe-linked providers (fixed content, fresh ids). */
export async function seedComparison(
  api: APIRequestContext,
  word: string,
): Promise<{ owner: string; jobId: string; bidIds: string[] }> {
  const owner = uid(`${word}owner`);
  const job = await publishJob(api, owner, detailJobInput(word));
  const bids: BidInput[] = [
    { price_cents: 30000, eta_days: 5, plan: 'Stream the file, validate with a schema, add tests.', included_steering_credits: 2 },
    { price_cents: 25000, eta_days: 9, plan: 'A small importer with row-level error reports.', included_steering_credits: 1 },
    { price_cents: 40000, eta_days: 2, plan: 'Fast delivery with a full test suite.', included_steering_credits: 0 },
  ];
  const bidIds: string[] = [];
  for (const bid of bids) {
    const provider = uid(`${word}prov`);
    await linkStripe(api, provider);
    bidIds.push((await placeBid(api, provider, job.id, bid)).id);
  }
  return { owner, jobId: job.id, bidIds };
}

/** Fill the bid form with a fixed €300 / 5 day bid (breakdown visible). */
export async function fillBidForm(page: Page): Promise<void> {
  const form = page.getByRole('form', { name: 'Place a bid' });
  await form.getByRole('spinbutton', { name: 'Your price (€)' }).fill('300');
  await form.getByRole('spinbutton', { name: 'Delivery estimate (days)' }).fill('5');
  await form.getByRole('textbox', { name: 'Plan', exact: true }).fill('Stream the file, validate with a schema, add tests.');
  await form.getByRole('textbox', { name: 'Deliverables (one per line)' }).fill('Pull request\nTest suite');
  await form.getByRole('spinbutton', { name: 'Steering interactions included' }).fill('2');
  await form.getByRole('textbox', { name: 'Assumptions (one per line)' }).fill('Sample files are representative');
  await expect(page.getByRole('status').filter({ hasText: /you receive €300/i })).toBeVisible();
}

// ---------------------------------------------------------------------------
// job room (tests/e2e/gigs-room.spec.ts, tests/a11y/gigs-room.a11y.spec.ts, tests/visual/gigs-room.visual.spec.ts)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RoomJson = any;

export const ROOM_TAB_IDS = ['plan', 'status', 'activity', 'artifacts', 'milestones', 'messages', 'steering', 'qa', 'delivery'] as const;
export type RoomTabId = (typeof ROOM_TAB_IDS)[number];
export const ROOM_TAB_NAMES: Record<RoomTabId, string> = {
  plan: 'Plan',
  status: 'Status',
  activity: 'Activity',
  artifacts: 'Artifacts',
  milestones: 'Milestones',
  messages: 'Messages',
  steering: 'Steering',
  qa: 'QA',
  delivery: 'Delivery',
};

/** Open the contract page (optionally on a tab) and wait for the job room tablist. */
export async function openRoom(page: Page, contractId: string, tab?: RoomTabId): Promise<void> {
  await openGigs(page, `/gigs/contracts/${contractId}${tab ? `?tab=${tab}` : ''}`, { signedIn: true });
  await expect(page.getByRole('tablist', { name: 'Job room' })).toBeVisible();
}

export function roomTab(page: Page, id: RoomTabId): Locator {
  return page
    .getByRole('tablist', { name: 'Job room' })
    .getByRole('tab', { name: new RegExp(`^\\s*${ROOM_TAB_NAMES[id]}\\b`) });
}

export function roomPanel(page: Page): Locator {
  return page.getByRole('tabpanel');
}

/** Masks for room screenshots: the shared ones plus anything that depends on "now". */
export function roomScreenshotMasks(page: Page): Locator[] {
  return [...screenshotMasks(page), page.locator('[data-volatile]')];
}

/** seedContract + Checkout completed → an active contract. */
export async function seedActiveContract(
  request: APIRequestContext,
  opts: { customer: string; provider: string; title: string; plan: string; qaChecks?: string[] },
): Promise<Awaited<ReturnType<typeof seedContract>>> {
  const c = await seedContract(request, opts);
  await markContractPaid(request, c.contractId, c.totalCents);
  return c;
}

async function roomCall(
  request: APIRequestContext,
  method: 'GET' | 'POST',
  userId: string,
  path: string,
  data: Record<string, unknown> | undefined,
  expected: number[],
): Promise<RoomJson> {
  const res =
    method === 'GET'
      ? await request.get(path, { headers: auth(userId) })
      : await request.post(path, { headers: auth(userId), data: data ?? {} });
  const text = await res.text();
  expect(expected, `${method} ${path} → ${res.status()} ${text}`).toContain(res.status());
  return text ? JSON.parse(text) : null;
}

export function getRoomContract(request: APIRequestContext, userId: string, contractId: string): Promise<RoomJson> {
  return roomCall(request, 'GET', userId, `/api/contracts/${contractId}`, undefined, [200]);
}

export async function postRoomMessage(request: APIRequestContext, userId: string, contractId: string, body: string): Promise<RoomJson> {
  return (await roomCall(request, 'POST', userId, `/api/contracts/${contractId}/messages`, { body }, [201])).message;
}

export async function listRoomMessages(request: APIRequestContext, userId: string, contractId: string): Promise<RoomJson[]> {
  return (await roomCall(request, 'GET', userId, `/api/contracts/${contractId}/messages`, undefined, [200])).messages;
}

export async function postProgress(
  request: APIRequestContext,
  provider: string,
  contractId: string,
  update: { summary: string; details?: string; percent_complete?: number },
): Promise<RoomJson> {
  return (await roomCall(request, 'POST', provider, `/api/contracts/${contractId}/progress`, update, [201])).message;
}

export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

export async function addMilestone(
  request: APIRequestContext,
  provider: string,
  contractId: string,
  title: string,
  status: MilestoneStatus = 'pending',
): Promise<{ id: string }> {
  return (await roomCall(request, 'POST', provider, `/api/contracts/${contractId}/milestones`, { title, status }, [201])).milestone;
}

export interface SteeringInput {
  message: string;
  requested_kind?: 'clarification' | 'revision' | 'scope_change';
  spec_changes?: string[];
  price_cents?: number;
  deadline?: string;
}

export function createSteering(
  request: APIRequestContext,
  customer: string,
  contractId: string,
  input: SteeringInput,
): Promise<{ steering: RoomJson; decision: RoomJson }> {
  return roomCall(request, 'POST', customer, `/api/contracts/${contractId}/steering`, { ...input }, [201]);
}

export interface SteeringResponseInput {
  response: string;
  estimate_delta_cents?: number;
  eta_days?: number;
  deliverable_changes?: string[];
  decline?: boolean;
}

export function respondSteering(
  request: APIRequestContext,
  provider: string,
  contractId: string,
  steeringId: string,
  input: SteeringResponseInput,
): Promise<{ steering: RoomJson; new_contract_version?: RoomJson }> {
  return roomCall(request, 'POST', provider, `/api/contracts/${contractId}/steering/${steeringId}/respond`, { ...input }, [200]);
}

export function approveSteering(
  request: APIRequestContext,
  customer: string,
  contractId: string,
  steeringId: string,
): Promise<{
  steering: RoomJson;
  contract: RoomJson;
  version: RoomJson;
  checkout_url?: string;
  refund?: { amount_cents: number; status: string };
}> {
  return roomCall(request, 'POST', customer, `/api/contracts/${contractId}/steering/${steeringId}/approve`, {}, [200]);
}

/** One steering request as GET /api/contracts/:id/steering lists it. */
export async function getSteering(request: APIRequestContext, userId: string, contractId: string, steeringId: string): Promise<RoomJson> {
  const body = await roomCall(request, 'GET', userId, `/api/contracts/${contractId}/steering`, undefined, [200]);
  const arrays: RoomJson[][] = Array.isArray(body) ? [body] : Object.values(body ?? {}).filter((v): v is RoomJson[] => Array.isArray(v));
  const item = arrays.flat().find((x) => x?.id === steeringId);
  expect(item, `steering ${steeringId} not in ${JSON.stringify(body)}`).toBeTruthy();
  return item;
}

/** A customer scope change re-estimated by the provider (waiting for the customer). Returns the steering id. */
export async function seedEstimatedScopeChange(
  request: APIRequestContext,
  c: { customer: string; provider: string; contractId: string },
  opts: { message: string; specChanges?: string[]; deltaCents: number; etaDays?: number; deliverableChanges?: string[]; note?: string },
): Promise<string> {
  const { steering } = await createSteering(request, c.customer, c.contractId, {
    message: opts.message,
    requested_kind: 'scope_change',
    spec_changes: opts.specChanges ?? [],
  });
  const response: SteeringResponseInput = {
    response: opts.note ?? 'Here is the new estimate.',
    estimate_delta_cents: opts.deltaCents,
    deliverable_changes: opts.deliverableChanges ?? [],
  };
  if (opts.etaDays != null) response.eta_days = opts.etaDays;
  await respondSteering(request, c.provider, c.contractId, steering.id, response);
  return steering.id as string;
}

/** Stripe reports that a top-up Checkout session expired. */
export async function expireTopupCheckout(
  request: APIRequestContext,
  opts: { contractId: string; steeringId: string; sessionId: string },
): Promise<void> {
  const payload = JSON.stringify(
    makeEvent('checkout.session.expired', {
      id: opts.sessionId,
      object: 'checkout.session',
      status: 'expired',
      metadata: { kind: 'contract_topup', contract_id: opts.contractId, steering_request_id: opts.steeringId },
    }),
  );
  const hook = await postSignedWebhook(request, payload);
  expect(hook.status(), await hook.text()).toBe(200);
}

// --- submissions and QA (Jobs MCP send_project + admin QA MCP) ---------------------

async function mcpTool(
  request: APIRequestContext,
  path: string,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<RoomJson> {
  const res = await request.post(path, {
    headers: { ...auth(userId), 'content-type': 'application/json' },
    data: { jsonrpc: '2.0', id: rand(), method: 'tools/call', params: { name, arguments: args } },
  });
  const text = await res.text();
  expect(res.status(), `${name}: ${text}`).toBe(200);
  const body = JSON.parse(text);
  expect(body.result, `${name}: ${text}`).toBeDefined();
  expect(body.result.isError, `${name}: ${text}`).toBeFalsy();
  return body.result.structuredContent;
}

export const SUBMITTED_REPO = FAKE_REPOS.private;

/** The provider submits acme/private-repo at its head commit → a submission waiting for QA. */
export async function sendProject(request: APIRequestContext, provider: string, contractId: string): Promise<{ id: string; attempt: number }> {
  const sc = await mcpTool(request, '/api/jobs/mcp', provider, 'send_project', {
    contract_id: contractId,
    git_repo: FAKE_REPOS.private,
    pat_token: FAKE_TOKENS.good,
  });
  return sc.submission;
}

/** The QA admin fetches the credentials, which puts the submission in review. */
export async function startQaReview(request: APIRequestContext, submissionId: string): Promise<void> {
  await mcpTool(request, '/api/admin/qa/mcp', ADMIN_USER, 'qa_credentials_get', { submission_id: submissionId });
}

export async function markQa(
  request: APIRequestContext,
  submissionId: string,
  verdict: 'validated' | 'requires_changes' | 'rejected',
  reason: string,
): Promise<void> {
  await mcpTool(request, '/api/admin/qa/mcp', ADMIN_USER, 'qa_mark', { submission_id: submissionId, verdict, reason });
}

// --- a fixed, populated room (a11y + visual) ----------------------------------------

export interface RoomScenario {
  customer: string;
  provider: string;
  contractId: string;
  texts: {
    title: string;
    plan: string;
    milestones: string[];
    customerMessage: string;
    providerMessage: string;
    progressSummary: string;
    clarification: string;
    clarificationAnswer: string;
    revision: string;
    scopeChange: string;
    openQuestion: string;
    qaReason: string;
  };
}

/**
 * An active contract with three milestones, two messages, a progress update, an answered
 * clarification and revision, and an approved scope change that lowered the price
 * (Version 2, €250, refund). `openQuestion` leaves a clarification waiting for an answer;
 * `deliver` adds attempt 1 (changes requested) and attempt 2 (validated → delivered).
 * Every rendered text is fixed per `word`; ids never reach the page text.
 */
export async function seedRoomScenario(
  request: APIRequestContext,
  word: string,
  opts: { openQuestion?: boolean; deliver?: boolean } = {},
): Promise<RoomScenario> {
  const customer = uid(`${word}cust`);
  const provider = uid(`${word}prov`);
  const texts: RoomScenario['texts'] = {
    title: `CSV importer for the ${word} shop`,
    plan: `Stream the ${word} files, validate each row with a schema and add tests.`,
    milestones: ['Schema and parser', 'Row validation', 'Error report'],
    customerMessage: `Hi, the ${word} sample files are in the shared folder.`,
    providerMessage: 'Thanks, starting with the parser today.',
    progressSummary: 'Parser done, validation next',
    clarification: 'Should empty rows be skipped?',
    clarificationAnswer: 'Yes, empty rows are skipped and counted.',
    revision: 'Please rename the error column to reason.',
    scopeChange: 'Also accept semicolon separated files.',
    openQuestion: 'Which Postgres version do you target?',
    qaReason: 'Empty files crash the importer.',
  };
  const { contractId } = await seedActiveContract(request, { customer, provider, title: texts.title, plan: texts.plan });
  const statuses: MilestoneStatus[] = ['done', 'in_progress', 'pending'];
  for (let i = 0; i < texts.milestones.length; i += 1) {
    await addMilestone(request, provider, contractId, texts.milestones[i], statuses[i]);
  }
  await postRoomMessage(request, customer, contractId, texts.customerMessage);
  await postRoomMessage(request, provider, contractId, texts.providerMessage);
  await postProgress(request, provider, contractId, {
    summary: texts.progressSummary,
    details: 'Streams a 10 MB file in under a second.',
    percent_complete: 40,
  });
  const clar = await createSteering(request, customer, contractId, { message: texts.clarification, requested_kind: 'clarification' });
  await respondSteering(request, provider, contractId, clar.steering.id, { response: texts.clarificationAnswer });
  const rev = await createSteering(request, customer, contractId, { message: texts.revision, requested_kind: 'revision' });
  await respondSteering(request, provider, contractId, rev.steering.id, { response: 'Done, the column is now called reason.' });
  const scope = await seedEstimatedScopeChange(request, { customer, provider, contractId }, {
    message: texts.scopeChange,
    specChanges: ['Accept semicolon separated files'],
    deltaCents: -5000,
    // no etaDays: an ETA moves the deadline relative to today, which would change the screenshots daily
    deliverableChanges: ['Sample semicolon file'],
    note: 'Semicolon support, and less work than planned elsewhere.',
  });
  await approveSteering(request, customer, contractId, scope);
  if (opts.openQuestion) {
    await createSteering(request, customer, contractId, { message: texts.openQuestion, requested_kind: 'clarification' });
  }
  if (opts.deliver) {
    const first = await sendProject(request, provider, contractId);
    await startQaReview(request, first.id);
    await markQa(request, first.id, 'requires_changes', texts.qaReason);
    const second = await sendProject(request, provider, contractId);
    await startQaReview(request, second.id);
    await markQa(request, second.id, 'validated', 'Meets the spec');
  }
  return { customer, provider, contractId, texts };
}
