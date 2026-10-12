import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { FAKE_SHA_HEAD, FAKE_TOKENS } from '../support/fake-github';
import { ADMIN_USER, newProjectContext, openGigs, signIn, uid, rand, trackAppPosts } from '../support/gigs-ui';
import {
  BID_CENTS,
  CRON_SECRET,
  DAY,
  PHASE5_ENV_MISSING,
  QA_FINDING_TITLE,
  acceptDelivery,
  contractAt,
  dateRe,
  deliveryPath,
  deliveryUrl,
  emptyTarget,
  escapeRe,
  expectApiError,
  fakeGithubHead,
  getDelivery,
  getJson,
  openDispute,
  postJson,
  postReview,
  registerPushTarget,
  type DeliveryContract,
  type Json,
} from '../support/gigs-delivery';

/**
 * Phase 5 behaviour: delivery (download, push), acceptance and payout, disputes and their
 * admin resolution, reviews, trust, cron routes, monthly credit grants, and the delivery page
 * `/gigs/contracts/{id}/delivery`. Runs under `npm run test:e2e:gigs` (throwaway DB, fake
 * Stripe, fake GitHub, e2e identity header). Written from the contract only.
 */

test.skip(PHASE5_ENV_MISSING, 'gigs QA e2e env not set');

const FIVE = { overall: 5, quality: 5, communication: 5, timeliness: 5 };
const title = (what: string) => `E2E delivery ${what} ${rand()}`;

function near(actualIso: string, expectedMs: number, toleranceMs = 10 * 60_000): void {
  const t = Date.parse(actualIso);
  expect(Number.isNaN(t), `not a date: ${actualIso}`).toBe(false);
  expect(Math.abs(t - expectedMs), `${actualIso} vs ${new Date(expectedMs).toISOString()}`).toBeLessThan(toleranceMs);
}

// ===========================================================================
// API: delivery before QA validation
// ===========================================================================

test.describe('delivery API: before QA validation', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  const customer = uid('dlcust');
  const provider = uid('dlprov');
  const stranger = uid('dlstranger');
  let c: DeliveryContract;

  test('setup: a paid contract with a submission awaiting QA', async ({ request }) => {
    c = await contractAt(request, { customer, provider, title: title('locked'), stage: 'submitted' });
  });

  test('GET delivery → 200 for both parties, locked, with the documented shape and no PAT', async ({ request }) => {
    for (const [who, role] of [
      [customer, 'customer'],
      [provider, 'provider'],
    ] as const) {
      const d = await getDelivery(request, c.contractId, who);
      expect(d.contract).toMatchObject({ id: c.contractId, job_id: c.jobId, job_title: c.title, role, currency: 'eur' });
      expect(d.contract.accepted_at).toBeNull();
      expect(d.delivery.unlocked).toBe(false);
      for (const k of ['submission_id', 'attempt', 'commit_sha', 'unlocked_at', 'auto_accept_at', 'auto_accept_paused', 'pat_available']) {
        expect(d.delivery, `delivery.${k}`).toHaveProperty(k);
      }
      expect(d.qa).toBeNull();
      expect(Array.isArray(d.history)).toBe(true);
      expect(d.history).toHaveLength(1);
      expect(d.history[0]).toMatchObject({ attempt: 1, commit_sha: FAKE_SHA_HEAD });
      expect(Array.isArray(d.contract_versions)).toBe(true);
      expect(d.contract_versions.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(d.deliveries)).toBe(true);
      expect(d.payout).toBeNull();
      expect(d.dispute).toBeNull();
      expect(d.actions).toMatchObject({ can_download: false, can_push: false, can_accept: false });
      for (const k of ['can_dispute', 'dispute_phase', 'claim_window_ends_at', 'can_review']) {
        expect(d.actions, `actions.${k}`).toHaveProperty(k);
      }
      expect(d.actions.can_review).toBe(false);
      expect(d.reviews).toEqual({ mine: null, theirs: null });
    }
  });

  test('GET delivery: stranger → 404 not_found, signed out → 401 unauthorized, non-UUID → 400', async ({ request }) => {
    expectApiError(await getJson(request, deliveryPath(c.contractId), stranger), 404, 'not_found');
    expectApiError(await getJson(request, deliveryPath(c.contractId), null), 401, 'unauthorized');
    const bad = await getJson(request, deliveryPath('not-a-uuid'), customer);
    expect(bad.status, bad.text).toBe(400);
  });

  test('download before validation → 409 delivery_locked', async ({ request }) => {
    expectApiError(await getJson(request, `${deliveryPath(c.contractId)}/download`, customer), 409, 'delivery_locked');
  });

  test('push before validation is refused (409)', async ({ request }) => {
    const target = await emptyTarget(request);
    const r = await postJson(request, `${deliveryPath(c.contractId)}/push`, customer, { repo: target.repo, token: target.token });
    expect(r.status, r.text).toBe(409);
  });

  test('accept before delivery → 409 (not_acceptable or delivery_locked)', async ({ request }) => {
    const r = await postJson(request, `/api/contracts/${c.contractId}/accept`, customer, {});
    expectApiError(r, 409, /^(not_acceptable|delivery_locked)$/);
  });

  test('review before acceptance → 409 review_not_allowed', async ({ request }) => {
    expectApiError(await postReview(request, c.contractId, customer, FIVE), 409, 'review_not_allowed');
  });
});

// ===========================================================================
// API: delivered → download → push → accept → payout → reviews → trust → claim
// ===========================================================================

