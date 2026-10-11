import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installMocks, resetDb, sql, useFakeStripe, stopFakeStripe, seedEnabledProvider, notifyState } from './helpers';

installMocks();

import { rpc, tool, openJob, http, E2E_SECRET } from './room-helpers';

const FREE_KEY = 'tlz_integration_free_key_0001';
const REVOKED_KEY = 'tlz_integration_revoked_key_0001';
const FREE_USER = 'user_mcp_free';

const EXPECTED_TOOLS = [
  'jobs_search', 'jobs_get', 'offers_post', 'offers_list_mine', 'jobs_bid', 'jobs_withdraw_bid',
  'contracts_list', 'contract_get', 'contract_accept_version', 'progress_post', 'milestone_update',
  'steering_list', 'steering_respond', 'whoami',
];

function sha(k: string) {
  return createHash('sha256').update(k).digest('hex');
}

before(async () => {
  await resetDb();
  await useFakeStripe();
  await sql(
    `INSERT INTO api_keys (user_id, api_key_hash, api_key_suffix, name, plan, is_active)
     VALUES ($1, $2, '0001', 'free', 'free', TRUE), ('user_mcp_revoked', $3, '0001', 'revoked', 'pro', FALSE)`,
    [FREE_USER, sha(FREE_KEY), sha(REVOKED_KEY)],
  );
});

after(async () => {
  await stopFakeStripe();
  await resetDb();
});

test('no credentials → 401 -32001 with a WWW-Authenticate pointing at the resource metadata', async () => {
  const { NextRequest } = await import('next/server');
  const mod = await import('../../app/api/jobs/mcp/route');
  const res = await mod.POST(new NextRequest('http://localhost:3000/api/jobs/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }));
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, -32001);
  assert.equal(body.id, 1);
  const www = res.headers.get('www-authenticate') ?? '';
  assert.match(www, /^Bearer /);
  assert.match(www, /resource_metadata="http:\/\/localhost:3000\/\.well-known\/oauth-protected-resource\/api\/jobs\/mcp"/);
});

test('bad credentials → 401 -32001', async () => {
  for (const headers of [
    { 'x-api-key': REVOKED_KEY },
    { authorization: `Bearer ${REVOKED_KEY}` },
    { 'x-e2e-user': 'user_x', 'x-e2e-secret': `${E2E_SECRET}_nope` },
  ] as Array<Record<string, string>>) {
    const res = await rpc({ method: 'tools/list' }, { headers });
    assert.equal(res.status, 401, JSON.stringify(headers));
    assert.equal(res.body.error.code, -32001);
  }
});

test('transport: parse error 400, invalid request -32600, unknown method -32601, notification 202', async () => {
  const parse = await rpc('{not json', { user: 'user_t' });
  assert.equal(parse.status, 400);
  assert.equal(parse.body.error.code, -32700);
  const invalid = await rpc({ jsonrpc: '1.0', method: 'tools/list' } as never, { user: 'user_t' });
  assert.equal(invalid.body.error.code, -32600);
  const unknown = await rpc({ method: 'foo/bar' }, { user: 'user_t' });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.error.code, -32601);
  const ping = await rpc({ method: 'ping' }, { user: 'user_t' });
  assert.deepEqual(ping.body.result, {});
  const mod = await import('../../app/api/jobs/mcp/route');
  const { NextRequest } = await import('next/server');
  const note = await mod.POST(new NextRequest('http://localhost:3000/api/jobs/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-e2e-user': 'user_t', 'x-e2e-secret': E2E_SECRET },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  }));
  assert.equal(note.status, 202);
  assert.equal(await note.text(), '');
  assert.equal((await mod.GET()).status, 405);
  const unknownTool = await rpc({ method: 'tools/call', params: { name: 'nope', arguments: {} } }, { user: 'user_t' });
  assert.equal(unknownTool.body.error.code, -32602);
  const noName = await rpc({ method: 'tools/call', params: {} }, { user: 'user_t' });
  assert.equal(noName.body.error.code, -32602);
});

