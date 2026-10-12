import { test, expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { blockThirdParty, isSurfaceNotFoundBody, PRIMARY_NAV } from './surface-helpers';

/**
 * TULZO_ROUTING=hybrid (project `host-routing`, :PW_HOST_PORT, NEXT_PUBLIC_ROOT_DOMAIN=tulzo.test,
 * TULZO_LINKS=path). One deploy; the surface is picked per request from the Host header.
 *
 * API-level checks call http://localhost:<port> with an explicit Host header (the request context does
 * not use the browser's host-resolver rules). Page checks load http://<host>.tulzo.test:<port>/ in the
 * browser, which maps *.tulzo.test to 127.0.0.1. Cross-host redirects are asserted from Location only.
 */

const PORT = Number(process.env.PW_HOST_PORT) || 3003;
const BASE = `http://localhost:${PORT}`;
const R = 'tulzo.test';

test.describe.configure({ timeout: 120_000 });

type Headers = Record<string, string>;

function get(request: APIRequestContext, host: string, path: string, headers: Headers = {}): Promise<APIResponse> {
  return request.get(`${BASE}${path}`, { headers: { Host: host, ...headers }, maxRedirects: 0 });
}

/** <title> and first <h1> text of an HTML document, used to tell which page a host served. */
function pageIdentity(html: string): { title: string; h1: string } {
  const clean = (s: string | undefined) => (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return {
    title: clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    h1: clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),
  };
}

async function identityOf(request: APIRequestContext, host: string, path: string, headers: Headers = {}) {
  const res = await get(request, host, path, headers);
  expect(res.status(), `${host}${path}`).toBe(200);
  return pageIdentity(await res.text());
}

/** Location resolved against the request URL (so relative and absolute values compare alike). */
function locationOf(res: APIResponse, host: string): URL {
  const loc = res.headers()['location'];
  expect(loc, 'Location header').toBeTruthy();
  return new URL(loc, `http://${host}/`);
}

/**
 * Signed out, a protected page sends the browser to a sign-in page. With Clerk's development instance a
 * document request first goes through Clerk's handshake, so the redirect is only visible to a browser:
 * record the navigation requests and wait for one matching `signIn`. Its target is never loaded.
 */
async function expectSentToSignIn(page: Page, host: string, path: string, signIn: RegExp): Promise<void> {
  await blockThirdParty(page);
  const navigations: string[] = [];
  page.on('request', (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) navigations.push(req.url());
  });
  await page.goto(`http://${host}:${PORT}${path}`).catch(() => {});
  await expect
    .poll(() => navigations.find((u) => signIn.test(u)) ?? navigations.join('\n'), { timeout: 45_000 })
    .toMatch(signIn);
}

// ---------------------------------------------------------------------------------------------------
// 1. Path-mode hosts
// ---------------------------------------------------------------------------------------------------

const PATH_MODE_HOSTS = [R, 'localhost', 'tulzo.vercel.app', 'my-preview-abc.vercel.app', `foo.${R}`];

