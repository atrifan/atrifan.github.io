import { describe, expect, it } from 'vitest';
import { robotsFor, robotsTxt, sitemapFor } from '@/src/lib/seo';

const env = { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online' };
const urls = (s: Parameters<typeof sitemapFor>[0], e: Record<string, string> = env) => sitemapFor(s, e).map((x) => x.url);

describe('robotsFor', () => {
  it('closes the private surfaces completely', () => {
    expect(robotsFor('ai', env)).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(robotsFor('chat', env)).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('points the hub at its own sitemap and keeps APIs and account pages out', () => {
    const r = robotsFor('hub', env);
    expect(r.sitemap).toBe('https://tulzo.online/sitemap.xml');
    expect(r.rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard', '/sign-in', '/sign-up', '/profile', '/credits', '/admin'],
    });
  });

  it('gives marketplace and gigs their own sitemap', () => {
    expect(robotsFor('gigs', env).sitemap).toBe('https://gigs.tulzo.online/sitemap.xml');
    expect(robotsFor('marketplace', env).rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/api/'] });
  });

  it('in path-prefix mode also disallows the private prefixes', () => {
    const r = robotsFor(null, {});
    expect(r.sitemap).toBe('http://localhost:3000/sitemap.xml');
    expect((r.rules as { disallow: string[] }).disallow).toEqual(expect.arrayContaining(['/api/', '/dashboard', '/chat', '/ai']));
  });
});

describe('sitemapFor', () => {
  it('lists only public hub pages on the hub', () => {
    expect(urls('hub')).toEqual([
      'https://tulzo.online/',
      'https://tulzo.online/pricing',
      'https://tulzo.online/docs',
      'https://tulzo.online/legal',
    ]);
  });

  it('lists nothing for private surfaces', () => {
    expect(urls('ai')).toEqual([]);
    expect(urls('chat')).toEqual([]);
  });

  it('lists the surface home for marketplace and gigs', () => {
    expect(urls('marketplace')).toEqual(['https://marketplace.tulzo.online/']);
    expect(urls('gigs')).toEqual(['https://gigs.tulzo.online/']);
  });

  it('lists hub pages plus marketplace and gigs homes in path-prefix mode', () => {
    expect(urls(null, {})).toEqual([
      'http://localhost:3000/',
      'http://localhost:3000/pricing',
      'http://localhost:3000/docs',
      'http://localhost:3000/legal',
      'http://localhost:3000/marketplace',
      'http://localhost:3000/gigs',
    ]);
  });

  it('marks entries weekly', () => {
    expect(sitemapFor('hub', env).every((e) => e.changeFrequency === 'weekly')).toBe(true);
  });
});

describe('robotsTxt', () => {
  it('writes a private surface as a single disallow-all rule', () => {
    expect(robotsTxt('ai', env)).toBe('User-agent: *\nDisallow: /\n');
  });

  it('writes allow, every disallow and the sitemap', () => {
    expect(robotsTxt('gigs', env)).toBe(
      'User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: https://gigs.tulzo.online/sitemap.xml\n',
    );
  });
});
