import crypto from 'crypto';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { TEST_PRO_KEY, TEST_USER_ID, hasSupabaseEnv } from '../fixtures/seed';

/**
 * Client-supplied identity headers (X-User-Id, X-User-Plan, X-Auth-Method, X-Api-Key-Id,
 * X-Server-Name, X-Original-Api-Key) are not credentials. Only x-api-key / Authorization
 * authenticate a caller on /api/mcp; path-key routes carry the key in the URL.
 *
 * Fixture key TEST_PRO_KEY is seeded once in tests/global-setup.ts — do not seed/clean it here.
 * A throwaway Free-plan key is seeded for this file only and removed in afterAll.
 */

const BAD_KEY = `tlz_e2e_invalid_${crypto.randomBytes(8).toString('hex')}`;
const FREE_KEY = `tlz_e2e_free_${crypto.randomBytes(12).toString('hex')}`;
const FREE_USER = `e2e_identity_free_${crypto.randomBytes(6).toString('hex')}`;
const PAID_TOOLS = ['marketplace_discover', 'marketplace_install', 'marketplace_publish'];

function sha(k: string) {
  return crypto.createHash('sha256').update(k).digest('hex');
}

function db() {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function spoofHeaders(userId: string = TEST_USER_ID, lower = false): Record<string, string> {
  const h: Record<string, string> = {
    'X-User-Id': userId,
    'X-Auth-Method': 'path',
    'X-User-Plan': 'plus',
    'X-Server-Name': 'default',
    'X-Api-Key-Id': '00000000-0000-4000-8000-000000000abc',
    'X-Original-Api-Key': TEST_PRO_KEY,
  };
  if (!lower) return h;
  return Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
}

const discover = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/call',
  params: { name: 'marketplace_discover', arguments: { type: 'mcp' } },
});
const list = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });

async function post(request: APIRequestContext, url: string, data: unknown, headers: Record<string, string> = {}) {
  const res = await request.post(url, { headers: { 'Content-Type': 'application/json', ...headers }, data });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), body };
}

function toolNames(body: any): string[] {
  return (body?.result?.tools ?? []).map((t: { name: string }) => t.name);
}

test.describe('MCP: client-supplied identity headers are not credentials', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('spoofed X-User-Id + friends without a key → tools/call 401 -32001, no result', async ({ request }) => {
    const { status, body } = await post(request, '/api/mcp', discover(11), spoofHeaders());
    expect(status, JSON.stringify(body)).toBe(401);
    expect(body?.error?.code).toBe(-32001);
    expect(body?.id).toBe(11);
    expect(body?.result).toBeUndefined();
  });

  test('spoofed headers on tools/list → 200 anonymous list without marketplace tools', async ({ request }) => {
    const { status, body } = await post(request, '/api/mcp', list(12), spoofHeaders());
    expect(status).toBe(200);
    expect(Array.isArray(body?.result?.tools)).toBe(true);
    const names = toolNames(body);
    for (const t of PAID_TOOLS) expect(names).not.toContain(t);
  });

  test('header names are case-insensitive: lower-case x-user-id spoof → 401 -32001', async ({ request }) => {
    const { status, body } = await post(request, '/api/mcp', discover(13), spoofHeaders(TEST_USER_ID, true));
    expect(status, JSON.stringify(body)).toBe(401);
    expect(body?.error?.code).toBe(-32001);
    expect(body?.id).toBe(13);
    expect(body?.result).toBeUndefined();
  });

  test('valid x-api-key + spoofed X-User-Id for another user → still works as the key owner', async ({ request }) => {
    const { status, body } = await post(request, '/api/mcp', discover(14), {
      ...spoofHeaders('some_other_user_entirely'),
      'x-api-key': TEST_PRO_KEY,
    });
    expect(status, JSON.stringify(body)).toBe(200);
    expect(body?.error).toBeUndefined();
    expect(body?.result).toBeTruthy();
  });
});

