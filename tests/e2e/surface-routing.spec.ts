import { test, expect, type APIRequestContext } from '@playwright/test';
import { blockThirdParty, isSurfaceNotFoundBody } from './surface-helpers';

/**
 * Surface routing in path-prefix mode (TULZO_SURFACE unset), against the project's baseURL.
 * Every surface lives under its own path prefix on one host.
 */

/** The configured baseURL's origin (playwright.config.ts: PLAYWRIGHT_BASE_URL or PW_PORT). */
function originOf(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('surface-routing.spec needs a baseURL in playwright.config.ts');
  return new URL(baseURL).origin;
}

/**
 * Follow redirects by hand, but only while they stay on this app's origin.
 * Returns the final URL (which may be off-origin, in which case it is not fetched).
 */
async function resolveRedirects(request: APIRequestContext, origin: string, path: string): Promise<URL> {
  let url = new URL(path, origin);
  for (let hop = 0; hop < 6; hop++) {
    const res = await request.get(url.toString(), { maxRedirects: 0 });
    const status = res.status();
    if (status < 300 || status >= 400) return url;
    const location = res.headers()['location'];
    expect(location, `${url.pathname} answered ${status} without a Location header`).toBeTruthy();
    url = new URL(location, url);
    if (url.origin !== origin) return url;
  }
  return url;
}

test.describe('path-prefix mode routing', () => {
  test.beforeEach(async ({ page }) => blockThirdParty(page));

  for (const path of ['/', '/pricing', '/marketplace', '/gigs', '/sign-in']) {
    test(`GET ${path} returns 200`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(200);
    });
  }

  // No surface is a "Coming soon" placeholder any more: ai., marketplace., gigs. and chat. all ship real pages.

  test('/gigs is the gigs home with h1 "Gigs" (no longer a placeholder)', async ({ page }) => {
    await page.goto('/gigs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Gigs', { useInnerText: true });
    await expect(page.getByRole('tablist', { name: 'Listings' })).toBeVisible();
    await expect(page).not.toHaveTitle(/Coming soon/);
  });

  // /ai is the signed-in control panel (src/views/ai), no longer a placeholder.
  for (const path of ['/dashboard', '/ai', '/ai/secrets']) {
    test(`signed-out ${path} lands on this app's /sign-in, not a Clerk host`, async ({ request, page, baseURL }) => {
      const ORIGIN = originOf(baseURL);
      const clerkHost = /accounts\.dev$|(^|\.)clerk\./;
      const finalUrl = await resolveRedirects(request, ORIGIN, path);
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