test.describe('delivery API: delivered, accepted and reviewed', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  const customer = uid('dvcust');
  const provider = uid('dvprov');
  let c: DeliveryContract;
  let validatedAt = 0;
  let acceptedAt = '';
  let providerPrincipal = '';

  test('setup: a delivered contract (QA validated with a report and one finding)', async ({ request }) => {
    c = await contractAt(request, { customer, provider, title: title('ready'), stage: 'delivered' });
    validatedAt = Date.now();
    expect(c.totalCents).toBe(34500);
  });

  test('GET delivery as the customer: unlocked at the QA-validated commit with the report, history and versions', async ({
    request,
  }) => {
    const d = await getDelivery(request, c.contractId, customer);
    expect(d.contract).toMatchObject({ id: c.contractId, status: 'delivered', role: 'customer', currency: 'eur', acceptance: null });
    expect(d.delivery).toMatchObject({
      unlocked: true,
      submission_id: c.submissionId,
      attempt: 1,
      commit_sha: FAKE_SHA_HEAD,
      auto_accept_paused: false,
      pat_available: true,
    });
    near(d.delivery.unlocked_at, validatedAt);
    near(d.delivery.auto_accept_at, Date.parse(d.delivery.unlocked_at) + 7 * DAY);
    expect(d.qa).toMatchObject({ verdict: 'validated' });
    expect(d.qa.report_md).toContain('All acceptance criteria pass.');
    expect(d.qa.warnings).toEqual([expect.objectContaining({ severity: 'low', title: QA_FINDING_TITLE })]);
    expect(Number.isNaN(Date.parse(d.qa.reviewed_at))).toBe(false);
    expect(d.history).toHaveLength(1);
    expect(d.history[0]).toMatchObject({ attempt: 1, commit_sha: FAKE_SHA_HEAD, verdict: 'validated' });
    const current = (d.contract_versions as Json[]).filter((v) => v.current);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ version: 1, price_cents: BID_CENTS, customer_total_cents: 34500 });
    for (const k of ['fee_cents', 'deadline', 'steering_allowance', 'created_at']) expect(current[0]).toHaveProperty(k);
    expect(d.payment).toMatchObject({ amount_cents: 34500, refunded_cents: 0 });
    expect(d.payout).toBeNull();
    expect(d.dispute).toBeNull();
    expect(d.actions).toMatchObject({
      can_download: true,
      can_push: true,
      can_accept: true,
      can_dispute: true,
      dispute_phase: 'pre_accept',
      can_review: false,
    });
  });

  test('GET delivery as the provider: same delivery, but no customer actions', async ({ request }) => {
    const d = await getDelivery(request, c.contractId, provider);
    expect(d.contract).toMatchObject({ status: 'delivered', role: 'provider' });
    expect(d.delivery).toMatchObject({ unlocked: true, commit_sha: FAKE_SHA_HEAD });
    expect(d.actions).toMatchObject({ can_download: false, can_push: false, can_accept: false, can_dispute: false });
  });

  test('download: provider → 403 forbidden; customer → a gzip tarball attachment', async ({ request }) => {
    const path = `${deliveryPath(c.contractId)}/download`;
    expectApiError(await getJson(request, path, provider), 403, 'forbidden');
    const r = await getJson(request, path, customer);
    expect(r.status, r.text.slice(0, 200)).toBe(200);
    expect(r.res.headers()['content-type']).toMatch(/^application\/gzip/);
    const disposition = r.res.headers()['content-disposition'] ?? '';
    expect(disposition).toMatch(/^attachment/);
    expect(disposition).toMatch(/filename\*?=[^;]*\.tar\.gz"?$/);
    const body = await r.res.body();
    expect(body.length).toBeGreaterThan(20);
    expect(body[0]).toBe(0x1f);
    expect(body[1]).toBe(0x8b);
  });

  test('push: public repo, non-empty repo, classic PAT and no write permission → 422 with the specific code', async ({
    request,
  }) => {
    const push = (repo: string, token: string) =>
      postJson(request, `${deliveryPath(c.contractId)}/push`, customer, { repo, token });

    const pub = `cust/public-${rand()}`;
    expectApiError(await push(pub, await registerPushTarget(request, { full_name: pub, private: false, empty: true })), 422, 'public_repo');

    const full = `cust/full-${rand()}`;
    expectApiError(await push(full, await registerPushTarget(request, { full_name: full })), 422, 'repo_not_empty');

    expectApiError(await push(`cust/classic-${rand()}`, FAKE_TOKENS.classic), 422, 'classic_pat');

    const ro = `cust/readonly-${rand()}`;
    const roToken = await registerPushTarget(request, {
      full_name: ro,
      empty: true,
      permissions: { admin: false, push: false, pull: true },
    });
    expectApiError(await push(ro, roToken), 422, 'push_not_allowed');
  });

  test('push by the provider → 403 forbidden', async ({ request }) => {
    const target = await emptyTarget(request);
    const r = await postJson(request, `${deliveryPath(c.contractId)}/push`, provider, { repo: target.repo, token: target.token });
    expectApiError(r, 403, 'forbidden');
  });

  test('push to an empty private repo → succeeded, the target head is the pushed commit', async ({ request }) => {
    const target = await emptyTarget(request);
    const r = await postJson(request, `${deliveryPath(c.contractId)}/push`, customer, { repo: target.repo, token: target.token });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({ status: 'succeeded', target_repo: target.repo, source_commit_sha: FAKE_SHA_HEAD });
    expect(r.body.pushed_commit_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(r.body.file_count).toBeGreaterThan(0);
    expect(await fakeGithubHead(request, target.repo, target.token)).toBe(r.body.pushed_commit_sha);

    const d = await getDelivery(request, c.contractId, customer);
    expect(d.deliveries.length).toBeGreaterThanOrEqual(1);
  });

  test('accept: provider → 403 forbidden', async ({ request }) => {
    expectApiError(await postJson(request, `/api/contracts/${c.contractId}/accept`, provider, {}), 403, 'forbidden');
  });

  test('accept by the customer → completed, payout paid for the bid amount', async ({ request }) => {
    const before = Date.now();
    const body = await acceptDelivery(request, c.contractId, customer);
    expect(body).toMatchObject({
      contract_id: c.contractId,
      status: 'completed',
      acceptance: 'customer',
      payout: { status: 'paid', amount_cents: BID_CENTS },
    });
    expect(typeof body.payout.transfer_id).toBe('string');
    expect(body.payout.transfer_id.length).toBeGreaterThan(0);
    near(body.accepted_at, before);
    acceptedAt = body.accepted_at;
  });

  test('accept again → 409 not_acceptable', async ({ request }) => {
    expectApiError(await postJson(request, `/api/contracts/${c.contractId}/accept`, customer, {}), 409, 'not_acceptable');
  });

  test('download after acceptance → still the gzip tarball, served from the kept snapshot', async ({ request }) => {
    const r = await getJson(request, `${deliveryPath(c.contractId)}/download`, customer);
    expect(r.status, r.text.slice(0, 200)).toBe(200);
    const body = await r.res.body();
    expect([body[0], body[1]]).toEqual([0x1f, 0x8b]);
  });

  test('GET delivery after acceptance: completed, payout, claim window of 14 days, reviews open', async ({ request }) => {
    const d = await getDelivery(request, c.contractId, customer);
    expect(d.contract).toMatchObject({ status: 'completed', acceptance: 'customer', accepted_at: acceptedAt });
    expect(d.delivery.pat_available).toBe(false);
    expect(d.delivery.snapshot_available).toBe(true);
    expect(d.delivery.files_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(d.payout).toMatchObject({ status: 'paid', amount_cents: BID_CENTS, reversed_cents: 0 });
    expect(d.actions).toMatchObject({
      can_download: true,
      can_push: true,
      can_accept: false,
      can_dispute: true,
      dispute_phase: 'post_accept',
      can_review: true,
    });
    near(d.actions.claim_window_ends_at, Date.parse(acceptedAt) + 14 * DAY, 60_000);

    const p = await getDelivery(request, c.contractId, provider);
    expect(p.payout).toMatchObject({ status: 'paid', amount_cents: BID_CENTS });
    expect(p.actions.can_review).toBe(true);
  });

  test('reviews: out-of-range score → 400 invalid_request', async ({ request }) => {
    expectApiError(await postReview(request, c.contractId, customer, { ...FIVE, overall: 0 }), 400, 'invalid_request');
    expectApiError(await postReview(request, c.contractId, customer, { ...FIVE, quality: 6 }), 400, 'invalid_request');
  });

  test('reviews: customer → 201, again → 409 already_reviewed; provider reviews the customer → 201', async ({ request }) => {
    const first = await postReview(request, c.contractId, customer, { ...FIVE, quality: 4, body: 'Clean importer, good tests.' });
    expect(first.status, first.text).toBe(201);
    expect(first.body.review).toMatchObject({ overall: 5, quality: 4, communication: 5, timeliness: 5 });

    expectApiError(await postReview(request, c.contractId, customer, FIVE), 409, 'already_reviewed');

    const back = await postReview(request, c.contractId, provider, { overall: 4, quality: 4, communication: 4, timeliness: 4 });
    expect(back.status, back.text).toBe(201);

    const list = await getJson(request, `/api/contracts/${c.contractId}/reviews`, customer);
    expect(list.status, list.text).toBe(200);
    expect(list.body.reviews).toHaveLength(2);

    const d = await getDelivery(request, c.contractId, customer);
    expect(d.reviews.mine).toMatchObject({ overall: 5 });
    expect(d.reviews.theirs).toMatchObject({ overall: 4 });
    expect(d.actions.can_review).toBe(false);
  });

  test('GET /api/profile/reputation: the provider sees the review and a trust score', async ({ request }) => {
    const r = await getJson(request, '/api/profile/reputation', provider);
    expect(r.status, r.text).toBe(200);
    const mine = (r.body.reviews as Json[]).find((x) => x.contract_id === c.contractId);
    expect(mine).toMatchObject({
      reviewer_role: 'customer',
      overall: 5,
      quality: 4,
      communication: 5,
      timeliness: 5,
      body: 'Clean importer, good tests.',
      job_title: c.title,
    });
    for (const k of ['id', 'reviewer_name', 'agent_version', 'created_at']) expect(mine).toHaveProperty(k);
    expect(r.body.summary).toMatchObject({ count: 1, average: 5 });
    for (const k of ['as_provider', 'as_customer']) expect(r.body.summary).toHaveProperty(k);
    const t = r.body.trust.provider;
    expect(t, r.text).not.toBeNull();
    expect(Number.isInteger(t.score)).toBe(true);
    expect(t.score).toBeGreaterThanOrEqual(0);
    expect(t.score).toBeLessThanOrEqual(100);
    expect(['new', 'building', 'established']).toContain(t.level);
    expect(t.review_count).toBe(1);
    expect(Array.isArray(t.breakdown)).toBe(true);
    for (const b of t.breakdown as Json[]) {
      for (const k of ['key', 'label', 'value', 'weight', 'evidence']) expect(b).toHaveProperty(k);
    }
    for (const k of ['principal_id', 'user_id', 'average_rating', 'counted', 'computed_at']) expect(t).toHaveProperty(k);
    expect(Array.isArray(r.body.trust.agents)).toBe(true);
    providerPrincipal = t.principal_id;

    const cust = await getJson(request, '/api/profile/reputation', customer);
    expect(cust.status, cust.text).toBe(200);
    const fromProvider = (cust.body.reviews as Json[]).find((x) => x.contract_id === c.contractId);
    expect(fromProvider).toMatchObject({ reviewer_role: 'provider', overall: 4 });
  });

  test('GET /api/profile/reputation signed out → 401', async ({ request }) => {
    expectApiError(await getJson(request, '/api/profile/reputation', null), 401);
  });

  test('GET /api/trust: badge for a known principal, unknown ids absent, non-UUIDs → 400', async ({ request }) => {
    const unknown = randomUUID();
    const r = await getJson(request, `/api/trust?principal_ids=${providerPrincipal},${unknown}`, null);
    expect(r.status, r.text).toBe(200);
    expect(r.body.badges[providerPrincipal]).toMatchObject({ review_count: 1, average_rating: 5 });
    expect(Number.isInteger(r.body.badges[providerPrincipal].score)).toBe(true);
    expect(['new', 'building', 'established']).toContain(r.body.badges[providerPrincipal].level);
    expect(r.body.badges).not.toHaveProperty(unknown);
    const bad = await getJson(request, '/api/trust?principal_ids=abc,def', null);
    expect(bad.status, bad.text).toBe(400);
  });

  test('a post-accept claim → 201 post_accept; a second one while open → 409 dispute_open', async ({ request }) => {
    const dispute = await openDispute(request, c.contractId, customer, {
      category: 'quality',
      reason: 'The importer crashes on files over 5 MB.',
    });
    expect(dispute).toMatchObject({ status: 'open', phase: 'post_accept', category: 'quality' });
    expect(typeof dispute.id).toBe('string');
    const again = await postJson(request, `/api/contracts/${c.contractId}/dispute`, customer, {
      category: 'other',
      reason: 'Another problem with the delivery.',
    });
    expectApiError(again, 409, 'dispute_open');
    const d = await getDelivery(request, c.contractId, customer);
    expect(d.dispute).toMatchObject({ id: dispute.id, phase: 'post_accept', status: 'open', category: 'quality' });
    expect(d.contract.status).toBe('completed');
  });
});

// ===========================================================================
// API: pre-accept disputes and admin resolution
// ===========================================================================

test.describe('disputes API: pre-accept dispute, admin list, detail and resolution', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  const customer = uid('dscust');
  const provider = uid('dsprov');
  const reason = `The CSV export is missing entirely ${rand()}`;
  let refundC: DeliveryContract;
  let releaseC: DeliveryContract;
  let refundDisputeId = '';
  let releaseDisputeId = '';

  test('setup: two delivered contracts', async ({ request }) => {
    refundC = await contractAt(request, { customer, provider, title: title('refund'), stage: 'delivered' });
    releaseC = await contractAt(request, { customer, provider, title: title('release'), stage: 'delivered' });
  });

  test('dispute: provider → 403 forbidden; reason under 10 chars → 400 invalid_request', async ({ request }) => {
    const path = `/api/contracts/${refundC.contractId}/dispute`;
    expectApiError(await postJson(request, path, provider, { category: 'incomplete', reason }), 403, 'forbidden');
    expectApiError(await postJson(request, path, customer, { category: 'incomplete', reason: 'too short' }), 400, 'invalid_request');
  });

  test('pre-accept dispute → 201 open; contract disputed, can_accept false', async ({ request }) => {
    const dispute = await openDispute(request, refundC.contractId, customer, {
      category: 'incomplete',
      reason,
      evidence: 'See the README: no export command.',
    });
    expect(dispute).toMatchObject({ status: 'open', phase: 'pre_accept', category: 'incomplete' });
    refundDisputeId = dispute.id;

    expectApiError(
      await postJson(request, `/api/contracts/${refundC.contractId}/dispute`, customer, { category: 'other', reason: 'Once more with feeling.' }),
      409,
      'dispute_open',
    );
    const d = await getDelivery(request, refundC.contractId, customer);
    expect(d.contract.status).toBe('disputed');
    expect(d.actions.can_accept).toBe(false);
    expect(d.dispute).toMatchObject({ id: refundDisputeId, source: 'customer', phase: 'pre_accept', status: 'open', reason });

    releaseDisputeId = (await openDispute(request, releaseC.contractId, customer)).id;
  });

  test('GET /api/admin/disputes: non-admin → 403; admin sees the open dispute with parties and money', async ({ request }) => {
    expectApiError(await getJson(request, '/api/admin/disputes?status=open', customer), 403, 'forbidden');
    const r = await getJson(request, '/api/admin/disputes?status=open', ADMIN_USER);
    expect(r.status, r.text).toBe(200);
    const item = (r.body.items as Json[]).find((i) => i.id === refundDisputeId);
    expect(item, 'dispute not in the open list').toBeDefined();
    expect(item).toMatchObject({
      contract_id: refundC.contractId,
      job_title: refundC.title,
      contract_status: 'disputed',
      source: 'customer',
      phase: 'pre_accept',
      category: 'incomplete',
      status: 'open',
      resolution: null,
      reason,
      price_cents: BID_CENTS,
      customer_total_cents: 34500,
      currency: 'eur',
    });
    expect(item.customer).toMatchObject({ user_id: customer });
    expect(item.provider).toMatchObject({ user_id: provider });
    for (const k of ['name', 'email', 'plan']) expect(item.customer).toHaveProperty(k);
    for (const k of ['default_resolution', 'created_at', 'resolved_at', 'stripe_dispute_status']) expect(item).toHaveProperty(k);
  });

  test('GET /api/admin/disputes/{id}: non-admin → 403; admin gets dispute, contract, parties, money and previews', async ({
    request,
  }) => {
    expectApiError(await getJson(request, `/api/admin/disputes/${refundDisputeId}`, customer), 403, 'forbidden');
    const r = await getJson(request, `/api/admin/disputes/${refundDisputeId}`, ADMIN_USER);
    expect(r.status, r.text).toBe(200);
    expect(r.body.dispute).toMatchObject({ id: refundDisputeId, status: 'open', category: 'incomplete' });
    expect(r.body.contract).toMatchObject({ id: refundC.contractId, status: 'disputed', job_title: refundC.title, currency: 'eur' });
    expect(r.body.parties.customer).toMatchObject({ user_id: customer });
    expect(r.body.parties.provider).toMatchObject({ user_id: provider });
    expect(r.body.money).toMatchObject({
      paid_cents: 34500,
      refunded_cents: 0,
      bid_cents: BID_CENTS,
      transferred_cents: 0,
      reversed_cents: 0,
      refundable_cents: 34500,
    });
    expect(r.body.money).toHaveProperty('fee_cents');
    expect(r.body.previews).toHaveProperty('release');
    expect(r.body.previews).toHaveProperty('full_refund');
    expect(Array.isArray(r.body.qa_history)).toBe(true);
    expect(Array.isArray(r.body.other_disputes)).toBe(true);
  });

  test('resolve: non-admin → 403; partial_refund without refund_cents → 422 invalid_amount', async ({ request }) => {
    const path = `/api/admin/disputes/${refundDisputeId}/resolve`;
    expectApiError(await postJson(request, path, customer, { outcome: 'full_refund', note: 'Refunding.' }), 403, 'forbidden');
    expectApiError(await postJson(request, path, ADMIN_USER, { outcome: 'partial_refund', note: 'Half.' }), 422, 'invalid_amount');
  });

  test('resolve full_refund before payout → refunded 34500, nothing transferred; again → 409 invalid_state', async ({ request }) => {
    const path = `/api/admin/disputes/${refundDisputeId}/resolve`;
    const r = await postJson(request, path, ADMIN_USER, { outcome: 'full_refund', note: 'The export is missing; refunding in full.' });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({
      dispute: { status: 'resolved', resolution: 'full_refund' },
      contract_status: 'refunded',
      refunded_cents: 34500,
      reversed_cents: 0,
      transferred_cents: 0,
    });
    expectApiError(await postJson(request, path, ADMIN_USER, { outcome: 'release', note: 'Changed my mind.' }), 409, 'invalid_state');

    const open = await getJson(request, '/api/admin/disputes?status=open', ADMIN_USER);
    expect((open.body.items as Json[]).some((i) => i.id === refundDisputeId)).toBe(false);
    const resolved = await getJson(request, '/api/admin/disputes?status=resolved', ADMIN_USER);
    expect((resolved.body.items as Json[]).find((i) => i.id === refundDisputeId)).toMatchObject({
      status: 'resolved',
      resolution: 'full_refund',
    });
    const all = await getJson(request, '/api/admin/disputes?status=all', ADMIN_USER);
    expect((all.body.items as Json[]).some((i) => i.id === refundDisputeId)).toBe(true);

    const d = await getDelivery(request, refundC.contractId, customer);
    expect(d.contract.status).toBe('refunded');
    expect(d.dispute).toMatchObject({ status: 'resolved', resolution: 'full_refund', refund_cents: 34500 });
    expect(d.payment).toMatchObject({ refunded_cents: 34500 });
  });

  test('resolve release before payout → completed with 30000 transferred; then reviews are open', async ({ request }) => {
    const r = await postJson(request, `/api/admin/disputes/${releaseDisputeId}/resolve`, ADMIN_USER, {
      outcome: 'release',
      note: 'The delivery matches the spec.',
    });
    expect(r.status, r.text).toBe(200);
    expect(r.body).toMatchObject({
      dispute: { status: 'resolved', resolution: 'release' },
      contract_status: 'completed',
      transferred_cents: BID_CENTS,
    });
    const d = await getDelivery(request, releaseC.contractId, provider);
    expect(d.contract.status).toBe('completed');
    expect(d.payout).toMatchObject({ amount_cents: BID_CENTS });
    const review = await postReview(request, releaseC.contractId, customer, { ...FIVE, overall: 3 });
    expect(review.status, review.text).toBe(201);
  });

  test('a QA rejected verdict opens a qa_rejected dispute that defaults to a full refund', async ({ request }) => {
    const rejected = await contractAt(request, {
      customer,
      provider,
      title: title('rejected'),
      stage: 'rejected',
      rejectReason: 'Nothing in the repository matches the spec.',
    });
    const r = await getJson(request, '/api/admin/disputes?status=open', ADMIN_USER);
    expect(r.status, r.text).toBe(200);
    const item = (r.body.items as Json[]).find((i) => i.contract_id === rejected.contractId);
    expect(item, 'no dispute for the rejected contract').toBeDefined();
    expect(item).toMatchObject({ source: 'qa_rejected', status: 'open', default_resolution: 'full_refund' });
  });
});

