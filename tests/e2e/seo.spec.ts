import { test, expect } from '@playwright/test';

/** SEO files in path-prefix mode (:3000). Surface-specific checks live in the surface specs. */

test.describe('SEO (path-prefix mode)', () => {
  test('robots.txt allows crawling, points at an absolute sitemap and disallows /api/', async ({
    request,
  }) => {
    const res = await request.get('/robots.txt', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] ?? '').toContain('text/plain');
    const body = await res.text();
    expect(body).toContain('User-agent: *');
    const sitemap = body.match(/^Sitemap:\s*(\S+)\s*$/m)?.[1];
    expect(sitemap, 'robots.txt has a Sitemap: line').toBeTruthy();
    expect(sitemap).toMatch(/^https?:\/\/[^/]+\/(.*\/)?sitemap\.xml$/);
    expect(body).toMatch(/^Disallow: \/api\/\s*$/m);
  });

  test('sitemap.xml is a urlset of absolute URLs with public pages only', async ({ request }) => {
    const res = await request.get('/sitemap.xml', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/<urlset[\s>]/);
    expect(body).toContain('</urlset>');

    const locs = [...body.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) expect(loc).toMatch(/^https?:\/\/[^/\s]+/);

    const paths = locs.map((loc) => new URL(loc).pathname.replace(/\/$/, '') || '/');
    expect(paths).toContain('/');
    expect(paths).toContain('/pricing');
    for (const banned of ['/dashboard', '/chat', '/sign-in', '/sign-up']) {
      expect(
        paths.filter((p) => p === banned || p.startsWith(`${banned}/`)),
        `sitemap must not list ${banned}`,
      ).toEqual([]);
    }
  });
});
