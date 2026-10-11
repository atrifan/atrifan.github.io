import { test, expect, type APIResponse } from '@playwright/test';
import { blockThirdParty } from './surface-helpers';

/**
 * Hub SEO with TULZO_SURFACE=hub (:3002 by default, NEXT_PUBLIC_ROOT_DOMAIN=tulzo.test):
 * canonicals, titles, descriptions, robots, sitemap and the www → apex redirect.
 */

const ROOT = 'https://tulzo.test';
const PUBLIC_PAGES = ['/', '/pricing', '/docs', '/legal'];
const PRIVATE_PATHS = ['/profile', '/credits', '/admin'];

const canonicalFor = (path: string) => (path === '/' ? `${ROOT}/` : `${ROOT}${path}`);

/** Attribute of the first tag matching `<tag ... attr=value ...>` in the HTML (attribute order free). */
function tagAttr(html: string, tag: string, match: [string, string], want: string): string | null {
  const tags = html.match(new RegExp(`<${tag}\\b[^>]*>`, 'gi')) ?? [];
  const attr = (t: string, name: string) => t.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] ?? null;
  for (const t of tags) {
    if (attr(t, match[0])?.toLowerCase() === match[1]) return attr(t, want);
  }
  return null;
}

async function html(res: APIResponse): Promise<string> {
  expect(res.status()).toBe(200);
  return res.text();
}

test.describe('hub SEO: public pages', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path}: 200, canonical ${canonicalFor(path)}, title, description, indexable`, async ({ request }) => {
      const body = await html(await request.get(path, { maxRedirects: 0 }));
      // Next.js writes the root canonical without its trailing slash; both forms are the same URL.
      const canonical = tagAttr(body, 'link', ['rel', 'canonical'], 'href');
      expect(path === '/' ? canonical?.replace(/\/?$/, '/') : canonical).toBe(canonicalFor(path));
      const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? '';
      expect(title.length, 'non-empty <title>').toBeGreaterThan(0);
      const description = tagAttr(body, 'meta', ['name', 'description'], 'content') ?? '';
      expect(description.trim().length, 'non-empty meta description').toBeGreaterThan(0);
      const robots = tagAttr(body, 'meta', ['name', 'robots'], 'content') ?? '';
      expect(robots).not.toMatch(/noindex/i);
    });
  }
});

test.describe('hub SEO: private pages', () => {
  for (const path of ['/profile', '/credits']) {
    test(`${path} signed out redirects to sign-in or is noindex`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      if (res.status() >= 300 && res.status() < 400) {
        expect(res.headers()['location'] ?? '').toMatch(/sign-in/);
      } else {
        const robots = tagAttr(await res.text(), 'meta', ['name', 'robots'], 'content') ?? '';
        expect(robots).toMatch(/noindex/i);
      }
    });
  }

  test('robots.txt disallows /profile, /credits and /admin', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const disallowed = (await res.text())
      .split('\n')
      .map((l) => l.match(/^\s*disallow:\s*(\S+)/i)?.[1])
      .filter((v): v is string => !!v);
    for (const p of PRIVATE_PATHS) {
      expect(disallowed.some((d) => d === p || d === `${p}/` || d === `${p}*`), `Disallow: ${p}`).toBe(true);
    }
  });
});

test.describe('hub SEO: sitemap', () => {
  test('lists the public pages and none of the private ones', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
    for (const path of PUBLIC_PAGES) expect(locs).toContain(canonicalFor(path));
    for (const p of PRIVATE_PATHS) expect(xml).not.toContain(p);
  });
});

test.describe('hub SEO: www redirect', () => {
  for (const [path, location] of [
    ['/', `${ROOT}/`],
    ['/pricing?x=1', `${ROOT}/pricing?x=1`],
  ] as const) {
    test(`www.tulzo.test${path} → 308 ${location}`, async ({ request }) => {
      const res = await request.get(path, { headers: { host: 'www.tulzo.test' }, maxRedirects: 0 });
      expect(res.status()).toBe(308);
      expect(res.headers()['location']).toBe(location);
    });
  }
});

test.describe('hub docs and legal pages', () => {
  test.beforeEach(async ({ page }) => blockThirdParty(page));

  test('/docs has h1 "Docs"', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Docs');
  });

  test('/legal has h1 "Legal" and the three policy links', async ({ page }) => {
    await page.goto('/legal');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Legal');
    for (const name of ['Privacy policy', 'Cookie policy', 'Terms and conditions']) {
      await expect(page.getByRole('main').getByRole('link', { name, exact: true })).toBeVisible();
    }
  });
});
