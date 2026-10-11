import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installMocks, resetDb, sql } from './helpers';

installMocks();

/**
 * Client-supplied identity headers are not credentials on the marketplace MCP server
 * (/api/mcp) and its path-key variants (/api/mcp/<key>, /api/mcp/<key>/<serverName>).
 */

const PRO_KEY = 'tlz_integration_identity_pro_0001';
const FREE_KEY = 'tlz_integration_identity_free_0001';
const BAD_KEY = 'tlz_integration_identity_nope_0001';
const PRO_USER = 'user_identity_pro';
const FREE_USER = 'user_identity_free';
const PAID_TOOLS = ['marketplace_discover', 'marketplace_install', 'marketplace_publish'];

function sha(k: string) {
  return createHash('sha256').update(k).digest('hex');
}

function spoof(userId = PRO_USER, lower = false): Record<string, string> {
  const h: Record<string, string> = {
    'X-User-Id': userId,
    'X-Auth-Method': 'path',
    'X-User-Plan': 'plus',
    'X-Server-Name': 'default',
    'X-Api-Key-Id': '00000000-0000-4000-8000-000000000abc',
    'X-Original-Api-Key': PRO_KEY,
  };
  return lower ? Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v])) : h;
}

const discover = (id: number) => ({
  jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'marketplace_discover', arguments: { type: 'mcp' } },
});
const list = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });

async function req(pathname: string, body: unknown, headers: Record<string, string>) {
  const { NextRequest } = await import('next/server');
  return new NextRequest(`http://localhost:3000${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function read(res: Response) {
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function root(body: unknown, headers: Record<string, string> = {}) {
  const mod = await import('../../app/api/mcp/route');
  return read(await mod.POST(await req('/api/mcp', body, headers)));
}

async function keyRoute(key: string, body: unknown, headers: Record<string, string> = {}) {
  const mod = await import('../../app/api/mcp/[key]/route');
  return read(await (mod.POST as any)(await req(`/api/mcp/${key}`, body, headers), { params: Promise.resolve({ key }) }));
}

async function serverRoute(key: string, serverName: string, body: unknown, headers: Record<string, string> = {}) {
  const mod = await import('../../app/api/mcp/[key]/[serverName]/route');
  return read(await (mod.POST as any)(
    await req(`/api/mcp/${key}/${serverName}`, body, headers),
    { params: Promise.resolve({ key, serverName }) },
  ));
}

const names = (body: any): string[] => (body?.result?.tools ?? []).map((t: { name: string }) => t.name);

before(async () => {
  await resetDb();
  await sql(
    `INSERT INTO api_keys (user_id, api_key_hash, api_key_suffix, name, server_name, device_name, provider, plan, is_active)
     VALUES ($1, $2, '0001', 'pro', 'default', 'it', 'custom', 'pro', TRUE),
            ($3, $4, '0001', 'free', 'default', 'it', 'custom', 'free', TRUE)`,
    [PRO_USER, sha(PRO_KEY), FREE_USER, sha(FREE_KEY)],
  );
});

after(async () => {
  await resetDb();
});

test('identity-headers: spoofed X-User-Id without a key → tools/call 401 -32001, id echoed, no result', async () => {
  const { status, body } = await root(discover(11), spoof());
  assert.equal(status, 401, JSON.stringify(body));
  assert.equal(body.error?.code, -32001);
  assert.equal(body.id, 11);
  assert.equal(body.result, undefined);
});

test('identity-headers: spoofed headers on tools/list → 200 anonymous list without marketplace tools', async () => {
  const { status, body } = await root(list(12), spoof());
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(Array.isArray(body.result?.tools), JSON.stringify(body));
  for (const t of PAID_TOOLS) assert.ok(!names(body).includes(t), `anonymous list contains ${t}`);
});

test('identity-headers: lower-case x-user-id spoof → 401 -32001', async () => {
  const { status, body } = await root(discover(13), spoof(PRO_USER, true));
  assert.equal(status, 401, JSON.stringify(body));
  assert.equal(body.error?.code, -32001);
  assert.equal(body.id, 13);
  assert.equal(body.result, undefined);
});

test('identity-headers: valid x-api-key + spoofed X-User-Id for another user → works as the key owner', async () => {
  // The integration DB has no `packages` table, so discover itself may report a tool-level error;
  // what matters here is that the key authenticates (no -32001/-32003) despite the spoof.
  // The e2e spec checks the full 200-with-result path against the real schema.
  const { status, body } = await root(discover(14), { ...spoof('user_someone_else'), 'x-api-key': PRO_KEY });
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(![-32001, -32003].includes(body.error?.code), JSON.stringify(body));
  const l = await root(list(15), { ...spoof('user_someone_else'), 'x-api-key': PRO_KEY });
  assert.equal(l.status, 200);
  for (const t of PAID_TOOLS) assert.ok(names(l.body).includes(t), `keyed list lacks ${t}`);
});

test('identity-headers: /api/mcp/<valid key> → tools/list has marketplace_discover; tools/call → result', async () => {
  const l = await keyRoute(PRO_KEY, list(21));
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.ok(names(l.body).includes('marketplace_discover'), JSON.stringify(l.body));
  const c = await keyRoute(PRO_KEY, discover(22));
  assert.equal(c.status, 200, JSON.stringify(c.body));
  // No `packages` table here (see above): only require that the path key authenticated.
  assert.ok(![-32001, -32003].includes(c.body.error?.code), JSON.stringify(c.body));
});

test('identity-headers: /api/mcp/<invalid key> → 401 -32001', async () => {
  const { status, body } = await keyRoute(BAD_KEY, list(23));
  assert.equal(status, 401, JSON.stringify(body));
  assert.equal(body.error?.code, -32001);
});

test('identity-headers: /api/mcp/<valid key>/default → tools/list has marketplace_discover', async () => {
  const { status, body } = await serverRoute(PRO_KEY, 'default', list(24));
  assert.equal(status, 200, JSON.stringify(body));
  assert.ok(names(body).includes('marketplace_discover'), JSON.stringify(body));
});

test('identity-headers: /api/mcp/<invalid key>/default and <valid key>/<unknown server> → 401 -32001', async () => {
  const bad = await serverRoute(BAD_KEY, 'default', list(25));
  assert.equal(bad.status, 401, JSON.stringify(bad.body));
  assert.equal(bad.body.error?.code, -32001);
  const unknown = await serverRoute(PRO_KEY, 'no-such-server-xyz', list(26));
  assert.equal(unknown.status, 401, JSON.stringify(unknown.body));
  assert.equal(unknown.body.error?.code, -32001);
});

test('identity-headers: spoofed headers do not rescue an invalid path key', async () => {
  const a = await keyRoute(BAD_KEY, discover(27), spoof());
  assert.equal(a.status, 401, JSON.stringify(a.body));
  assert.equal(a.body.error?.code, -32001);
  const b = await serverRoute(BAD_KEY, 'default', discover(28), spoof());
  assert.equal(b.status, 401, JSON.stringify(b.body));
  assert.equal(b.body.error?.code, -32001);
});

test('identity-headers: free key → 403 -32003 on all three surfaces', async () => {
  const results = {
    root: await root(discover(31), { 'x-api-key': FREE_KEY }),
    key: await keyRoute(FREE_KEY, discover(32)),
    server: await serverRoute(FREE_KEY, 'default', discover(33)),
  };
  for (const [surface, r] of Object.entries(results)) {
    assert.equal(r.status, 403, `${surface} ${JSON.stringify(r.body)}`);
    assert.equal(r.body.error?.code, -32003, surface);
  }
});