test('the Free plan may use the Jobs MCP with an API key; whoami reflects the key', async () => {
  for (const headers of [{ 'x-api-key': FREE_KEY }, { authorization: `Bearer ${FREE_KEY}` }] as Array<Record<string, string>>) {
    const res = await rpc({ method: 'tools/call', params: { name: 'whoami', arguments: {} } }, { headers });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const me = res.body.result.structuredContent;
    assert.equal(me.user_id, FREE_USER);
    assert.equal(me.plan, 'free');
    assert.equal(me.auth_method, 'api_key');
    assert.equal(me.connect.payouts_enabled, false);
    assert.match(me.connect.onboarding_url, /^https?:\/\//);
    assert.deepEqual(me.trust, { score: null, status: 'not_available' });
  }
  const rows = await sql<{ client_kind: string; api_key_id: string | null }>(
    'SELECT client_kind, api_key_id FROM agent_identities WHERE user_id = $1', [FREE_USER],
  );
  assert.equal(rows.length, 1, 'one identity per API key');
  assert.equal(rows[0].client_kind, 'api_key');
  assert.ok(rows[0].api_key_id);
});

test('initialize records clientInfo as the agent identity; one identity per client', async () => {
  const init = await rpc({
    method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'claude-code', version: '2.1.0' } },
  }, { user: 'user_agent_owner', client: 'client-a' });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-03-26');
  assert.equal(init.body.result.serverInfo.name, 'tulzo-jobs');
  assert.deepEqual(init.body.result.capabilities, { tools: { listChanged: false } });
  assert.match(init.body.result.instructions, /steering/i);

  const a = await tool('user_agent_owner', 'whoami', {}, 'client-a');
  assert.equal(a.data.agent.name, 'claude-code');
  assert.equal(a.data.agent.version, '2.1.0');
  assert.equal(a.data.auth_method, 'test');
  const again = await tool('user_agent_owner', 'whoami', {}, 'client-a');
  assert.equal(again.data.agent.id, a.data.agent.id);
  const b = await tool('user_agent_owner', 'whoami', {}, 'client-b');
  assert.notEqual(b.data.agent.id, a.data.agent.id);
  const [owner] = await sql<{ owner_principal_id: string; principal: string }>(
    `SELECT a.owner_principal_id, p.id AS principal FROM agent_identities a
     JOIN principals p ON p.user_id = a.user_id AND p.kind = 'user' WHERE a.id = $1`, [a.data.agent.id],
  );
  assert.equal(owner.owner_principal_id, owner.principal);
});

test('tools/list has every Jobs tool with a description and an object schema', async () => {
  const res = await rpc({ method: 'tools/list' }, { user: 'user_t' });
  const tools = res.body.result.tools as Array<{ name: string; description: string; inputSchema: { type: string } }>;
  assert.deepEqual(tools.map((t) => t.name).sort(), [...EXPECTED_TOOLS].sort());
  for (const t of tools) {
    assert.ok(t.description.length > 40, t.name);
    assert.equal(t.inputSchema.type, 'object', t.name);
  }
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  assert.match(byName.progress_post.description, /chain-of-thought/i);
  assert.match(byName.steering_respond.description, /scope/i);
});

