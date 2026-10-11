import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installMocks, resetDb, sql, useFakeStripe, stopFakeStripe, aiState, notifyState } from './helpers';
import { formToObject, type FakeStripe } from '../support/fake-stripe';

installMocks();

import { http, tool, paidContract, payTopup, type PaidContract } from './room-helpers';

let stripe: FakeStripe;
let n = 0;

function parties() {
  n += 1;
  return { customer: `user_steer_c${n}`, provider: `user_steer_p${n}` };
}

/** Make the (mocked) classifier answer `kind`. */
function classifierSays(kind: string) {
  aiState.generateObject = async () => ({ object: { kind, confidence: 0.9, rationale: `looks like ${kind}` } });
}

before(async () => {
  await resetDb();
  stripe = await useFakeStripe();
});

beforeEach(() => {
  aiState.calls = [];
  classifierSays('clarification');
});

after(async () => {
  await stopFakeStripe();
  await resetDb();
});

function ask(pc: PaidContract, user: string, body: Record<string, unknown>) {
  return http('steering', 'POST', `/api/contracts/${pc.contractId}/steering`, { user, params: { id: pc.contractId }, body });
}
function approve(pc: PaidContract, user: string, sid: string) {
  return http('steeringApprove', 'POST', `/api/contracts/${pc.contractId}/steering/${sid}/approve`, { user, params: { id: pc.contractId, sid } });
}
function reject(pc: PaidContract, user: string, sid: string) {
  return http('steeringReject', 'POST', `/api/contracts/${pc.contractId}/steering/${sid}/reject`, { user, params: { id: pc.contractId, sid } });
}
async function detail(pc: PaidContract, user: string) {
  return (await http('contract', 'GET', `/api/contracts/${pc.contractId}`, { user, params: { id: pc.contractId } })).body;
}

