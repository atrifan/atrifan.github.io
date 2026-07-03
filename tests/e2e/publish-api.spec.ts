import { test, expect } from '@playwright/test';
import { TEST_PRO_KEY, hasSupabaseEnv } from '../fixtures/seed';

const PUBLISH_ID = 'e2e-publish-fixture-mcp';

// Fixtures are seeded once in tests/global-setup.ts — do not seed/clean per file.
test.describe('POST /api/marketplace/publish', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('valid mcp package → 200 with pending visibility', async ({ request }) => {
    const res = await request.post('/api/marketplace/publish', {
      headers: { Authorization: `Bearer ${TEST_PRO_KEY}` },
      data: {
        id: PUBLISH_ID,
        name: 'E2E Publish Fixture',
        type: 'mcp',
        version: '1.0.0',
        config_json: { transport: 'http', url: 'https://example.com/mcp' },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect.soft(body.ok).toBe(true);
    expect.soft(body.id).toBe(PUBLISH_ID);
    expect.soft(body.version).toBe('1.0.0');
    expect.soft(body.visibility).toBe('pending');
  });

  test('missing required field (name) → 400', async ({ request }) => {
    const res = await request.post('/api/marketplace/publish', {
      headers: { Authorization: `Bearer ${TEST_PRO_KEY}` },
      data: {
        id: PUBLISH_ID,
        type: 'mcp',
        version: '1.0.0',
        config_json: { transport: 'http', url: 'https://example.com/mcp' },
      },
    });
    expect(res.status()).toBe(400);
  });

  test('mcp type without config_json → 400', async ({ request }) => {
    const res = await request.post('/api/marketplace/publish', {
      headers: { Authorization: `Bearer ${TEST_PRO_KEY}` },
      data: {
        id: PUBLISH_ID,
        name: 'E2E Publish Fixture',
        type: 'mcp',
        version: '1.0.0',
      },
    });
    expect(res.status()).toBe(400);
  });

  test('no Authorization header → 401', async ({ request }) => {
    const res = await request.post('/api/marketplace/publish', {
      data: {
        id: PUBLISH_ID,
        name: 'E2E Publish Fixture',
        type: 'mcp',
        version: '1.0.0',
        config_json: { transport: 'http', url: 'https://example.com/mcp' },
      },
    });
    expect(res.status()).toBe(401);
  });
});