test.describe('MCP path-key routes', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('/api/mcp/<valid key>: tools/list has marketplace tools; tools/call discover → result', async ({ request }) => {
    const l = await post(request, `/api/mcp/${TEST_PRO_KEY}`, list(21));
    expect(l.status, JSON.stringify(l.body)).toBe(200);
    expect(toolNames(l.body)).toContain('marketplace_discover');

    const c = await post(request, `/api/mcp/${TEST_PRO_KEY}`, discover(22));
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    expect(c.body?.error).toBeUndefined();
    expect(c.body?.result).toBeTruthy();
  });

  test('/api/mcp/<invalid key> → 401 -32001', async ({ request }) => {
    const { status, body } = await post(request, `/api/mcp/${BAD_KEY}`, list(23));
    expect(status, JSON.stringify(body)).toBe(401);
    expect(body?.error?.code).toBe(-32001);
  });

  test('/api/mcp/<valid key>/default → tools/list has marketplace_discover', async ({ request }) => {
    const { status, body } = await post(request, `/api/mcp/${TEST_PRO_KEY}/default`, list(24));
    expect(status, JSON.stringify(body)).toBe(200);
    expect(toolNames(body)).toContain('marketplace_discover');
  });

  test('/api/mcp/<invalid key>/default → 401 -32001', async ({ request }) => {
    const { status, body } = await post(request, `/api/mcp/${BAD_KEY}/default`, list(25));
    expect(status, JSON.stringify(body)).toBe(401);
    expect(body?.error?.code).toBe(-32001);
  });

  test('/api/mcp/<valid key>/<unknown server> → 401 -32001', async ({ request }) => {
    const { status, body } = await post(request, `/api/mcp/${TEST_PRO_KEY}/no-such-server-xyz`, list(26));
    expect(status, JSON.stringify(body)).toBe(401);
    expect(body?.error?.code).toBe(-32001);
  });

  test('spoofed headers do not rescue an invalid path key → 401', async ({ request }) => {
    for (const url of [`/api/mcp/${BAD_KEY}`, `/api/mcp/${BAD_KEY}/default`]) {
      const { status, body } = await post(request, url, discover(27), spoofHeaders());
      expect(status, `${url} ${JSON.stringify(body)}`).toBe(401);
      expect(body?.error?.code, url).toBe(-32001);
    }
  });
});

test.describe('MCP: Free-plan key', () => {
  test.beforeAll(async () => {
    if (!hasSupabaseEnv()) return;
    const { error } = await db().from('api_keys').insert({
      user_id: FREE_USER,
      api_key_hash: sha(FREE_KEY),
      api_key_suffix: FREE_KEY.slice(-4),
      name: 'e2e-identity-free',
      server_name: 'default',
      device_name: 'e2e',
      provider: 'custom',
      plan: 'free',
      is_active: true,
    });
    if (error) throw new Error(`seed free key: ${error.message}`);
  });

  test.afterAll(async () => {
    if (!hasSupabaseEnv()) return;
    await db().from('api_keys').delete().eq('api_key_hash', sha(FREE_KEY));
  });

  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('free key → 403 -32003 on /api/mcp, /api/mcp/<key> and /api/mcp/<key>/default', async ({ request }) => {
    const cases: Array<[string, Record<string, string>]> = [
      ['/api/mcp', { 'x-api-key': FREE_KEY }],
      [`/api/mcp/${FREE_KEY}`, {}],
      [`/api/mcp/${FREE_KEY}/default`, {}],
    ];
    for (const [url, headers] of cases) {
      const label = url.replace(FREE_KEY, '<freekey>');
      const { status, body } = await post(request, url, discover(31), headers);
      expect.soft(status, `${label} ${JSON.stringify(body)}`).toBe(403);
      expect.soft(body?.error?.code, label).toBe(-32003);
    }
  });
});
