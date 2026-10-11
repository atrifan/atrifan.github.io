import { beforeAll, describe, expect, it } from 'vitest';
import { dbReady, req } from './env';
import { seedMarketplace, TEST_PACKAGE_ID, TEST_PRO_KEY } from '../fixtures/seed';

/**
 * Calls the discover route handler directly against the Supabase project in
 * .env.local, with the seeded paid fixture key. Skips when the env is missing.
 */
describe.skipIf(!dbReady)('GET /api/marketplace/discover (route handler, real DB)', () => {
  beforeAll(async () => {
    await seedMarketplace();
  });

  it('rejects a request with no API key', async () => {
    const { GET } = await import('@/app/api/marketplace/discover/route');
    const res = await GET(req('/api/marketplace/discover'));
    expect(res.status).toBe(401);
  });

  it('returns the seeded public fixture package for a paid key', async () => {
    const { GET } = await import('@/app/api/marketplace/discover/route');
    const res = await GET(
      req('/api/marketplace/discover?type=mcp&limit=50', { headers: { authorization: `Bearer ${TEST_PRO_KEY}` } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { id: string; type: string }[]; count: number };
    expect(body.count).toBe(body.results.length);
    expect(body.results.every((r) => r.type === 'mcp')).toBe(true);
    expect(body.results.map((r) => r.id)).toContain(TEST_PACKAGE_ID);
  });
});
