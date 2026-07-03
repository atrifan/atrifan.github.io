import { test, expect } from '@playwright/test';
import { TEST_PRO_KEY, TEST_PACKAGE_ID, hasSupabaseEnv } from '../fixtures/seed';

const VALID_TYPES = ['plugin', 'skill', 'practitioner', 'mcp'];

// Fixtures are seeded once in tests/global-setup.ts — do not seed/clean per file.
test.describe('GET /api/marketplace/discover', () => {
  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('no Authorization header → 401 with error string', async ({ request }) => {
    const res = await request.get('/api/marketplace/discover');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
  });

  test('clearly-invalid Bearer key → 401', async ({ request }) => {
    const res = await request.get('/api/marketplace/discover', {
      headers: { Authorization: 'Bearer tlz_bogus' },
    });
    expect(res.status()).toBe(401);
  });

  test('valid key → 200 with expected shape', async ({ request }) => {
    const res = await request.get('/api/marketplace/discover', {
      headers: { Authorization: `Bearer ${TEST_PRO_KEY}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect.soft(Array.isArray(body.results)).toBe(true);
    expect.soft(typeof body.count).toBe('number');
    expect.soft(['pro', 'plus']).toContain(body.plan);
    expect.soft(body.count).toBe(body.results.length);

    if (body.results.length > 0) {
      const r = body.results[0];
      expect.soft(typeof r.id).toBe('string');
      expect.soft(typeof r.name).toBe('string');
      expect.soft(typeof r.description).toBe('string');
      expect.soft(VALID_TYPES).toContain(r.type);
      expect.soft(typeof r.version).toBe('string');
      expect.soft(r.rating === null || typeof r.rating === 'number').toBe(true);
      expect.soft(typeof r.rating_count).toBe('number');
      expect.soft(typeof r.install_count).toBe('number');
      expect.soft(typeof r.install).toBe('object');
      expect.soft(['archive', 'mcp']).toContain(r.install.source_type);
      expect.soft(
        r.install.blob_url !== undefined || r.install.config_json !== undefined
      ).toBe(true);
      expect.soft(typeof r.updated_at).toBe('string');
    }
  });

  test('?type=mcp → all results are mcp and include seeded package', async ({ request }) => {
    const res = await request.get('/api/marketplace/discover?type=mcp', {
      headers: { Authorization: `Bearer ${TEST_PRO_KEY}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    for (const r of body.results) {
      expect.soft(r.type).toBe('mcp');
    }
    const ids = body.results.map((r: { id: string }) => r.id);
    expect(ids).toContain(TEST_PACKAGE_ID);
  });

  test('?limit=1 → at most 1 result', async ({ request }) => {
    const res = await request.get('/api/marketplace/discover?limit=1', {
      headers: { Authorization: `Bearer ${TEST_PRO_KEY}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.results.length).toBeLessThanOrEqual(1);
  });
});
