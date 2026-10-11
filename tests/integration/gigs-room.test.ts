import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installMocks, resetDb, sql, useFakeStripe, stopFakeStripe, notifyState } from './helpers';

installMocks();

import { http, tool, paidContract, type PaidContract } from './room-helpers';

const CUSTOMER = 'user_room_customer';
const PROVIDER = 'user_room_provider';
const STRANGER = 'user_room_stranger';
let pc: PaidContract;

before(async () => {
  await resetDb();
  await useFakeStripe();
  pc = await paidContract(CUSTOMER, PROVIDER, { credits: 2 });
});

after(async () => {
  await stopFakeStripe();
  await resetDb();
});

const p = () => ({ id: pc.contractId });

test('contract detail: both parties see it with their role; others get 403, unknown 404, signed-out 401', async () => {
  const c = await http('contract', 'GET', `/api/contracts/${pc.contractId}`, { user: CUSTOMER, params: p() });
  assert.equal(c.status, 200);
  assert.equal(c.body.role, 'customer');
  assert.equal(c.body.contract.status, 'active');
  assert.equal(c.body.job.id, pc.jobId);
  assert.equal(c.body.current_version.id, pc.versionId);
  assert.equal(c.body.current_version.version, 1);
  assert.deepEqual(c.body.versions.map((v: { version: number; state: string }) => [v.version, v.state]), [[1, 'current']]);
  assert.equal(c.body.work_paused, false);
  assert.deepEqual(c.body.steering_credits, { allowance: 2, used: 0, remaining: 2 });
  assert.ok(Array.isArray(c.body.spec.requirements));

  const pv = await http('contract', 'GET', `/api/contracts/${pc.contractId}`, { user: PROVIDER, params: p() });
  assert.equal(pv.status, 200);
  assert.equal(pv.body.role, 'provider');

  const s = await http('contract', 'GET', `/api/contracts/${pc.contractId}`, { user: STRANGER, params: p() });
  assert.equal(s.status, 403);
  assert.equal(s.body.error, 'forbidden');

  const missing = '00000000-0000-4000-8000-000000000001';
  assert.equal((await http('contract', 'GET', `/api/contracts/${missing}`, { user: CUSTOMER, params: { id: missing } })).status, 404);
  assert.equal((await http('contract', 'GET', '/api/contracts/nope', { user: CUSTOMER, params: { id: 'nope' } })).status, 404);
  assert.equal((await http('contract', 'GET', `/api/contracts/${pc.contractId}`, { user: null, params: p() })).status, 401);
});

test('contracts list shows only the caller\'s contracts, filterable by role', async () => {
  const mine = await http('contracts', 'GET', '/api/contracts', { user: CUSTOMER });
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.contracts.map((c: { id: string }) => c.id), [pc.contractId]);
  assert.equal(mine.body.contracts[0].role, 'customer');
  assert.equal(mine.body.contracts[0].job_title, 'Room job for integration tests');
  assert.equal(mine.body.contracts[0].current_version.price_cents, 30000);
  const asProvider = await http('contracts', 'GET', '/api/contracts?role=provider', { user: CUSTOMER });
  assert.deepEqual(asProvider.body.contracts, []);
  const prov = await http('contracts', 'GET', '/api/contracts?role=provider', { user: PROVIDER });
  assert.deepEqual(prov.body.contracts.map((c: { id: string }) => c.id), [pc.contractId]);
  assert.deepEqual((await http('contracts', 'GET', '/api/contracts', { user: STRANGER })).body.contracts, []);
  assert.equal((await http('contracts', 'GET', '/api/contracts?role=boss', { user: CUSTOMER })).status, 400);
});

test('messages: both parties post and read; strangers get 403; ?since returns only newer messages', async () => {
  const a = await http('messages', 'POST', `/api/contracts/${pc.contractId}/messages`, { user: CUSTOMER, params: p(), body: { body: 'Hi there' } });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.message.author_role, 'customer');
  assert.equal(a.body.message.kind, 'message');
  const first = await http('messages', 'GET', `/api/contracts/${pc.contractId}/messages`, { user: PROVIDER, params: p() });
  assert.equal(first.status, 200);
  const cursor = first.body.next_cursor;
  assert.equal(typeof cursor, 'string');
  const b = await http('messages', 'POST', `/api/contracts/${pc.contractId}/messages`, { user: PROVIDER, params: p(), body: { body: 'Hello back' } });
  assert.equal(b.body.message.author_role, 'provider');
  const newer = await http('messages', 'GET', `/api/contracts/${pc.contractId}/messages?since=${cursor}`, { user: CUSTOMER, params: p() });
  assert.deepEqual(newer.body.messages.map((m: { body: string }) => m.body), ['Hello back']);
  assert.notEqual(newer.body.next_cursor, cursor);
  const none = await http('messages', 'GET', `/api/contracts/${pc.contractId}/messages?since=${newer.body.next_cursor}`, { user: CUSTOMER, params: p() });
  assert.deepEqual(none.body.messages, []);
  assert.equal(none.body.next_cursor, newer.body.next_cursor);

  assert.equal((await http('messages', 'GET', `/api/contracts/${pc.contractId}/messages`, { user: STRANGER, params: p() })).status, 403);
  assert.equal((await http('messages', 'POST', `/api/contracts/${pc.contractId}/messages`, { user: STRANGER, params: p(), body: { body: 'x' } })).status, 403);
  assert.equal((await http('messages', 'POST', `/api/contracts/${pc.contractId}/messages`, { user: CUSTOMER, params: p(), body: { body: '' } })).status, 400);
  assert.equal((await http('messages', 'GET', `/api/contracts/${pc.contractId}/messages?since=abc`, { user: CUSTOMER, params: p() })).status, 400);
});