test('accept while a pre-accept dispute is open → 409 dispute_open', async ({ request }) => {
  test.setTimeout(120_000);
  const customer = uid('dacust');
  const c = await contractAt(request, { customer, provider: uid('daprov'), title: title('accept blocked'), stage: 'delivered' });
  await openDispute(request, c.contractId, customer);
  expectApiError(await postJson(request, `/api/contracts/${c.contractId}/accept`, customer, {}), 409, 'dispute_open');
  expect((await getDelivery(request, c.contractId, customer)).contract.status).toBe('disputed');
});

// ===========================================================================
// API: cron routes and credit grants
// ===========================================================================

test.describe('cron routes', () => {
  const ROUTES: Array<{ path: string; keys: string[]; methods: Array<'GET' | 'POST'> }> = [
    { path: '/api/cron/auto-accept', keys: ['accepted', 'reminded', 'skipped', 'payouts_retried', 'errors'], methods: ['POST', 'GET'] },
    { path: '/api/cron/trust-decay', keys: ['recomputed', 'failed'], methods: ['GET'] },
    { path: '/api/cron/credit-grants', keys: ['granted', 'duplicates', 'expired', 'errors'], methods: ['GET'] },
  ];

  for (const { path, keys, methods } of ROUTES) {
    for (const method of methods) {
      test(`${method} ${path}: no or wrong Authorization → 401, the cron secret → 200 with counts`, async ({ request }) => {
        const call = (headers: Record<string, string>) =>
          method === 'GET' ? request.get(path, { headers, maxRedirects: 0 }) : request.post(path, { headers, maxRedirects: 0 });
        expect((await call({})).status()).toBe(401);
        expect((await call({ authorization: 'Bearer wrong-secret' })).status()).toBe(401);
        expect((await call({ authorization: CRON_SECRET })).status()).toBe(401);
        const ok = await call({ authorization: `Bearer ${CRON_SECRET}` });
        const text = await ok.text();
        expect(ok.status(), text).toBe(200);
        const body = JSON.parse(text) as Json;
        for (const k of keys) expect(body, `${path}.${k}`).toHaveProperty(k);
        if (path.endsWith('auto-accept')) {
          expect(Array.isArray(body.accepted)).toBe(true);
          expect(Array.isArray(body.reminded)).toBe(true);
          for (const k of ['skipped', 'payouts_retried', 'errors']) expect(typeof body[k]).toBe('number');
        }
      });
    }
  }
});

