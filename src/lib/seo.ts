import type { MetadataRoute } from 'next';
import { absoluteSurfaceUrl } from './site-url';
import type { Surface } from './surface-url';

type Env = Record<string, string | undefined>;

/**
 * robots.txt and sitemap.xml per surface (app/robots.txt/route.ts, app/sitemap.ts).
 * `surface` null is path-prefix mode: one deploy serving everything.
 * Pages that need sign-in are never listed and are disallowed.
 */

const PRIVATE_SURFACES: readonly Surface[] = ['ai', 'chat'];

/** Public pages per surface, as surface-local paths. */
const PUBLIC_PAGES: Record<Surface, readonly string[]> = {
  hub: ['/', '/pricing', '/docs', '/legal'],
  ai: [],
  marketplace: ['/'],
  gigs: ['/'],
  chat: [],
};

const HUB_DISALLOW = ['/api/', '/dashboard', '/sign-in', '/sign-up', '/profile', '/credits', '/admin'];

export function robotsFor(surface: Surface | null, env: Env = process.env): MetadataRoute.Robots {
  if (surface && PRIVATE_SURFACES.includes(surface)) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  const disallow =
    surface === null ? [...HUB_DISALLOW, '/chat', '/ai'] : surface === 'hub' ? HUB_DISALLOW : ['/api/'];
  return {
    rules: { userAgent: '*', allow: '/', disallow },
    sitemap: absoluteSurfaceUrl(surface ?? 'hub', '/sitemap.xml', env),
  };
}

export function sitemapFor(surface: Surface | null, env: Env = process.env): MetadataRoute.Sitemap {
  const entries: [Surface, string][] =
    surface === null
      ? [
          ...PUBLIC_PAGES.hub.map((p): [Surface, string] => ['hub', p]),
          ['marketplace', '/'],
          ['gigs', '/'],
        ]
      : PUBLIC_PAGES[surface].map((p): [Surface, string] => [surface, p]);
  return entries.map(([s, p]) => ({ url: absoluteSurfaceUrl(s, p, env), changeFrequency: 'weekly' }));
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
