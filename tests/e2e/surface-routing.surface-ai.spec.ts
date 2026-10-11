import { test, expect } from '@playwright/test';
import { blockThirdParty, isSurfaceNotFoundBody, keepPageOnLocalhost, PRIMARY_NAV } from './surface-helpers';

/**
 * TULZO_SURFACE=ai (:3001, NEXT_PUBLIC_ROOT_DOMAIN=tulzo.test).
 * The ai surface serves the AI app at "/" and hands everything else to the
 * other surfaces. Cross-surface redirects are asserted from Location only.
 */

test.describe('ai surface routing', () => {
  test('GET / returns 200', async ({ request }) => {
    const res = await request.get('/', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test('"/" renders the AI placeholder via rewrite (URL stays "/")', async ({ page }) => {
    await blockThirdParty(page);
    await keepPageOnLocalhost(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('AI', { useInnerText: true });
    await expect(page.getByText('Coming soon').first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('GET /ai is a 308 to "/"', async ({ request }) => {
    const res = await request.get('/ai', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(['/', 'http://localhost:3001/']).toContain(res.headers()['location']);
  });

  test('GET /ai/anything is a 308 to "/anything"', async ({ request }) => {
    const res = await request.get('/ai/anything', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()['location']).toMatch(/\/anything$/);
  });

  for (const path of ['/marketplace', '/gigs', '/chat', '/pricing', '/dashboard', '/marketplace/x']) {
    test(`GET ${path} returns 404`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
    });
  }

  test('GET /sign-in is a 308 to the hub sign-in page', async ({ request }) => {
    const res = await request.get('/sign-in', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()['location']).toBe('https://tulzo.test/sign-in');
  });

  test('redirects keep the query string', async ({ request }) => {
    const res = await request.get('/sign-in?redirect_url=x', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()['location']).toContain('?redirect_url=x');
  });

  for (const path of ['/api/verify', '/api/chat', '/api/plugin/chat/poll']) {
    test(`API outside the ai allow-list: GET ${path} is 404 {"error":"not_found"}`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(404);
      expect(await isSurfaceNotFoundBody(res)).toBe(true);
    });
  }

  for (const path of ['/api/keys/list', '/api/plugin/devices']) {
    test(`API owned by ai: GET ${path} is not the surface not_found body`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(await isSurfaceNotFoundBody(res)).toBe(false);
    });
  }

  test('GET /.well-known/openid-configuration is not 404', async ({ request }) => {
    const res = await request.get('/.well-known/openid-configuration', { maxRedirects: 0 });
    expect(res.status()).not.toBe(404);
  });

  test('shell nav on "/" marks AI current and links to absolute surface URLs', async ({ page }) => {
    await blockThirdParty(page);
    await keepPageOnLocalhost(page);
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const expected: Record<(typeof PRIMARY_NAV)[number], string> = {
      AI: 'https://ai.tulzo.test/',
      Marketplace: 'https://marketplace.tulzo.test/',
      Gigs: 'https://gigs.tulzo.test/',
      Chat: 'https://chat.tulzo.test/',
    };
    for (const name of PRIMARY_NAV) {
      const link = nav.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', expected[name]);
      if (name === 'AI') await expect(link).toHaveAttribute('aria-current', 'page');
      else await expect(link).not.toHaveAttribute('aria-current', /.*/);
    }
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Tulzo', exact: true }),
    ).toHaveAttribute('href', 'https://tulzo.test/');
  });
});

test.describe('ai surface SEO', () => {
  test('robots.txt disallows the whole surface', async ({ request }) => {
    const res = await request.get('/robots.txt', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('User-agent: *');
    expect(body).toMatch(/^Disallow: \/\s*$/m);
  });
});