test.describe('credit grants API', () => {
  test('GET /api/credits/grants signed in → plan, monthly credits, current and history', async ({ request }) => {
    const r = await getJson(request, '/api/credits/grants', uid('grants'));
    expect(r.status, r.text).toBe(200);
    for (const k of ['plan', 'monthly_credits', 'current', 'history']) expect(r.body).toHaveProperty(k);
    expect(typeof r.body.monthly_credits).toBe('number');
    expect(Array.isArray(r.body.history)).toBe(true);
    if (r.body.current) {
      for (const k of ['period', 'period_start', 'period_end', 'credits', 'remaining_credits', 'plan']) {
        expect(r.body.current).toHaveProperty(k);
      }
    }
  });

  test('GET /api/credits/grants signed out → 401', async ({ request }) => {
    expectApiError(await getJson(request, '/api/credits/grants', null), 401);
  });
});

// ===========================================================================
// UI: the delivery page
// ===========================================================================

const main = (page: Page) => page.locator('#main');
const chip = (page: Page, text: string) => main(page).getByText(text, { exact: true }).first();

async function openDelivery(page: Page, contractId: string): Promise<void> {
  await openGigs(page, deliveryUrl(contractId), { signedIn: true });
  await expect(page.getByRole('heading', { level: 1, name: 'Delivery' })).toBeVisible();
}

