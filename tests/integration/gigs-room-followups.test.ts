/**
 * Job room follow-ups (feat/job-room), against the throwaway DB:
 *   (a) a price decrease on a scope change refunds the difference on approval
 *   (b) an expired top-up Checkout can be regenerated (work stays paused until paid)
 *   (c) spec changes from a scope change create a new job_spec_versions row
 *   (d) the steering classifier is billed to the requester; no balance → rules, never blocked
 *   (e) progress_update (≤ 1 per contract per hour) and milestone_completed emails
 *   (f) concurrent revisions can't both take the last steering credit
 *   (g) listJobs price filters treat open-ended budgets as unbounded
 * plus the web routes the provider uses (progress, milestones, respond, accept version) and QA.
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installMocks, resetDb, sql, seedBalance, useFakeStripe, stopFakeStripe, aiState, notifyState, signedWebhook, stripeEvent, call, VALID_SPEC } from './helpers';
import { formToObject, type FakeStripe } from '../support/fake-stripe';

installMocks();

import { http, paidContract, payTopup, type PaidContract } from './room-helpers';
import { calculateCost } from '../../src/lib/ai-gateway';

let stripe: FakeStripe;
let n = 0;

function parties() {
  n += 1;
  return { customer: `user_fu_c${n}`, provider: `user_fu_p${n}`, stranger: `user_fu_s${n}` };
}

before(async () => {
  await resetDb();
  stripe = await useFakeStripe();
});

beforeEach(() => {
  aiState.calls = [];
  aiState.generateObject = async () => ({
    object: { kind: 'clarification', confidence: 0.9, rationale: 'a question' },
    usage: { inputTokens: 1000, outputTokens: 100 },
    response: { headers: {} },
  });
  notifyState.sent = [];
});

after(async () => {
  await stopFakeStripe();
  await resetDb();
});

type Method = 'GET' | 'POST';
function room(name: string, method: Method, pc: PaidContract, rest: string, user: string, body?: unknown, extra: Record<string, string> = {}) {
  return http(name, method, `/api/contracts/${pc.contractId}${rest}`, { user, params: { id: pc.contractId, ...extra }, body });
}
const ask = (pc: PaidContract, user: string, body: Record<string, unknown>) => room('steering', 'POST', pc, '/steering', user, body);
const respond = (pc: PaidContract, user: string, sid: string, body: Record<string, unknown>) =>
  room('steeringRespond', 'POST', pc, `/steering/${sid}/respond`, user, body, { sid });
const approve = (pc: PaidContract, user: string, sid: string) => room('steeringApprove', 'POST', pc, `/steering/${sid}/approve`, user, undefined, { sid });
const topup = (pc: PaidContract, user: string, sid: string) => room('steeringTopup', 'POST', pc, `/steering/${sid}/topup`, user, undefined, { sid });
const detail = async (pc: PaidContract, user: string) => (await room('contract', 'GET', pc, '', user)).body;

async function scopeChange(pc: PaidContract, p: { customer: string; provider: string }, deltaCents: number, extra: Record<string, unknown> = {}) {
  const asked = await ask(pc, p.customer, { message: 'Add an Excel export', requested_kind: 'scope_change', ...extra });
  assert.equal(asked.status, 201, JSON.stringify(asked.body));
  const sid = asked.body.steering.id as string;
  const est = await respond(pc, p.provider, sid, { response: 'Doable', estimate_delta_cents: deltaCents, eta_days: 5 });
  assert.equal(est.status, 200, JSON.stringify(est.body));
  return { sid, estimate: est.body };
}

// ---------- (a) refunds ----------

test('(a) approving a lower price refunds the drop in the total through Stripe', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider, { priceCents: 30000 });
  const { sid } = await scopeChange(pc, p, -5000);
  stripe.requests.length = 0;
  const ok = await approve(pc, p.customer, sid);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.checkout_url, undefined);
  assert.deepEqual(ok.body.refund, { amount_cents: 5750, status: 'refunded' });
  assert.equal(ok.body.steering.refund_status, 'refunded');
  assert.equal(ok.body.steering.refund_amount_cents, 5750);

  const refunds = stripe.requests.filter((r) => r.method === 'POST' && r.path === '/v1/refunds');
  assert.equal(refunds.length, 1);
  const form = formToObject(refunds[0].form) as { payment_intent: string; amount: string; metadata: Record<string, string> };
  assert.equal(form.payment_intent, `pi_${pc.contractId.slice(0, 8)}`);
  assert.equal(form.amount, '5750');
  assert.equal(form.metadata.steering_request_id, sid);

  const [payment] = await sql<{ amount_refunded_cents: number; status: string }>('SELECT amount_refunded_cents, status FROM payments WHERE contract_id = $1', [pc.contractId]);
  assert.deepEqual(payment, { amount_refunded_cents: 5750, status: 'partially_refunded' });
  const rows = await sql<{ amount_cents: number; reason: string }>('SELECT amount_cents, reason FROM refunds WHERE contract_id = $1', [pc.contractId]);
  assert.deepEqual(rows, [{ amount_cents: 5750, reason: 'scope_change_price_decrease' }]);
  const [contract] = await sql<{ status: string }>('SELECT status FROM contracts WHERE id = $1', [pc.contractId]);
  assert.equal(contract.status, 'active');
  const d = await detail(pc, p.customer);
  assert.equal(d.current_version.customer_total_cents, 28750);
  assert.equal(d.work_paused, false);
});

test('(a) when Stripe refuses the refund it is recorded as a credit to apply at payout', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider, { priceCents: 30000 });
  const { sid } = await scopeChange(pc, p, -10000);
  stripe.failNext('/v1/refunds');
  const ok = await approve(pc, p.customer, sid);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.refund, { amount_cents: 11500, status: 'credit_pending' });
  const [s] = await sql<{ refund_status: string; refund_amount_cents: number }>('SELECT refund_status, refund_amount_cents FROM steering_requests WHERE id = $1', [sid]);
  assert.deepEqual(s, { refund_status: 'credit_pending', refund_amount_cents: 11500 });
  const [payment] = await sql<{ amount_refunded_cents: number }>('SELECT amount_refunded_cents FROM payments WHERE contract_id = $1', [pc.contractId]);
  assert.equal(payment.amount_refunded_cents, 0);
});

test('(a) a price increase still opens a top-up and refunds nothing', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider, { priceCents: 30000 });
  const { sid } = await scopeChange(pc, p, 5000);
  stripe.requests.length = 0;
  const ok = await approve(pc, p.customer, sid);
  assert.equal(ok.status, 200);
  assert.match(ok.body.checkout_url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(ok.body.refund, undefined);
  assert.equal(stripe.requests.filter((r) => r.path === '/v1/refunds').length, 0);
});

// ---------- (b) expired top-up ----------

test('(b) an expired top-up keeps the work paused until the customer pays a regenerated Checkout', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider, { priceCents: 30000 });
  const { sid } = await scopeChange(pc, p, 5000);
  const ok = await approve(pc, p.customer, sid);
  const first = (await sql<{ topup_checkout_session_id: string }>('SELECT topup_checkout_session_id FROM steering_requests WHERE id = $1', [sid]))[0].topup_checkout_session_id;

  // still open: the same link comes back
  const same = await topup(pc, p.customer, sid);
  assert.equal(same.status, 200, JSON.stringify(same.body));
  assert.equal(same.body.checkout_url, ok.body.checkout_url);

  // Stripe reports the expiry
  const expired = stripeEvent('checkout.session.expired', {
    id: first,
    object: 'checkout.session',
    status: 'expired',
    metadata: { kind: 'contract_topup', contract_id: pc.contractId, steering_request_id: sid },
  });
  const { body, headers } = signedWebhook(expired);
  const hook = await call((await import('../../app/api/billing/webhook/route')).POST as never, { method: 'POST', url: '/api/billing/webhook', body, headers });
  assert.equal(hook.status, 200, JSON.stringify(hook.body));
  let d = await detail(pc, p.customer);
  assert.equal(d.work_paused, true);
  const s1 = (await room('steering', 'GET', pc, '/steering', p.customer)).body.steering.find((s: { id: string }) => s.id === sid);
  assert.equal(s1.topup_status, 'expired');

  // the provider can't, the customer gets a new link
  assert.equal((await topup(pc, p.provider, sid)).status, 403);
  const fresh = await topup(pc, p.customer, sid);
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
  assert.match(fresh.body.checkout_url, /^https:\/\/checkout\.stripe\.com\//);
  assert.notEqual(fresh.body.checkout_url, ok.body.checkout_url);
  assert.equal(fresh.body.steering.topup_status, 'pending');
  assert.notEqual(fresh.body.steering.topup_checkout_session_id, first);
  d = await detail(pc, p.customer);
  assert.equal(d.work_paused, true);

  // paying the new session resumes the work
  const paid = await payTopup({ id: fresh.body.steering.topup_checkout_session_id, amount: 5750 }, { kind: 'contract_topup', contract_id: pc.contractId, steering_request_id: sid });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  d = await detail(pc, p.customer);
  assert.equal(d.work_paused, false);
  assert.equal((await topup(pc, p.customer, sid)).status, 409);
});

test('(b) nothing to pay → 409; unknown request → 404', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider);
  const asked = await ask(pc, p.customer, { message: 'Which DB?', requested_kind: 'clarification' });
  assert.equal((await topup(pc, p.customer, asked.body.steering.id)).status, 409);
  assert.equal((await topup(pc, p.customer, '00000000-0000-4000-8000-000000000001')).status, 404);
});

// ---------- (c) spec versions ----------

test('(c) spec and deliverable changes create a new spec version, linked from the new contract version', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider);
  const before = await detail(pc, p.customer);
  const baseSpecId = before.current_version.spec_version_id as string;
  const asked = await ask(pc, p.customer, { message: 'Add an Excel export', spec_changes: ['Export to Excel'] });
  assert.equal(asked.body.decision.kind, 'scope_change');
  const sid = asked.body.steering.id;
  const est = await respond(pc, p.provider, sid, { response: 'OK', estimate_delta_cents: 2000, deliverable_changes: ['Excel exporter'] });
  assert.equal(est.status, 200, JSON.stringify(est.body));
  const newSpecId = est.body.new_contract_version.spec_version_id as string;
  assert.notEqual(newSpecId, baseSpecId);
  assert.equal(est.body.steering.new_spec_version_id, newSpecId);
  const [spec] = await sql<{ status: string; requirements: string[]; deliverables: string[]; version: number }>(
    'SELECT status, requirements, deliverables, version FROM job_spec_versions WHERE id = $1',
    [newSpecId],
  );
  assert.equal(spec.status, 'draft');
  assert.deepEqual(spec.requirements, [...VALID_SPEC.requirements, 'Export to Excel']);
  assert.deepEqual(spec.deliverables, [...VALID_SPEC.deliverables, 'Excel exporter']);

  const ok = await approve(pc, p.customer, sid);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const specs = await sql<{ id: string; status: string }>('SELECT id, status FROM job_spec_versions WHERE job_id = $1 ORDER BY version', [pc.jobId]);
  assert.deepEqual(specs.map((s) => s.status), ['superseded', 'approved']);
  const [job] = await sql<{ current_spec_version_id: string }>('SELECT current_spec_version_id FROM jobs WHERE id = $1', [pc.jobId]);
  assert.equal(job.current_spec_version_id, newSpecId);
  const after = await detail(pc, p.customer);
  assert.equal(after.spec.id, newSpecId);
  assert.deepEqual(after.specs.map((s: { id: string }) => s.id).sort(), [baseSpecId, newSpecId].sort());
});

test('(c) a price-only scope change keeps the spec version', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider);
  const base = (await detail(pc, p.customer)).current_version.spec_version_id;
  const { estimate } = await scopeChange(pc, p, 1000);
  assert.equal(estimate.new_contract_version.spec_version_id, base);
  assert.equal(estimate.steering.new_spec_version_id, null);
});

test('(c) customer-proposed terms with spec changes link the new spec version right away', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider);
  const asked = await ask(pc, p.customer, { message: 'More scope', spec_changes: ['Support XML'], price_cents: 32000 });
  assert.equal(asked.body.steering.status, 'awaiting_provider');
  const [v] = await sql<{ spec_version_id: string }>('SELECT spec_version_id FROM contract_versions WHERE id = $1', [asked.body.steering.new_contract_version_id]);
  assert.equal(v.spec_version_id, asked.body.steering.new_spec_version_id);
  const accepted = await http('versionAccept', 'POST', `/api/contracts/${pc.contractId}/versions/${asked.body.steering.new_contract_version_id}/accept`, {
    user: p.provider,
    params: { id: pc.contractId, vid: asked.body.steering.new_contract_version_id },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const [job] = await sql<{ current_spec_version_id: string }>('SELECT current_spec_version_id FROM jobs WHERE id = $1', [pc.jobId]);
  assert.equal(job.current_spec_version_id, asked.body.steering.new_spec_version_id);
});

// ---------- (d) classifier billing ----------

test('(d) the classifier call is billed to the requester at metered cost × CREDIT_MARKUP', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider);
  await seedBalance(p.customer, 5);
  // big enough that the markup shows at the balance's 4-decimal precision
  aiState.generateObject = async () => ({
    object: { kind: 'clarification', confidence: 0.9, rationale: 'a question' },
    usage: { inputTokens: 1_000_000, outputTokens: 100_000 },
    response: { headers: {} },
  });
  const res = await ask(pc, p.customer, { message: 'Which CSV delimiter should I expect?' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(aiState.calls.length, 1);
  assert.equal(res.body.steering.classifier_output.source, 'ai');
  const metered = calculateCost('openai/gpt-4o-mini', 1_000_000, 100_000);
  assert.ok(metered > 0.01, `metered ${metered}`);
  const expected = Math.round(metered * 1.3 * 1e4) / 1e4;
  const [budget] = await sql<{ remaining_balance: string }>('SELECT remaining_balance FROM user_budgets WHERE user_id = $1', [p.customer]);
  assert.ok(Math.abs(5 - Number(budget.remaining_balance) - expected) < 1e-9, `charged ${5 - Number(budget.remaining_balance)}, expected ${expected} (metered ${metered})`);
  const usage = await sql<{ device_session_id: string; cost_deducted: string; tokens_used: number }>(
    'SELECT device_session_id, cost_deducted, tokens_used FROM paid_usage_analytics WHERE user_id = $1',
    [p.customer],
  );
  assert.equal(usage.length, 1);
  assert.equal(usage[0].device_session_id, 'gigs-steering-classifier');
  assert.equal(Number(usage[0].tokens_used), 1_100_000);
  assert.ok(Math.abs(Number(usage[0].cost_deducted) - expected) < 1e-9, usage[0].cost_deducted);
});

test('(d) without balance the rules classify the request and nothing blocks', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider, { credits: 2 });
  const res = await ask(pc, p.customer, { message: 'Please fix the header alignment' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(aiState.calls.length, 0);
  assert.equal(res.body.steering.classifier_output.source, 'rules');
  assert.equal(res.body.steering.classifier_output.error, 'insufficient_balance');
  assert.equal(res.body.decision.kind, 'revision');
  await seedBalance(p.customer, 0);
  const q = await ask(pc, p.customer, { message: 'Which Postgres version do you target?' });
  assert.equal(q.body.decision.kind, 'clarification');
  assert.equal(aiState.calls.length, 0);
  assert.equal((await sql('SELECT 1 FROM paid_usage_analytics WHERE user_id = $1', [p.customer])).length, 0);
});

// ---------- (e) notifications ----------

test('(e) progress emails: at most one per contract per hour, also under concurrent posts', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider);
  notifyState.sent = [];
  const post = (summary: string) => room('progress', 'POST', pc, '/progress', p.provider, { summary, percent_complete: 40 });
  const results = await Promise.all([post('Parser done'), post('Validator done'), post('Tests green'), post('Docs drafted')]);
  for (const r of results) assert.equal(r.status, 201, JSON.stringify(r.body));
  let emails = notifyState.sent.filter((e) => e.type === 'progress_update');
  assert.equal(emails.length, 1);
  assert.equal(emails[0].userId, p.customer);
  assert.equal(emails[0].payload.contractId, pc.contractId);
  assert.equal(emails[0].payload.percentComplete, 40);

  await post('Another one');
  assert.equal(notifyState.sent.filter((e) => e.type === 'progress_update').length, 1);
  await sql(`UPDATE contracts SET progress_notified_at = NOW() - INTERVAL '61 minutes' WHERE id = $1`, [pc.contractId]);
  await post('An hour later');
  emails = notifyState.sent.filter((e) => e.type === 'progress_update');
  assert.equal(emails.length, 2);
  assert.equal(emails[1].payload.summary, 'An hour later');
});

test('(e) a milestone done emails the customer once', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider);
  const created = await room('milestones', 'POST', pc, '/milestones', p.provider, { title: 'Parser', status: 'in_progress' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.milestone.id;
  assert.equal(notifyState.sent.filter((e) => e.type === 'milestone_completed').length, 0);
  const done = await room('milestones', 'POST', pc, '/milestones', p.provider, { milestone_id: id, status: 'done' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  await room('milestones', 'POST', pc, '/milestones', p.provider, { milestone_id: id, status: 'done', title: 'Parser v2' });
  const emails = notifyState.sent.filter((e) => e.type === 'milestone_completed');
  assert.equal(emails.length, 1);
  assert.equal(emails[0].userId, p.customer);
  assert.equal(emails[0].payload.milestoneTitle, 'Parser');
});

// ---------- (f) credit race ----------

test('(f) parallel revisions never both take the last steering credit', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider, { credits: 1 });
  aiState.generateObject = async () => ({ object: { kind: 'revision', confidence: 0.9, rationale: 'rework' }, usage: { inputTokens: 10, outputTokens: 10 } });
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) => ask(pc, p.customer, { message: `Tweak number ${i}`, requested_kind: 'revision' })),
  );
  const created = results.filter((r) => r.status === 201);
  const revisions = created.filter((r) => r.body.decision.kind === 'revision');
  assert.equal(revisions.length, 1, results.map((r) => `${r.status}:${r.body.decision?.kind ?? r.body.error}`).join(' '));
  for (const r of results) assert.ok(r.status === 201 || (r.status === 409 && r.body.error === 'invalid_state'), JSON.stringify(r.body));
  const [row] = await sql<{ used: number; charged: number }>(
    `SELECT c.steering_credits_used AS used, (SELECT COALESCE(SUM(credit_cost), 0)::int FROM steering_requests s WHERE s.contract_id = c.id) AS charged
       FROM contracts c WHERE c.id = $1`,
    [pc.contractId],
  );
  assert.deepEqual(row, { used: 1, charged: 1 });
  const d = await detail(pc, p.customer);
  assert.deepEqual(d.steering_credits, { allowance: 1, used: 1, remaining: 0 });
});

test('(f) with 3 credits, 8 parallel revisions take exactly 3', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider, { credits: 3 });
  aiState.generateObject = async () => ({ object: { kind: 'revision', confidence: 0.9, rationale: 'rework' }, usage: { inputTokens: 10, outputTokens: 10 } });
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => ask(pc, p.customer, { message: `Adjust item ${i}`, requested_kind: 'revision' })),
  );
  const revisions = results.filter((r) => r.status === 201 && r.body.decision.kind === 'revision');
  assert.equal(revisions.length, 3, results.map((r) => `${r.status}:${r.body.decision?.kind ?? r.body.error}`).join(' '));
  const [row] = await sql<{ used: number }>('SELECT steering_credits_used AS used FROM contracts WHERE id = $1', [pc.contractId]);
  assert.equal(row.used, 3);
});

// ---------- web routes for the provider, and QA ----------

test('provider web routes: progress, milestones and answers are provider-only; QA is party-only', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider);
  assert.equal((await room('progress', 'POST', pc, '/progress', p.customer, { summary: 'x' })).status, 403);
  assert.equal((await room('progress', 'POST', pc, '/progress', p.stranger, { summary: 'x' })).status, 403);
  assert.equal((await room('progress', 'POST', pc, '/progress', p.provider, {})).status, 400);
  assert.equal((await room('milestones', 'POST', pc, '/milestones', p.customer, { title: 'x', status: 'pending' })).status, 403);
  const asked = await ask(pc, p.customer, { message: 'Which DB?', requested_kind: 'clarification' });
  const sid = asked.body.steering.id;
  assert.equal((await respond(pc, p.customer, sid, { response: 'me' })).status, 403);
  const answered = await respond(pc, p.provider, sid, { response: 'Postgres 16' });
  assert.equal(answered.status, 200, JSON.stringify(answered.body));
  assert.equal(answered.body.steering.status, 'answered');
  // a steering id from another contract is not found on this one
  const other = await paidContract(`${p.customer}_o`, `${p.provider}_o`);
  const elsewhere = await ask(other, `${p.customer}_o`, { message: 'Which DB?', requested_kind: 'clarification' });
  assert.equal((await respond(pc, p.provider, elsewhere.body.steering.id, { response: 'x' })).status, 404);

  const qa = await room('qa', 'GET', pc, '/qa', p.customer);
  assert.equal(qa.status, 200, JSON.stringify(qa.body));
  assert.deepEqual(qa.body.submissions, []);
  assert.deepEqual(qa.body.reviews, []);
  assert.equal((await room('qa', 'GET', pc, '/qa', p.stranger)).status, 403);
  const unknown = await http('qa', 'GET', '/api/contracts/00000000-0000-4000-8000-000000000002/qa', {
    user: p.customer,
    params: { id: '00000000-0000-4000-8000-000000000002' },
  });
  assert.equal(unknown.status, 404);
});

test('activity records the payment, progress summaries and milestone changes in plain words', async () => {
  const p = parties();
  const pc = await paidContract(p.customer, p.provider);
  await room('progress', 'POST', pc, '/progress', p.provider, { summary: 'Parser done', details: 'stack: 120 lines of raw tool output' });
  const m = await room('milestones', 'POST', pc, '/milestones', p.provider, { title: 'Parser', status: 'pending' });
  await room('milestones', 'POST', pc, '/milestones', p.provider, { milestone_id: m.body.milestone.id, status: 'done' });
  const events = (await room('activity', 'GET', pc, '/activity', p.customer)).body.events as Array<{ type: string; summary: string }>;
  assert.deepEqual(
    events.map((e) => [e.type, e.summary]),
    [
      ['payment_received', 'Payment of €345 received; work can start'],
      ['progress_posted', 'Parser done'],
      ['milestone_created', 'Milestone "Parser" added (not started)'],
      ['milestone_updated', 'Milestone "Parser": not started → done'],
    ],
  );
});

// ---------- (g) price filter ----------

async function publish(customer: string, title: string, min: number | null, max: number | null): Promise<void> {
  const body: Record<string, unknown> = { title, description: 'A job for the price filter test.' };
  if (min != null) body.budget_min_cents = min;
  if (max != null) body.budget_max_cents = max;
  const created = await http('jobs', 'POST', '/api/jobs', { user: customer, body });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.job.id;
  const spec = { ...VALID_SPEC, budget_min_cents: min, budget_max_cents: max };
  const drafted = await http('draft', 'POST', `/api/jobs/${id}/spec/draft`, { user: customer, params: { id }, body: { spec } });
  assert.ok(drafted.status < 300, JSON.stringify(drafted.body));
  const ok = await http('approve', 'POST', `/api/jobs/${id}/spec/approve`, { user: customer, params: { id }, body: {} });
  assert.ok(ok.status < 300, JSON.stringify(ok.body));
}

test('(g) price filters overlap open-ended budgets ("From €500" matches min 450)', async () => {
  await resetDb();
  const customer = 'user_fu_prices';
  await publish(customer, 'zqprice From 500', 50000, null);
  await publish(customer, 'zqprice Range 200-400', 20000, 40000);
  await publish(customer, 'zqprice Up to 400', null, 40000);
  await publish(customer, 'zqprice Exactly 300', 30000, 30000);
  await publish(customer, 'zqprice No budget', null, null);
  const titles = async (qs: string) =>
    ((await http('jobs', 'GET', `/api/jobs?q=zqprice&${qs}`, { user: 'user_fu_viewer' })).body.jobs as Array<{ title: string }>).map((j) => j.title.replace('zqprice ', '')).sort();
  assert.deepEqual(await titles('min_price_cents=45000'), ['From 500']);
  assert.deepEqual(await titles('min_price_cents=60000'), ['From 500']);
  assert.deepEqual(await titles('max_price_cents=25000'), ['Range 200-400', 'Up to 400']);
  assert.deepEqual(await titles('min_price_cents=25000&max_price_cents=35000'), ['Exactly 300', 'Range 200-400', 'Up to 400']);
  assert.deepEqual(await titles('min_price_cents=40000&max_price_cents=50000'), ['From 500', 'Range 200-400', 'Up to 400']);
  assert.equal((await titles('')).length, 5);
});