test('jobs_bid: same gate and codes as the HTTP route, connect_required carries the onboarding URL', async () => {
  const customer = 'user_bidmcp_customer';
  const provider = 'user_bidmcp_provider';
  const jobId = await openJob(customer, 'MCP bidding job');
  const blocked = await tool(provider, 'jobs_bid', { job_id: jobId, price_cents: 30000, eta_days: 5 });
  assert.equal(blocked.isError, true);
  assert.equal(blocked.data.error, 'connect_required');
  assert.equal(blocked.data.status, 403);
  assert.match(blocked.data.onboarding_url, /^https?:\/\/.+connect/);

  await seedEnabledProvider(provider);
  const own = await tool(customer, 'jobs_bid', { job_id: jobId, price_cents: 30000, eta_days: 5 });
  assert.equal(own.data.error, 'connect_required'); // the customer has no Connect either: first check wins
  const low = await tool(provider, 'jobs_bid', { job_id: jobId, price_cents: 100, eta_days: 5 });
  assert.equal(low.data.error, 'price_out_of_bounds');
  const bad = await tool(provider, 'jobs_bid', { job_id: jobId, price_cents: -1, eta_days: 5 });
  assert.equal(bad.data.error, 'invalid_request');

  const me = await tool(provider, 'whoami', {});
  const ok = await tool(provider, 'jobs_bid', { job_id: jobId, price_cents: 30000, eta_days: 5, included_steering_credits: 2 });
  assert.equal(ok.isError, false, JSON.stringify(ok.data));
  assert.equal(ok.data.bid.agent_identity_id, me.data.agent.id);
  assert.equal(ok.data.pricing.customer_total_cents, ok.data.pricing.bid_cents + ok.data.pricing.fee_cents);
  assert.equal((await tool(provider, 'jobs_bid', { job_id: jobId, price_cents: 31000, eta_days: 5 })).data.error, 'bid_exists');

  const owner = await http('bids', 'GET', `/api/jobs/${jobId}/bids`, { user: customer, params: { id: jobId } });
  assert.deepEqual(owner.body.bids.map((b: { id: string }) => b.id), [ok.data.bid.id]);
  assert.ok(notifyState.sent.some((c) => c.type === 'bid_received' && c.dedupeKey === `bid_received:${ok.data.bid.id}`));

  // withdraw: only your own, only once; then you may bid again
  assert.equal((await tool(customer, 'jobs_withdraw_bid', { bid_id: ok.data.bid.id })).data.error, 'not_found');
  const w = await tool(provider, 'jobs_withdraw_bid', { bid_id: ok.data.bid.id });
  assert.equal(w.data.bid.status, 'withdrawn');
  assert.equal((await tool(provider, 'jobs_withdraw_bid', { bid_id: ok.data.bid.id })).data.error, 'bid_not_active');
  const again = await tool(provider, 'jobs_bid', { job_id: jobId, price_cents: 29000, eta_days: 5 });
  assert.equal(again.isError, false);
});

test('jobs_search, jobs_get, offers_post, offers_list_mine call the shared services', async () => {
  const customer = 'user_search_customer';
  const jobId = await openJob(customer, 'Searchable zebra job');
  const found = await tool('user_searcher', 'jobs_search', { q: 'zebra' });
  assert.deepEqual(found.data.jobs.map((j: { id: string }) => j.id), [jobId]);
  assert.equal(found.data.jobs[0].bid_count, 0);
  const got = await tool('user_searcher', 'jobs_get', { job_id: jobId });
  assert.equal(got.data.job.id, jobId);
  assert.equal(got.data.spec.status, 'approved');
  assert.equal((await tool('user_searcher', 'jobs_get', { job_id: '00000000-0000-4000-8000-000000000002' })).data.error, 'not_found');
  assert.equal((await tool('user_searcher', 'jobs_search', { limit: 0 })).data.error, 'invalid_request');

  const offer = await tool('user_offerer', 'offers_post', {
    title: 'CSV importers', description: 'I build CSV importers in Node.', price_cents: 20000, delivery_days: 3, tags: ['node'],
  });
  assert.equal(offer.data.offer.status, 'active');
  const mine = await tool('user_offerer', 'offers_list_mine', {});
  assert.deepEqual(mine.data.offers.map((o: { id: string }) => o.id), [offer.data.offer.id]);
  assert.deepEqual((await tool('user_other', 'offers_list_mine', {})).data.offers, []);
  assert.equal((await tool('user_offerer', 'offers_post', { title: 'x' })).data.error, 'invalid_request');
});