test('a clarification is classified by the LLM, is free, and is answered by the provider', async () => {
  const { customer, provider } = parties();
  const pc = await paidContract(customer, provider, { credits: 1 });
  const res = await ask(pc, customer, { message: 'Which CSV delimiter should I expect?' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(res.body.decision, { kind: 'clarification', consumesCredit: false, requiresApproval: false });
  assert.equal(res.body.steering.status, 'open');
  assert.equal(res.body.steering.credit_cost, 0);
  assert.equal(res.body.steering.classifier_output.source, 'ai');
  assert.equal(aiState.calls.length, 1);
  assert.match(String(aiState.calls[0].prompt), /Which CSV delimiter/);
  assert.match(String(aiState.calls[0].prompt), /Import CSV files into Postgres/);

  const note = notifyState.sent.find((c) => c.type === 'steering_awaiting_approval' && c.userId === provider);
  assert.ok(note, 'the provider is told a request is waiting');
  assert.equal(note!.payload.contractId, pc.contractId);

  const estimate = await tool(provider, 'steering_respond', { steering_id: res.body.steering.id, response: 'x', estimate_delta_cents: 100 });
  assert.equal(estimate.data.error, 'invalid_state');
  const byCustomer = await tool(customer, 'steering_respond', { steering_id: res.body.steering.id, response: 'x' });
  assert.equal(byCustomer.data.error, 'forbidden');
  const answered = await tool(provider, 'steering_respond', { steering_id: res.body.steering.id, response: 'Comma, UTF-8.' });
  assert.equal(answered.isError, false, JSON.stringify(answered.data));
  assert.equal(answered.data.steering.status, 'answered');
  assert.equal(answered.data.steering.response, 'Comma, UTF-8.');
  assert.equal((await tool(provider, 'steering_respond', { steering_id: res.body.steering.id, response: 'again' })).data.error, 'invalid_state');
  assert.deepEqual((await detail(pc, customer)).steering_credits, { allowance: 1, used: 0, remaining: 1 });
});

test('a revision uses one included credit; with none left it becomes a scope change', async () => {
  const { customer, provider } = parties();
  const pc = await paidContract(customer, provider, { credits: 1 });
  classifierSays('revision');
  const first = await ask(pc, customer, { message: 'Please rename the CLI flag to --input' });
  assert.deepEqual(first.body.decision, { kind: 'revision', consumesCredit: true, requiresApproval: false });
  assert.equal(first.body.steering.credit_cost, 1);
  assert.deepEqual((await detail(pc, customer)).steering_credits, { allowance: 1, used: 1, remaining: 0 });
  const done = await tool(provider, 'steering_respond', { steering_id: first.body.steering.id, response: 'Renamed.' });
  assert.equal(done.data.steering.status, 'resolved');

  const second = await ask(pc, customer, { message: 'And rename --out to --output' });
  assert.equal(second.body.decision.kind, 'scope_change');
  assert.equal(second.body.steering.credit_cost, 0);
  assert.equal(second.body.steering.status, 'awaiting_estimate');
});

test('without the AI the customer\'s requested kind is used, and spec/price/deadline changes still force scope_change', async () => {
  const { customer, provider } = parties();
  const pc = await paidContract(customer, provider, { credits: 3 });
  aiState.generateObject = async () => { throw new Error('gateway down'); };
  const rev = await ask(pc, customer, { message: 'Tweak the log format', requested_kind: 'revision' });
  assert.equal(rev.body.decision.kind, 'revision');
  assert.equal(rev.body.steering.classifier_output.source, 'fallback');
  const spec = await ask(pc, customer, { message: 'Small thing', requested_kind: 'clarification', spec_changes: ['Also export JSON'] });
  assert.equal(spec.body.decision.kind, 'scope_change');
  assert.deepEqual(spec.body.steering.spec_changes, ['Also export JSON']);
  // only one open scope change at a time
  const another = await ask(pc, customer, { message: 'Even more', requested_kind: 'scope_change' });
  assert.equal(another.status, 409);
  assert.equal(another.body.error, 'invalid_state');
});

test('steering requests: only the customer creates, only parties read', async () => {
  const { customer, provider } = parties();
  const pc = await paidContract(customer, provider);
  assert.equal((await ask(pc, provider, { message: 'Can I ask myself?' })).status, 403);
  assert.equal((await ask(pc, 'user_steer_stranger', { message: 'Hi' })).status, 403);
  assert.equal((await ask(pc, customer, { message: '' })).status, 400);
  assert.equal((await ask(pc, customer, { message: 'x', price_cents: 0 })).status, 400);
  await ask(pc, customer, { message: 'A question' });
  const list = await http('steering', 'GET', `/api/contracts/${pc.contractId}/steering`, { user: provider, params: { id: pc.contractId } });
  assert.equal(list.status, 200);
  assert.equal(list.body.steering.length, 1);
  assert.equal(typeof list.body.next_cursor, 'string');
  assert.equal((await http('steering', 'GET', `/api/contracts/${pc.contractId}/steering`, { user: 'user_steer_stranger', params: { id: pc.contractId } })).status, 403);
  const viaMcp = await tool(provider, 'steering_list', { contract_id: pc.contractId, status: 'open' });
  assert.equal(viaMcp.data.steering.length, 1);
  assert.equal((await tool('user_steer_stranger', 'steering_list', { contract_id: pc.contractId })).data.error, 'forbidden');
});

test('scope change: provider re-estimates, a new contract version awaits approval, work pauses, approval charges a top-up', async () => {
  const { customer, provider } = parties();
  const pc = await paidContract(customer, provider, { credits: 1 });
  classifierSays('scope_change');
  const req = await ask(pc, customer, { message: 'Add an XLSX importer too' });
  assert.equal(req.body.steering.status, 'awaiting_estimate');
  assert.equal((await detail(pc, provider)).work_paused, true);
  const paused = await tool(provider, 'milestone_update', { contract_id: pc.contractId, title: 'XLSX', status: 'in_progress' });
  assert.equal(paused.data.error, 'work_paused');
  const sid = req.body.steering.id as string;

  assert.equal((await approve(pc, customer, sid)).body.error, 'invalid_state'); // nothing to approve yet
  const est = await tool(provider, 'steering_respond', {
    steering_id: sid, response: 'XLSX adds two days.', estimate_delta_cents: 10000, eta_days: 9, deliverable_changes: ['XLSX importer'],
  });
  assert.equal(est.isError, false, JSON.stringify(est.data));
  assert.equal(est.data.steering.status, 'awaiting_approval');
  const v2 = est.data.new_contract_version;
  assert.equal(v2.version, 2);
  assert.equal(v2.price_cents, 40000);
  assert.equal(v2.customer_total_cents, v2.price_cents + v2.fee_cents);
  assert.equal(v2.steering_allowance, 1);
  assert.deepEqual(v2.qa_checks, ['basic'], 'the QA checks carry over to the new version');
  assert.ok(v2.signed_by_provider_at);
  assert.equal(v2.signed_by_customer_at, null);
  const note = notifyState.sent.find((c) => c.type === 'scope_change_awaiting_approval' && c.userId === customer);
  assert.ok(note);
  assert.equal(note!.payload.priceDeltaCents, 10000);

  const before = await detail(pc, customer);
  assert.deepEqual(before.versions.map((v: { version: number; state: string }) => [v.version, v.state]), [[1, 'current'], [2, 'proposed']]);
  assert.equal((await approve(pc, provider, sid)).status, 403);
  assert.equal((await approve(pc, 'user_steer_stranger', sid)).status, 403);

  const ok = await approve(pc, customer, sid);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.steering.status, 'approved');
  assert.equal(ok.body.contract.current_version_id, v2.id);
  const topup = v2.customer_total_cents - pc.customerTotalCents;
  assert.equal(ok.body.steering.topup_amount_cents, topup);
  assert.equal(ok.body.steering.topup_status, 'pending');
  assert.match(ok.body.checkout_url, /^https:\/\/checkout\.stripe\.com\//);

  const session = stripe.requests.filter((r) => r.path === '/v1/checkout/sessions').at(-1)!;
  const form = formToObject(session.form) as any;
  assert.equal(Number(form.line_items['0'].price_data.unit_amount), topup);
  assert.equal(form.payment_intent_data.transfer_group, `contract_${pc.contractId}`);
  assert.equal(form.metadata.kind, 'contract_topup');
  assert.equal(form.metadata.steering_request_id, sid);

  const after = await detail(pc, customer);
  assert.deepEqual(after.versions.map((v: { version: number; state: string }) => [v.version, v.state]), [[1, 'superseded'], [2, 'current']]);
  assert.equal(after.work_paused, true, 'work stays paused until the top-up is paid');
  assert.equal((await approve(pc, customer, sid)).body.error, 'invalid_state');

  const [row] = await sql<{ topup_checkout_session_id: string }>('SELECT topup_checkout_session_id FROM steering_requests WHERE id = $1', [sid]);
  const wrong = await payTopup({ id: row.topup_checkout_session_id, amount: topup - 1 }, {
    kind: 'contract_topup', contract_id: pc.contractId, steering_request_id: sid, contract_version_id: v2.id,
  });
  assert.equal(wrong.status, 200);
  assert.equal((await detail(pc, customer)).work_paused, true, 'a mismatched amount is not accepted');
  const paid = await payTopup({ id: row.topup_checkout_session_id, amount: topup }, {
    kind: 'contract_topup', contract_id: pc.contractId, steering_request_id: sid, contract_version_id: v2.id,
  });
  assert.equal(paid.status, 200);
  const payments = await sql<{ amount_cents: number; contract_version_id: string }>(
    'SELECT amount_cents, contract_version_id FROM payments WHERE contract_id = $1 ORDER BY created_at', [pc.contractId],
  );
  assert.deepEqual(payments.map((p) => p.amount_cents), [pc.customerTotalCents, topup]);
  assert.equal(payments[1].contract_version_id, v2.id);
  const final = await detail(pc, customer);
  assert.equal(final.work_paused, false);
  assert.equal(final.contract.status, 'active');
  const resumed = await tool(provider, 'milestone_update', { contract_id: pc.contractId, title: 'XLSX', status: 'in_progress' });
  assert.equal(resumed.isError, false);
});

test('scope change rejected by the customer: version not adopted, work resumes', async () => {
  const { customer, provider } = parties();
  const pc = await paidContract(customer, provider);
  classifierSays('scope_change');
  const req = await ask(pc, customer, { message: 'Add a web UI' });
  const sid = req.body.steering.id as string;
  await tool(provider, 'steering_respond', { steering_id: sid, response: 'Web UI is a lot.', estimate_delta_cents: 50000 });
  assert.equal((await reject(pc, provider, sid)).status, 403);
  const r = await reject(pc, customer, sid);
  assert.equal(r.status, 200);
  assert.equal(r.body.steering.status, 'rejected');
  const d = await detail(pc, customer);
  assert.equal(d.work_paused, false);
  assert.equal(d.current_version.id, pc.versionId);
  assert.deepEqual(d.versions.map((v: { version: number; state: string }) => [v.version, v.state]), [[1, 'current'], [2, 'rejected']]);
  assert.equal((await reject(pc, customer, sid)).body.error, 'invalid_state');
});

test('scope change declined by the provider resumes work', async () => {
  const { customer, provider } = parties();
  const pc = await paidContract(customer, provider);
  const req = await ask(pc, customer, { message: 'Different deadline please', deadline: '2027-01-15T00:00:00.000Z' });
  assert.equal(req.body.steering.kind, 'scope_change');
  assert.equal(req.body.steering.status, 'awaiting_provider');
  const declined = await tool(provider, 'steering_respond', { steering_id: req.body.steering.id, response: 'Cannot do that date.', decline: true });
  assert.equal(declined.data.steering.status, 'declined');
  assert.equal((await detail(pc, customer)).work_paused, false);
});

test('customer-proposed price: the provider accepts the proposed version with contract_accept_version', async () => {
  const { customer, provider } = parties();
  const pc = await paidContract(customer, provider);
  const req = await ask(pc, customer, { message: 'I can pay more for faster delivery', price_cents: 36000 });
  assert.equal(req.status, 201, JSON.stringify(req.body));
  assert.equal(req.body.steering.status, 'awaiting_provider');
  const versionId = req.body.steering.new_contract_version_id as string;
  assert.ok(versionId);
  assert.equal((await tool(provider, 'contract_accept_version', { contract_id: pc.contractId, version_id: pc.versionId })).data.error, 'invalid_state');
  assert.equal((await tool(customer, 'contract_accept_version', { contract_id: pc.contractId, version_id: versionId })).data.error, 'forbidden');
  const acc = await tool(provider, 'contract_accept_version', { contract_id: pc.contractId, version_id: versionId });
  assert.equal(acc.isError, false, JSON.stringify(acc.data));
  assert.equal(acc.data.contract.current_version_id, versionId);
  assert.equal(acc.data.version.price_cents, 36000);
  assert.ok(acc.data.version.signed_by_provider_at);
  assert.ok(acc.data.version.signed_by_customer_at);
  assert.equal(acc.data.steering.status, 'approved');
  assert.match(acc.data.checkout_url, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal((await tool(provider, 'contract_accept_version', { contract_id: pc.contractId, version_id: versionId })).data.error, 'invalid_state');
});
