import { test, expect } from '@playwright/test';
import { isSurfaceNotFoundBody } from './surface-helpers';

/**
 * TULZO_SURFACE=hub (:3002, NEXT_PUBLIC_ROOT_DOMAIN=tulzo.test).
 * The hub is the public root site; it keeps every API route and sends the
 * dashboard to the ai surface. Cross-surface redirects are asserted from
 * Location only, never followed.
 */

test.describe('hub surface routing', () => {
  for (const path of ['/', '/pricing', '/sign-in']) {
    test(`GET ${path} returns 200`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });
  }

  test('GET /dashboard is a 308 to the ai surface', async ({ request }) => {
    const res = await request.get('/dashboard', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()['location']).toBe('https://ai.tulzo.test/');
  });

  test('GET /dashboard?tab=keys keeps the query string', async ({ request }) => {
    const res = await request.get('/dashboard?tab=keys', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()['location']).toBe('https://ai.tulzo.test/?tab=keys');
  });

  for (const path of ['/ai', '/marketplace', '/gigs', '/chat', '/ai/x']) {
    test(`GET ${path} returns 404`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });
  }

  test('lookalike /airport gets the normal not-found page, not a surface redirect', async ({ request }) => {
    const res = await request.get('/airport', { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(res.headers()['location']).toBeUndefined();
    expect(res.headers()['content-type'] ?? '').toContain('text/html');
  });

  for (const path of [
    '/api/verify',
    '/api/plugin/chat/poll',
    '/api/chat',
    '/api/oauth/plugin/verify',
    '/api/plugin/version',
  ]) {
    test(`hub keeps API route GET ${path} (not the surface not_found body)`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(await isSurfaceNotFoundBody(res)).toBe(false);
    });
  }
});

test.describe('hub surface SEO', () => {
  test('robots.txt points at the hub sitemap and disallows /api/', async ({ request }) => {
    const res = await request.get('/robots.txt', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Sitemap: https://tulzo.test/sitemap.xml');
    expect(body).toMatch(/^Disallow: \/api\/\s*$/m);
  });

  test('sitemap.xml lists public hub pages only', async ({ request }) => {
    const res = await request.get('/sitemap.xml', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] ?? '').toMatch(/xml/);
    const body = await res.text();
    expect(body).toContain('<loc>https://tulzo.test/</loc>');
    expect(body).toContain('<loc>https://tulzo.test/pricing</loc>');
    for (const banned of ['/dashboard', '/chat', '/sign-in', 'ai.tulzo.test']) {
      expect(body, `sitemap must not mention ${banned}`).not.toContain(banned);
    }
  });
});
