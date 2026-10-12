import { test, expect, type APIRequestContext } from '@playwright/test';
import { blockThirdParty, isSurfaceNotFoundBody } from './surface-helpers';

/**
 * Surface routing in path-prefix mode (TULZO_SURFACE unset, :3000).
 * Every surface lives under its own path prefix on one host.
 */

const ORIGIN = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${process.env.PW_PORT || 3000}`;

/**
 * Follow redirects by hand, but only while they stay on this app's origin.
 * Returns the final URL (which may be off-origin, in which case it is not fetched).
 */
async function resolveRedirects(request: APIRequestContext, path: string): Promise<URL> {
  let url = new URL(path, ORIGIN);
  for (let hop = 0; hop < 6; hop++) {
    const res = await request.get(url.toString(), { maxRedirects: 0 });
    const status = res.status();
    if (status < 300 || status >= 400) return url;
    const location = res.headers()['location'];
    expect(location, `${url.pathname} answered ${status} without a Location header`).toBeTruthy();
    url = new URL(location, url);
    if (url.origin !== ORIGIN) return url;
  }
  return url;
}

test.describe('path-prefix mode routing', () => {
  test.beforeEach(async ({ page }) => blockThirdParty(page));

  for (const path of ['/', '/pricing', '/ai', '/marketplace', '/gigs', '/sign-in']) {
    test(`GET ${path} returns 200`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });
  }

  const placeholders = [
    { path: '/ai', heading: 'AI' },
    { path: '/marketplace', heading: 'Marketplace' },
    { path: '/gigs', heading: 'Gigs' },
  ];
  for (const { path, heading } of placeholders) {
    test(`${path} is a "Coming soon" placeholder with h1 "${heading}"`, async ({ page }) => {
      await page.goto(path);
      const h1 = page.getByRole('heading', { level: 1 });
      await expect(h1).toHaveCount(1);
      await expect(h1).toHaveText(heading, { useInnerText: true });
      await expect(page.getByText('Coming soon').first()).toBeVisible();
      await expect(page).toHaveTitle(/Coming soon/);
    });
  }

  for (const path of ['/dashboard', '/chat']) {
    test(`signed-out ${path} lands on this app's /sign-in, not a Clerk host`, async ({ request, page }) => {
      const clerkHost = /accounts\.dev$|(^|\.)clerk\./;
      const finalUrl = await resolveRedirects(request, path);
      expect(finalUrl.hostname).not.toMatch(clerkHost);
      if (finalUrl.origin === ORIGIN && finalUrl.pathname.startsWith('/sign-in')) return;

      // No server redirect to /sign-in: the page itself must navigate there.
      // Off-origin document navigations are recorded and aborted, never followed.
      const offOrigin: string[] = [];
      await page.route(
        (url) => url.origin !== ORIGIN,
        (route) => {
          if (route.request().isNavigationRequest()) {
            offOrigin.push(route.request().url());
            return route.abort('blockedbyclient');
          }
          return route.fallback();
        },
      );
      await page.goto(path);
      await expect
        .poll(() => new URL(page.url()).pathname, { message: `${path} navigates to /sign-in` })
        .toMatch(/^\/sign-in/);
      expect(new URL(page.url()).origin).toBe(ORIGIN);
      expect(offOrigin, 'no navigation to another host').toEqual([]);
    });
  }

  test('unknown path returns 404', async ({ request }) => {
    const res = await request.get('/this-does-not-exist', { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test('/api routes are untouched: /api/plugin/chat/poll is not the surface not_found body', async ({
    request,
  }) => {
    const res = await request.get('/api/plugin/chat/poll', { maxRedirects: 0 });
    expect(await isSurfaceNotFoundBody(res)).toBe(false);
  });
});
