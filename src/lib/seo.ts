import type { MetadataRoute } from 'next';
import { absoluteSurfaceUrl } from './site-url';
import type { Surface } from './surface-url';

type Env = Record<string, string | undefined>;

/**
 * robots.txt and sitemap.xml per surface (app/robots.txt/route.ts, app/sitemap.ts).
 * `surface` is the request's surface (requestSurface()): a single-surface host describes
 * only itself, with absolute URLs on its own host; null is path-prefix mode, one sitemap
 * covering every prefix, its URLs following TULZO_LINKS.
 * Pages that need sign-in are never listed and are disallowed.
 */

/** The env to build a host's robots/sitemap URLs with: a single surface always uses its own host. */
export function seoEnv(surface: Surface | null, env: Env = process.env): Env {
  return surface === null ? env : { ...env, TULZO_LINKS: 'host' };
}

const PRIVATE_SURFACES: readonly Surface[] = ['ai'];

/** Public pages per surface, as surface-local paths. */
const PUBLIC_PAGES: Record<Surface, readonly string[]> = {
  hub: [
    '/',
    '/pricing',
    '/docs',
    '/legal',
    '/legal/terms',
    '/legal/payments',
    '/legal/disclaimers',
    '/legal/acceptable-use',
    '/legal/marketplace-publishers',
    '/legal/complaints',
    '/legal/imprint',
  ],
  ai: [],
  marketplace: ['/'],
  gigs: ['/'],
  // Signed out, chat. `/` is a small public landing; signed in it is the (noindex) chat.
  chat: ['/'],
};

const HUB_DISALLOW = ['/api/', '/dashboard', '/sign-in', '/sign-up', '/profile', '/credits', '/admin'];

export function robotsFor(surface: Surface | null, env: Env = process.env): MetadataRoute.Robots {
  if (surface && PRIVATE_SURFACES.includes(surface)) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  const disallow =
    surface === null ? [...HUB_DISALLOW, '/ai'] : surface === 'hub' ? HUB_DISALLOW : ['/api/'];
  return {
    rules: { userAgent: '*', allow: '/', disallow },
    sitemap: absoluteSurfaceUrl(surface ?? 'hub', '/sitemap.xml', seoEnv(surface, env)),
  };
}

export function sitemapFor(surface: Surface | null, env: Env = process.env): MetadataRoute.Sitemap {
  const entries: [Surface, string][] =
    surface === null
      ? [
          ...PUBLIC_PAGES.hub.map((p): [Surface, string] => ['hub', p]),
          ['marketplace', '/'],
          ['gigs', '/'],
          ['chat', '/'],
        ]
      : PUBLIC_PAGES[surface].map((p): [Surface, string] => [surface, p]);
  const urlEnv = seoEnv(surface, env);
  return entries.map(([s, p]) => ({ url: absoluteSurfaceUrl(s, p, urlEnv), changeFrequency: 'weekly' }));
}

/** robots.txt text for robotsFor(). */
export function robotsTxt(surface: Surface | null, env: Env = process.env): string {
  const { rules, sitemap } = robotsFor(surface, env);
  const lines: string[] = [];
  for (const rule of Array.isArray(rules) ? rules : [rules]) {
    const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
    for (const ua of list(rule.userAgent)) lines.push(`User-agent: ${ua}`);
    for (const a of list(rule.allow)) lines.push(`Allow: ${a}`);
    for (const d of list(rule.disallow)) lines.push(`Disallow: ${d}`);
  }
  if (sitemap) lines.push('', `Sitemap: ${sitemap}`);
  return lines.join('\n') + '\n';
}
