import { test, expect } from '@playwright/test';
import { TEST_PRO_KEY, TEST_PACKAGE_ID, hasSupabaseEnv } from '../fixtures/seed';

// Fixtures are seeded once in tests/global-setup.ts — do not seed/clean per file.
test.describe('POST /api/mcp (JSON-RPC marketplace server)', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('tools/list includes marketplace tools', async ({ request }) => {
    const res = await request.post('/api/mcp', {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_PRO_KEY,
      },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body.result?.tools)).toBe(true);
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect.soft(names).toContain('marketplace_discover');
    expect.soft(names).toContain('marketplace_install');
    expect.soft(names).toContain('marketplace_publish');
  });

  test('tools/call marketplace_discover returns results with seeded package', async ({ request }) => {
    const res = await request.post('/api/mcp', {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': TEST_PRO_KEY,
      },
      data: {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'marketplace_discover', arguments: { type: 'mcp' } },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const result = body.result;
    expect(result).toBeTruthy();

    // Prefer structuredContent.results; fall back to parsing content[0].text.
    let payload: { results?: unknown[] } | undefined;
    if (result.structuredContent && Array.isArray(result.structuredContent.results)) {
      payload = result.structuredContent;
    } else if (result.content?.[0]?.text) {
      payload = JSON.parse(result.content[0].text);
    }

    expect(payload).toBeTruthy();
    expect(Array.isArray(payload!.results)).toBe(true);

    // The seeded package id should appear somewhere in the returned JSON.
    const rawJson = JSON.stringify(result);
    expect(rawJson).toContain(TEST_PACKAGE_ID);
  });

  test('tools/call with no auth → HTTP 401 or JSON-RPC error', async ({ request }) => {
    const res = await request.post('/api/mcp', {
      headers: { 'Content-Type': 'application/json' },
      data: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'marketplace_discover', arguments: { type: 'mcp' } },
      },
    });

    if (res.status() === 401) {
      expect(res.status()).toBe(401);
    } else {
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.error).toBeTruthy();
    }
  });
});