const LOCKED_TEXT = 'The delivery unlocks once QA validates the work and the payment has gone through.';
const ACCEPT_CONFIRM =
  "Accepting releases the payment to the provider and ends the platform's access to their repository. The QA'd commit stays available to download.";

test.describe('delivery page: access and locked state', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  const customer = uid('uilcust');
  const provider = uid('uilprov');
  let c: DeliveryContract;

  test('setup', async ({ request }) => {
    c = await contractAt(request, { customer, provider, title: title('ui locked'), stage: 'submitted' });
  });

  test('signed out → sign-in; a signed-in stranger → 404', async ({ page, browser }, testInfo) => {
    await page.goto(deliveryUrl(c.contractId));
    await page.waitForURL(/\/sign-in/);
    const ctx = await newProjectContext(browser, testInfo, uid('uistranger'));
    try {
      const res = await (await ctx.newPage()).goto(deliveryUrl(c.contractId));
      expect(res?.status()).toBe(404);
    } finally {
      await ctx.close();
    }
  });

  test('customer, locked: header, "Waiting for QA", the unlock note, no download and no accept', async ({ page, context }) => {
    await signIn(context, customer);
    await openDelivery(page, c.contractId);
    await expect(page.getByRole('link', { name: '← Back to the contract' })).toHaveAttribute('href', `/gigs/contracts/${c.contractId}`);
    await expect(main(page)).toContainText(c.title);
    await expect(chip(page, 'Waiting for QA')).toBeVisible();
    await expect(main(page).getByText('New on Tulzo')).toBeVisible();
    await expect(main(page).getByText(LOCKED_TEXT)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download .tar.gz' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accept delivery' })).toHaveCount(0);
  });
});