test('progress_post: provider only, shows up in messages and activity', async () => {
  const ok = await tool(PROVIDER, 'progress_post', { contract_id: pc.contractId, summary: 'Importer skeleton done', percent_complete: 30 });
  assert.equal(ok.isError, false, JSON.stringify(ok.data));
  assert.equal(ok.data.message.kind, 'progress');
  assert.equal(ok.data.message.author_role, 'provider');
  assert.equal(ok.data.message.metadata.percent_complete, 30);
  assert.ok(ok.data.message.agent_identity_id);

  const denied = await tool(CUSTOMER, 'progress_post', { contract_id: pc.contractId, summary: 'I am not the provider' });
  assert.equal(denied.isError, true);
  assert.equal(denied.data.error, 'forbidden');
  const stranger = await tool(STRANGER, 'progress_post', { contract_id: pc.contractId, summary: 'x' });
  assert.equal(stranger.data.error, 'forbidden');

  const msgs = await http('messages', 'GET', `/api/contracts/${pc.contractId}/messages`, { user: CUSTOMER, params: p() });
  assert.ok(msgs.body.messages.some((m: { kind: string; body: string }) => m.kind === 'progress' && m.body.startsWith('Importer skeleton done')));
  const act = await http('activity', 'GET', `/api/contracts/${pc.contractId}/activity`, { user: CUSTOMER, params: p() });
  assert.equal(act.status, 200);
  assert.ok(act.body.events.some((e: { type: string }) => e.type === 'progress_posted'));
  const since = await http('activity', 'GET', `/api/contracts/${pc.contractId}/activity?since=${act.body.next_cursor}`, { user: CUSTOMER, params: p() });
  assert.deepEqual(since.body.events, []);
  assert.equal((await http('activity', 'GET', `/api/contracts/${pc.contractId}/activity`, { user: STRANGER, params: p() })).status, 403);
});

test('progress_post on an unpaid contract is invalid_state', async () => {
  const unpaid = await paidContract('user_room_c2', 'user_room_p2', { pay: false });
  const res = await tool('user_room_p2', 'progress_post', { contract_id: unpaid.contractId, summary: 'Starting' });
  assert.equal(res.data.error, 'invalid_state');
});

test('milestone_update creates and updates; visible over HTTP; customer cannot change milestones', async () => {
  const created = await tool(PROVIDER, 'milestone_update', { contract_id: pc.contractId, title: 'Parser', status: 'in_progress' });
  assert.equal(created.isError, false, JSON.stringify(created.data));
  const id = created.data.milestone.id;
  assert.equal(created.data.milestone.status, 'in_progress');
  assert.equal(created.data.milestone.completed_at, null);
  const done = await tool(PROVIDER, 'milestone_update', { contract_id: pc.contractId, milestone_id: id, status: 'done' });
  assert.equal(done.data.milestone.status, 'done');
  assert.ok(done.data.milestone.completed_at);
  assert.equal(done.data.milestone.title, 'Parser');

  const noTitle = await tool(PROVIDER, 'milestone_update', { contract_id: pc.contractId, status: 'pending' });
  assert.equal(noTitle.data.error, 'invalid_request');
  const wrong = await tool(PROVIDER, 'milestone_update', { contract_id: pc.contractId, milestone_id: '00000000-0000-4000-8000-000000000009', status: 'done' });
  assert.equal(wrong.data.error, 'not_found');
  const cust = await tool(CUSTOMER, 'milestone_update', { contract_id: pc.contractId, title: 'Mine', status: 'pending' });
  assert.equal(cust.data.error, 'forbidden');

  const list = await http('milestones', 'GET', `/api/contracts/${pc.contractId}/milestones`, { user: CUSTOMER, params: p() });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.milestones.map((m: { title: string; status: string }) => [m.title, m.status]), [['Parser', 'done']]);
  assert.equal(typeof list.body.next_cursor, 'string');
  const later = await http('milestones', 'GET', `/api/contracts/${pc.contractId}/milestones?since=${encodeURIComponent(list.body.next_cursor)}`, { user: CUSTOMER, params: p() });
  assert.deepEqual(later.body.milestones, []);
  assert.equal((await http('milestones', 'GET', `/api/contracts/${pc.contractId}/milestones`, { user: STRANGER, params: p() })).status, 403);
});

test('contract_get and contracts_list over MCP are filtered to parties', async () => {
  const got = await tool(PROVIDER, 'contract_get', { contract_id: pc.contractId });
  assert.equal(got.data.role, 'provider');
  assert.ok(Array.isArray(got.data.milestones));
  assert.ok(Array.isArray(got.data.open_steering));
  assert.equal((await tool(STRANGER, 'contract_get', { contract_id: pc.contractId })).data.error, 'forbidden');
  const list = await tool(PROVIDER, 'contracts_list', { role: 'provider' });
  assert.ok(list.data.contracts.some((c: { id: string }) => c.id === pc.contractId));
  assert.deepEqual((await tool(STRANGER, 'contracts_list', {})).data.contracts, []);
});

test('a bid placed through the HTTP route notifies the customer (bid_received)', async () => {
  const sent = notifyState.sent.filter((c) => c.type === 'bid_received' && c.userId === CUSTOMER);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.jobId, pc.jobId);
  assert.equal(sent[0].payload.amountCents, 30000);
  assert.equal(sent[0].dedupeKey, `bid_received:${pc.bidId}`);
  const [{ n }] = await sql<{ n: string }>('SELECT count(*)::text AS n FROM job_messages WHERE contract_id = $1', [pc.contractId]);
  assert.ok(Number(n) >= 3);
});
