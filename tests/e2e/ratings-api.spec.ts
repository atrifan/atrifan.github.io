import { test, expect } from '@playwright/test';
import {
  TEST_PACKAGE_ID,
  seedMarketplace,
  cleanupMarketplace,
  hasSupabaseEnv,
} from '../fixtures/seed';

// NOTE: Ratings endpoints are Clerk-authenticated (browser session), not
// API-key authenticated. This API-only suite therefore asserts only the
// UNAUTHENTICATED behavior. Authenticated rating flows are covered by the UI
// a11y/e2e suite once Clerk test tokens are configured.

test.describe('/api/packages/[id]/ratings (unauthenticated)', () => {
  test.beforeAll(async () => {
    if (!hasSupabaseEnv()) return;
    await seedMarketplace();
  });

  test.afterAll(async () => {
    if (!hasSupabaseEnv()) return;
    await cleanupMarketplace();
  });

  test.beforeEach(() => {
    test.skip(!hasSupabaseEnv(), 'requires Supabase env');
  });

  test('GET without auth → not 200 (Clerk-protected)', async ({ request }) => {
    const res = await request.get(`/api/packages/${TEST_PACKAGE_ID}/ratings`, {
      maxRedirects: 0,
    });
    // Unauthorized (>= 400) or a redirect (3xx) are both acceptable.
    expect(res.status()).not.toBe(200);
  });

  test('POST without auth → not 200 (Clerk-protected)', async ({ request }) => {
    const res = await request.post(`/api/packages/${TEST_PACKAGE_ID}/ratings`, {
      data: { rating: 5 },
      maxRedirects: 0,
    });
    expect(res.status()).not.toBe(200);
  });
});