test.describe('delivery page: ready, push, accept, review (customer and provider)', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  const customer = uid('uircust');
  const provider = uid('uirprov');
  let c: DeliveryContract;
  let autoAcceptAt = '';

  test('setup', async ({ request }) => {
    c = await contractAt(request, { customer, provider, title: title('ui ready'), stage: 'delivered' });
    autoAcceptAt = (await getDelivery(request, c.contractId, customer)).delivery.auto_accept_at;
  });

  test('customer, ready: commit, auto-accept date, download, push form, QA report, history and versions', async ({
    page,
    context,
  }) => {
    await signIn(context, customer);
    await openDelivery(page, c.contractId);
    await expect(chip(page, 'Ready for review')).toBeVisible();
    await expect(main(page).getByText('New on Tulzo')).toBeVisible();

    const commit = page.getByRole('heading', { level: 2, name: 'Delivered commit' });
    await expect(commit).toBeVisible();
    await expect(main(page).locator('code', { hasText: FAKE_SHA_HEAD.slice(0, 12) }).first()).toHaveText(
      new RegExp(`^\\s*${FAKE_SHA_HEAD.slice(0, 12)}\\s*$`),
    );
    await expect(main(page)).toContainText('Attempt 1');
    await expect(main(page)).toContainText(new RegExp(`Auto-accepts on ${dateRe(autoAcceptAt)}`));

    await expect(page.getByRole('link', { name: 'Download .tar.gz' })).toHaveAttribute(
      'href',
      `/api/contracts/${c.contractId}/delivery/download`,
    );

    await expect(page.getByRole('heading', { level: 2, name: 'Push to your repository' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Repository' })).toBeVisible();
    await expect(page.getByLabel('Fine-grained token')).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Push to my repo' })).toBeVisible();

    await expect(page.getByRole('heading', { level: 2, name: 'QA report' })).toBeVisible();
    await expect(main(page).getByText('All acceptance criteria pass.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Warnings' })).toBeVisible();
    await expect(main(page).getByRole('listitem').filter({ hasText: QA_FINDING_TITLE })).toHaveCount(1);

    await expect(page.getByRole('heading', { level: 2, name: 'History' })).toBeVisible();
    const history = page.getByRole('table', { name: 'Submission attempts' });
    for (const h of ['Attempt', 'Commit', 'Verdict']) await expect(history.getByRole('columnheader', { name: h })).toBeVisible();
    await expect(history).toContainText('Validated');

    await expect(page.getByRole('heading', { level: 2, name: 'Contract versions' })).toBeVisible();
    const versions = page.getByRole('table', { name: 'Contract versions' });
    for (const h of ['Version', 'Price', 'Deadline']) await expect(versions.getByRole('columnheader', { name: h })).toBeVisible();
    await expect(versions).toContainText('€300.00');

    await expect(page.getByRole('button', { name: 'Accept delivery' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open a dispute' })).toBeVisible();
  });

  test('provider, delivered: "Ready for review", waiting note, no customer controls', async ({ page, context }) => {
    await signIn(context, provider);
    await openDelivery(page, c.contractId);
    await expect(chip(page, 'Ready for review')).toBeVisible();
    await expect(main(page).getByText('Waiting for the customer to accept.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download .tar.gz' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Push to my repo' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Accept delivery' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open a dispute' })).toHaveCount(0);
  });

  test('push: an error shows the API message as an alert; success shows the file count', async ({ page, context, request }) => {
    const pub = `cust/public-${rand()}`;
    const pubToken = await registerPushTarget(request, { full_name: pub, private: false, empty: true });
    const apiErr = await postJson(request, `${deliveryPath(c.contractId)}/push`, customer, { repo: pub, token: pubToken });
    expect(apiErr.status, apiErr.text).toBe(422);

    await signIn(context, customer);
    await openDelivery(page, c.contractId);
    await page.getByRole('textbox', { name: 'Repository' }).fill(pub);
    await page.getByLabel('Fine-grained token').fill(pubToken);
    await page.getByRole('button', { name: 'Push to my repo' }).click();
    await expect(page.getByRole('alert').filter({ hasText: apiErr.body.message })).toBeVisible();

    const target = await emptyTarget(request);
    await page.getByRole('textbox', { name: 'Repository' }).fill(target.repo);
    await page.getByLabel('Fine-grained token').fill(target.token);
    await page.getByRole('button', { name: 'Push to my repo' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: new RegExp(`^\\s*Pushed \\d+ files to ${escapeRe(target.repo)}\\.\\s*$`) }),
    ).toBeVisible();
    expect(await fakeGithubHead(request, target.repo, target.token)).toMatch(/^[0-9a-f]{40}$/);
  });

  test('accept: confirmation with Cancel, then confirm → accepted, download kept, review form and claim window', async ({
    page,
    context,
    request,
  }) => {
    await signIn(context, customer);
    await openDelivery(page, c.contractId);
    await page.getByRole('button', { name: 'Accept delivery' }).click();
    await expect(main(page).getByText(ACCEPT_CONFIRM)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept and release payment' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(main(page).getByText(ACCEPT_CONFIRM)).toHaveCount(0);
    expect((await getDelivery(request, c.contractId, customer)).contract.status).toBe('delivered');

    await page.getByRole('button', { name: 'Accept delivery' }).click();
    await page.getByRole('button', { name: 'Accept and release payment' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Accepted. The provider has been paid.' })).toBeVisible();
    await expect(chip(page, 'Accepted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept delivery' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Download .tar.gz' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Leave a review' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'File a claim' })).toBeVisible();

    const d = await getDelivery(request, c.contractId, customer);
    expect(d.contract.status).toBe('completed');
    await expect(main(page)).toContainText(new RegExp(`You can file a claim until ${dateRe(d.actions.claim_window_ends_at)}\\.`));
    near(d.actions.claim_window_ends_at, Date.parse(d.contract.accepted_at) + 14 * DAY, 60_000);

    // The same state after a reload.
    await openDelivery(page, c.contractId);
    await expect(chip(page, 'Accepted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept delivery' })).toHaveCount(0);
  });

  test('review form: four star groups; incomplete → "Rate all four."; complete → posted and shown', async ({ page, context }) => {
    await signIn(context, customer);
    await openDelivery(page, c.contractId);
    await expect(page.getByRole('heading', { name: 'Leave a review' })).toBeVisible();
    const groups = ['Overall', 'Quality', 'Communication', 'Timeliness'];
    for (const g of groups) {
      const group = page.getByRole('group', { name: g });
      for (const r of ['1 star', '2 stars', '3 stars', '4 stars', '5 stars']) {
        await expect(group.getByRole('radio', { name: r, exact: true })).toBeVisible();
      }
    }
    await page.getByRole('group', { name: 'Overall' }).getByRole('radio', { name: '5 stars', exact: true }).check();
    await page.getByRole('button', { name: 'Submit review' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Rate all four.' })).toBeVisible();

    for (const g of groups.slice(1)) {
      await page.getByRole('group', { name: g }).getByRole('radio', { name: '4 stars', exact: true }).check();
    }
    await page.getByRole('textbox', { name: 'Your review (optional)' }).fill('Clean importer and a clear README.');
    await page.getByRole('button', { name: 'Submit review' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Thanks! Your review is posted.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Your review' })).toBeVisible();
    await expect(main(page)).toContainText('5/5 overall');
    await expect(page.getByRole('button', { name: 'Submit review' })).toHaveCount(0);
  });

  test('provider after acceptance: "Payout" paid out €300.00 and a review form', async ({ page, context }) => {
    await signIn(context, provider);
    await openDelivery(page, c.contractId);
    await expect(chip(page, 'Accepted')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Payout' })).toBeVisible();
    await expect(main(page)).toContainText('Paid out €300.00');
    await expect(page.getByRole('heading', { name: 'Leave a review' })).toBeVisible();
  });

  test('a reviewed provider shows a trust badge "Trust N" named "Trust score N out of 100"', async ({ page, context, request }) => {
    const rep = await getJson(request, '/api/profile/reputation', provider);
    expect(rep.status, rep.text).toBe(200);
    const score = rep.body.trust?.provider?.score;
    expect(Number.isInteger(score), rep.text).toBe(true);
    const next = await contractAt(request, { customer, provider, title: title('ui trust'), stage: 'delivered' });
    await signIn(context, customer);
    await openDelivery(page, next.contractId);
    await expect(main(page).getByText(`Trust ${score}`, { exact: true })).toBeVisible();
    await expect(main(page).getByLabel(`Trust score ${score} out of 100`, { exact: true })).toBeVisible();
    await expect(main(page).getByText('New on Tulzo')).toHaveCount(0);
  });
});

test.describe('delivery page: disputes', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  const customer = uid('uidcust');
  const provider = uid('uidprov');
  const CATEGORIES = ['Not as described', 'Incomplete', 'Quality problems', 'Late delivery', 'Not delivered', 'Something else'];

  test('open a dispute: options, short description blocked, then submitted → Disputed, no accept', async ({
    page,
    context,
    request,
  }, testInfo) => {
    const c = await contractAt(request, { customer, provider, title: title('ui dispute'), stage: 'delivered' });
    await signIn(context, customer);
    await openDelivery(page, c.contractId);
    await page.getByRole('button', { name: 'Open a dispute' }).click();
    await expect(page.getByRole('heading', { name: 'Open a dispute' })).toBeVisible();
    const select = page.getByRole('combobox', { name: 'What went wrong' });
    const labels = (await select.locator('option').allTextContents()).map((t) => t.trim()).filter(Boolean);
    for (const l of CATEGORIES) expect(labels).toContain(l);
    await expect(page.getByRole('textbox', { name: 'Evidence (optional)' })).toBeVisible();

    const posts = trackAppPosts(page, testInfo.project.use.baseURL);
    await select.selectOption({ label: 'Incomplete' });
    await page.getByRole('textbox', { name: 'Describe the problem' }).fill('Too short');
    await page.getByRole('button', { name: 'Submit dispute' }).click();
    await expect(main(page).getByText('Tell us what went wrong in at least 10 characters.')).toBeVisible();
    await page.waitForTimeout(300);
    expect(posts()).toBe(0);

    const reason = 'The export command is missing from the delivery.';
    await page.getByRole('textbox', { name: 'Describe the problem' }).fill(reason);
    await page.getByRole('textbox', { name: 'Evidence (optional)' }).fill('README has no export section.');
    await page.getByRole('button', { name: 'Submit dispute' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Dispute opened. Payment and auto-accept are paused while Tulzo reviews it.' }),
    ).toBeVisible();
    await expect(chip(page, 'Disputed')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept delivery' })).toHaveCount(0);
    await expect(main(page)).toContainText('A dispute is open');
    await expect(main(page)).toContainText(reason);

    const d = await getDelivery(request, c.contractId, customer);
    expect(d.contract.status).toBe('disputed');
    expect(d.dispute).toMatchObject({ category: 'incomplete', reason, phase: 'pre_accept' });
  });

  test('after acceptance: "File a claim" → claim filed', async ({ page, context, request }) => {
    const c = await contractAt(request, { customer, provider, title: title('ui claim'), stage: 'delivered' });
    await acceptDelivery(request, c.contractId, customer);
    await signIn(context, customer);
    await openDelivery(page, c.contractId);
    await page.getByRole('button', { name: 'File a claim' }).click();
    await expect(page.getByRole('heading', { name: 'File a claim' })).toBeVisible();
    await page.getByRole('combobox', { name: 'What went wrong' }).selectOption({ label: 'Quality problems' });
    await page.getByRole('textbox', { name: 'Describe the problem' }).fill('The importer crashes on files over 5 MB.');
    await page.getByRole('button', { name: 'Submit dispute' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Claim filed. Tulzo will review it.' })).toBeVisible();
    await expect(main(page)).toContainText('A dispute is open');
    const d = await getDelivery(request, c.contractId, customer);
    expect(d.dispute).toMatchObject({ phase: 'post_accept', category: 'quality', status: 'open' });
  });
});