for (const host of PATH_MODE_HOSTS) {
  test.describe(`path-mode host ${host}`, () => {
    for (const path of ['/', '/pricing', '/docs', '/legal', '/marketplace', '/gigs', '/chat']) {
      test(`GET ${path} is a 200 page`, async ({ request }) => {
        const res = await get(request, host, path);
        expect(res.status()).toBe(200);
        expect(res.headers()['content-type']).toContain('text/html');
      });
    }

    test('"/" is the hub (same page as localhost "/")', async ({ request }) => {
      const hub = await identityOf(request, 'localhost', '/');
      expect(await identityOf(request, host, '/')).toEqual(hub);
    });

    test('"/marketplace" is the marketplace page (same as localhost "/marketplace")', async ({ request }) => {
      const mk = await identityOf(request, 'localhost', '/marketplace');
      expect(await identityOf(request, host, '/marketplace')).toEqual(mk);
    });

    // The project's browser does not resolve *.vercel.app; those hosts are covered by
    // host-routing-vercel.host-routing.spec.ts.
    for (const path of host.endsWith('.vercel.app') ? [] : ['/ai', '/ai/usage']) {
      test(`signed-out ${path} is sent toward a sign-in page`, async ({ page }) => {
        // Any sign-in page (this host's, the apex's, or Clerk's hosted one), but never a surface subdomain.
        await expectSentToSignIn(page, host, path, /^https?:\/\/(?!(ai|marketplace|gigs|chat)\.)[^/]+\/sign-in/);
      });
    }

    for (const path of [
      '/api/verify',
      '/api/chat',
      '/api/jobs',
      '/api/marketplace/discover',
      '/api/packages',
      '/api/keys/list',
      '/api/plugin/chat',
      '/api/notifications/preferences',
    ]) {
      test(`API ${path} reaches its handler (not the surface not_found body)`, async ({ request }) => {
        const res = await get(request, host, path);
        expect(await isSurfaceNotFoundBody(res)).toBe(false);
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------------
// 2. Surface subdomains serve their surface at the root
// ---------------------------------------------------------------------------------------------------

test.describe('surface subdomains serve their surface at "/"', () => {
  for (const surface of ['marketplace', 'gigs', 'chat'] as const) {
    test(`${surface}.${R}/ is the same page as ${R}/${surface}`, async ({ request }) => {
      const apex = await identityOf(request, R, `/${surface}`);
      const hub = await identityOf(request, R, '/');
      // Guard: the comparison is meaningful only if the surface page differs from the hub.
      expect(apex).not.toEqual(hub);
      expect(await identityOf(request, `${surface}.${R}`, '/')).toEqual(apex);
    });
  }

  for (const path of ['/', '/usage']) {
    test(`signed-out ai.${R}${path} is sent to the apex sign-in`, async ({ page }) => {
      await expectSentToSignIn(page, `ai.${R}`, path, /^https:\/\/tulzo\.test\/sign-in/);
    });
  }

  test(`host matching ignores case, port and a trailing dot (MARKETPLACE.${R}.:${PORT})`, async ({ request }) => {
    const apex = await identityOf(request, R, '/marketplace');
    expect(await identityOf(request, `MARKETPLACE.${R}.:${PORT}`, '/')).toEqual(apex);
    const api = await get(request, `MARKETPLACE.${R}.:${PORT}`, '/api/jobs');
    expect(api.status()).toBe(404);
    expect(await isSurfaceNotFoundBody(api)).toBe(true);
  });

  test(`Gigs.${R}:${PORT} is the gigs surface`, async ({ request }) => {
    const apex = await identityOf(request, R, '/gigs');
    expect(await identityOf(request, `Gigs.${R}:${PORT}`, '/')).toEqual(apex);
  });
});

test.describe('own prefix 308s to the root path', () => {
  const cases: Array<[string, string, string]> = [
    ['marketplace', '/marketplace/foo', '/foo'],
    ['marketplace', '/marketplace', '/'],
    ['gigs', '/gigs/jobs', '/jobs'],
    ['gigs', '/gigs', '/'],
    ['chat', '/chat/x', '/x'],
    ['chat', '/chat', '/'],
    ['ai', '/ai/usage', '/usage'],
    ['ai', '/ai', '/'],
  ];
  for (const [surface, from, to] of cases) {
    test(`${surface}.${R}${from} → 308 ${to}`, async ({ request }) => {
      const host = `${surface}.${R}`;
      const res = await get(request, host, from);
      expect(res.status()).toBe(308);
      const loc = locationOf(res, host);
      expect(loc.pathname).toBe(to);
      expect(loc.hostname).toBe(host);
    });
  }

  test(`marketplace.${R}/marketplace/foo?a=b keeps the query`, async ({ request }) => {
    const res = await get(request, `marketplace.${R}`, '/marketplace/foo?a=b');
    expect(res.status()).toBe(308);
    expect(res.headers()['location']).toMatch(/\/foo\?a=b$/);
  });
});

test.describe('other surfaces\' pages are 404 on a surface subdomain', () => {
  const cases: Record<string, string[]> = {
    marketplace: ['/gigs', '/chat', '/ai', '/pricing', '/dashboard'],
    gigs: ['/marketplace', '/chat', '/pricing'],
    chat: ['/gigs', '/marketplace', '/pricing'],
    ai: ['/marketplace', '/gigs', '/pricing'],
  };
  for (const [surface, paths] of Object.entries(cases)) {
    for (const path of paths) {
      test(`${surface}.${R}${path} is 404`, async ({ request }) => {
        const res = await get(request, `${surface}.${R}`, path);
        expect(res.status()).toBe(404);
      });
    }
  }
});

test.describe('/sign-in on a surface subdomain goes to the apex', () => {
  for (const surface of ['ai', 'marketplace', 'gigs', 'chat']) {
    test(`${surface}.${R}/sign-in → 308 https://${R}/sign-in`, async ({ request }) => {
      const res = await get(request, `${surface}.${R}`, '/sign-in');
      expect(res.status()).toBe(308);
      expect(res.headers()['location']).toBe(`https://${R}/sign-in`);
    });

    test(`${surface}.${R}/sign-in keeps the query`, async ({ request }) => {
      const res = await get(request, `${surface}.${R}`, '/sign-in?redirect_url=x');
      expect(res.status()).toBe(308);
      const loc = res.headers()['location'];
      expect(loc).toMatch(/^https:\/\/tulzo\.test\/sign-in/);
      expect(loc).toContain('?redirect_url=x');
    });
  }
});

// ---------------------------------------------------------------------------------------------------
// 3. API allow-list per subdomain
// ---------------------------------------------------------------------------------------------------

const NOTIFICATIONS_OK = ['/api/notifications', '/api/notifications/read', '/api/notifications/unread-count'];

const API_ALLOWED: Record<string, string[]> = {
  ai: [
    '/api/keys/list',
    '/api/dashboard/activity',
    '/api/usage',
    '/api/plugin/devices',
    '/api/plugin/presence',
    '/api/plugin/version',
    ...NOTIFICATIONS_OK,
  ],
  marketplace: ['/api/marketplace/discover', '/api/packages', '/api/admin/downloads', ...NOTIFICATIONS_OK],
  gigs: ['/api/jobs', '/api/offers', '/api/bids', '/api/contracts', '/api/trust', '/api/activity/gigs', ...NOTIFICATIONS_OK],
  chat: ['/api/plugin/chat', '/api/plugin/devices', '/api/plugin/presence', ...NOTIFICATIONS_OK],
};

const API_DENIED: Record<string, string[]> = {
  ai: ['/api/verify', '/api/chat', '/api/plugin/chat', '/api/packages', '/api/jobs', '/api/notifications/preferences', '/api/keysx'],
  marketplace: [
    '/api/verify',
    '/api/chat',
    '/api/jobs',
    '/api/keys/list',
    '/api/plugin/chat',
    '/api/notifications/preferences',
    '/api/marketplacex',
  ],
  gigs: [
    '/api/verify',
    '/api/chat',
    '/api/marketplace/discover',
    '/api/packages',
    '/api/keys/list',
    '/api/notifications/preferences',
    '/api/jobsx',
  ],
  chat: [
    '/api/verify',
    '/api/chat',
    '/api/keys/list',
    '/api/jobs',
    '/api/plugin/version',
    '/api/notifications/preferences',
    '/api/plugin/chatx',
  ],
};

for (const surface of Object.keys(API_ALLOWED)) {
  test.describe(`${surface}.${R} API allow-list`, () => {
    for (const path of API_ALLOWED[surface]) {
      test(`allowed: ${path} reaches its handler`, async ({ request }) => {
        const res = await get(request, `${surface}.${R}`, path);
        expect(await isSurfaceNotFoundBody(res)).toBe(false);
      });
    }
    for (const path of API_DENIED[surface]) {
      test(`not allowed: ${path} is 404 {"error":"not_found"}`, async ({ request }) => {
        const res = await get(request, `${surface}.${R}`, path);
        expect(res.status()).toBe(404);
        expect(await isSurfaceNotFoundBody(res)).toBe(true);
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------------
// 4. jobs. and www. redirects
// ---------------------------------------------------------------------------------------------------

test.describe('jobs. and www. hosts redirect', () => {
  for (const [path, to] of [
    ['/jobs/1?a=b', `https://gigs.${R}/jobs/1?a=b`],
    ['/', `https://gigs.${R}/`],
  ]) {
    test(`jobs.${R}${path} → 308 ${to}`, async ({ request }) => {
      const res = await get(request, `jobs.${R}`, path);
      expect(res.status()).toBe(308);
      expect(res.headers()['location']).toBe(to);
    });
  }

  test(`www.${R}/x?y=1 → 308 https://${R}/x?y=1`, async ({ request }) => {
    const res = await get(request, `www.${R}`, '/x?y=1');
    expect(res.status()).toBe(308);
    expect(res.headers()['location']).toBe(`https://${R}/x?y=1`);
  });
});

// ---------------------------------------------------------------------------------------------------
// 5. robots.txt and sitemap.xml per host
// ---------------------------------------------------------------------------------------------------

const BARE_DISALLOW = /^Disallow: \/\s*$/m;
const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

test.describe('robots.txt and sitemap.xml per host', () => {
  test(`ai.${R}/robots.txt closes the whole host`, async ({ request }) => {
    const res = await get(request, `ai.${R}`, '/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('User-agent: *');
    expect(body).toMatch(BARE_DISALLOW);
    expect(body).not.toMatch(/^Allow:/m);
  });

  for (const surface of ['marketplace', 'gigs', 'chat']) {
    const host = `${surface}.${R}`;
    test(`${host}/robots.txt allows the host and points at its own sitemap`, async ({ request }) => {
      const res = await get(request, host, '/robots.txt');
      expect(res.status()).toBe(200);
      const body = await res.text();
      expect(body).toMatch(/^Allow: \/\s*$/m);
      expect(body).toMatch(new RegExp(`^Sitemap: https://${surface}\\.tulzo\\.test/sitemap\\.xml\\s*$`, 'm'));
      expect(body).not.toMatch(BARE_DISALLOW);
    });

    test(`${host}/sitemap.xml lists only ${host} URLs, including its root`, async ({ request }) => {
      const res = await get(request, host, '/sitemap.xml');
      expect(res.status()).toBe(200);
      const xml = await res.text();
      expect(xml).toContain('<urlset');
      const all = locs(xml);
      expect(all.length).toBeGreaterThan(0);
      for (const loc of all) expect(loc.startsWith(`https://${host}/`), loc).toBe(true);
      expect(all).toContain(`https://${host}/`);
    });
  }

  test(`apex ${R}/robots.txt`, async ({ request }) => {
    const res = await get(request, R, '/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/^Sitemap: https:\/\/tulzo\.test\/sitemap\.xml\s*$/m);
    expect(body).toMatch(/^Disallow: \/ai\b/m);
    expect(body).not.toMatch(BARE_DISALLOW);
  });

  test(`apex ${R}/sitemap.xml`, async ({ request }) => {
    const res = await get(request, R, '/sitemap.xml');
    expect(res.status()).toBe(200);
    const all = locs(await res.text());
    for (const want of ['/', '/pricing', '/marketplace', '/gigs', '/chat']) {
      expect(all).toContain(`https://${R}${want}`);
    }
    for (const loc of all) expect(new URL(loc).hostname, loc).toBe(R);
  });
});

// ---------------------------------------------------------------------------------------------------
// 6. Primary navigation
// ---------------------------------------------------------------------------------------------------

const APEX_NAV_HREF: Record<(typeof PRIMARY_NAV)[number], string> = {
  AI: `https://${R}/ai`,
  Marketplace: `https://${R}/marketplace`,
  Gigs: `https://${R}/gigs`,
  Chat: `https://${R}/chat`,
};

async function expectNav(page: Page, current: (typeof PRIMARY_NAV)[number] | null): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Primary' }).first();
  for (const name of PRIMARY_NAV) {
    const link = nav.getByRole('link', { name, exact: true, includeHidden: true });
    await expect(link).toHaveAttribute('href', APEX_NAV_HREF[name]);
    if (name === current) await expect(link).toHaveAttribute('aria-current', 'page');
    else await expect(link).not.toHaveAttribute('aria-current', /.*/);
  }
}

test.describe('primary navigation per host', () => {
  const cases: Array<[string, string, (typeof PRIMARY_NAV)[number] | null]> = [
    [`marketplace.${R}`, '/', 'Marketplace'],
    [`gigs.${R}`, '/', 'Gigs'],
    [`chat.${R}`, '/', 'Chat'],
    [R, '/', null],
    [R, '/gigs', 'Gigs'],
    [R, '/marketplace', 'Marketplace'],
    ['localhost', '/', null],
  ];
  for (const [host, path, current] of cases) {
    test(`${host}${path}: ${current ?? 'no'} link current, every href on the apex`, async ({ page }) => {
      await blockThirdParty(page);
      const res = await page.goto(`http://${host}:${PORT}${path}`);
      expect(res?.status()).toBe(200);
      expect(new URL(page.url()).hostname).toBe(host);
      await expectNav(page, current);
    });
  }
});

// ---------------------------------------------------------------------------------------------------
// 7. Client-sent routing headers are ignored
// ---------------------------------------------------------------------------------------------------

test.describe('client-sent x-tulzo-surface and x-forwarded-host are ignored', () => {
  test(`apex "/" with x-tulzo-surface: marketplace is still the hub (page)`, async ({ page }) => {
    await blockThirdParty(page);
    // Add the header to same-host requests only (cross-origin Clerk requests would need a preflight).
    await page.route(
      (url) => url.hostname === R,
      (route) => route.continue({ headers: { ...route.request().headers(), 'x-tulzo-surface': 'marketplace' } }),
    );
    const res = await page.goto(`http://${R}:${PORT}/`);
    expect(res?.status()).toBe(200);
    await expectNav(page, null);
  });

  test(`apex "/" with x-tulzo-surface: marketplace is still the hub (HTML)`, async ({ request }) => {
    const hub = await identityOf(request, R, '/');
    expect(await identityOf(request, R, '/', { 'x-tulzo-surface': 'marketplace' })).toEqual(hub);
  });

  test(`Host marketplace.${R} with x-tulzo-surface: gigs still serves marketplace`, async ({ request }) => {
    const headers = { 'x-tulzo-surface': 'gigs' };
    const jobs = await get(request, `marketplace.${R}`, '/api/jobs', headers);
    expect(jobs.status()).toBe(404);
    expect(await isSurfaceNotFoundBody(jobs)).toBe(true);
    const packages = await get(request, `marketplace.${R}`, '/api/packages', headers);
    expect(await isSurfaceNotFoundBody(packages)).toBe(false);
    const apexMarketplace = await identityOf(request, R, '/marketplace');
    expect(await identityOf(request, `marketplace.${R}`, '/', headers)).toEqual(apexMarketplace);
  });

  test(`apex /robots.txt with x-tulzo-surface: ai is still the apex robots`, async ({ request }) => {
    const res = await get(request, R, '/robots.txt', { 'x-tulzo-surface': 'ai' });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).not.toMatch(BARE_DISALLOW);
    expect(body).toMatch(/^Sitemap: https:\/\/tulzo\.test\/sitemap\.xml\s*$/m);
  });

  test(`Host ${R} + x-forwarded-host: ai.${R} is still path mode`, async ({ request }) => {
    const res = await get(request, R, '/marketplace', { 'x-forwarded-host': `ai.${R}` });
    expect(res.status()).toBe(200);
    const api = await get(request, R, '/api/verify', { 'x-forwarded-host': `ai.${R}` });
    expect(await isSurfaceNotFoundBody(api)).toBe(false);
  });

  test(`Host marketplace.${R} + x-forwarded-host: ${R} is still marketplace`, async ({ request }) => {
    const res = await get(request, `marketplace.${R}`, '/api/jobs', { 'x-forwarded-host': R });
    expect(res.status()).toBe(404);
    expect(await isSurfaceNotFoundBody(res)).toBe(true);
  });
});
