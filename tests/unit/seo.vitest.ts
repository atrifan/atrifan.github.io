import { describe, expect, it } from 'vitest';
import { robotsFor, robotsTxt, seoEnv, sitemapFor } from '@/src/lib/seo';

const env = { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online' };
const urls = (s: Parameters<typeof sitemapFor>[0], e: Record<string, string> = env) => sitemapFor(s, e).map((x) => x.url);

describe('robotsFor', () => {
  it('closes ai. completely', () => {
    expect(robotsFor('ai', env)).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });

  it('opens chat. for its public landing, with its own sitemap', () => {
    expect(robotsFor('chat', env)).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
      sitemap: 'https://chat.tulzo.online/sitemap.xml',
    });
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
    const disallow = (r.rules as { disallow: string[] }).disallow;
    expect(disallow).toEqual(expect.arrayContaining(['/api/', '/dashboard', '/ai']));
    expect(disallow).not.toContain('/chat');
  });
});

describe('sitemapFor', () => {
  it('lists only public hub pages on the hub', () => {
    expect(urls('hub')).toEqual([
      'https://tulzo.online/',
      'https://tulzo.online/pricing',
      'https://tulzo.online/docs',
      'https://tulzo.online/legal',
      'https://tulzo.online/legal/terms',
      'https://tulzo.online/legal/payments',
      'https://tulzo.online/legal/disclaimers',
      'https://tulzo.online/legal/acceptable-use',
      'https://tulzo.online/legal/marketplace-publishers',
      'https://tulzo.online/legal/complaints',
      'https://tulzo.online/legal/imprint',
    ]);
  });

  it('lists nothing for ai., and the landing for chat.', () => {
    expect(urls('ai')).toEqual([]);
    expect(urls('chat')).toEqual(['https://chat.tulzo.online/']);
  });

  it('lists the surface home for marketplace and gigs', () => {
    expect(urls('marketplace')).toEqual(['https://marketplace.tulzo.online/']);
    expect(urls('gigs')).toEqual(['https://gigs.tulzo.online/']);
  });

  it('lists hub pages plus the marketplace, gigs and chat homes in path-prefix mode', () => {
    expect(urls(null, {})).toEqual([
      'http://localhost:3000/',
      'http://localhost:3000/pricing',
      'http://localhost:3000/docs',
      'http://localhost:3000/legal',
      'http://localhost:3000/legal/terms',
      'http://localhost:3000/legal/payments',
      'http://localhost:3000/legal/disclaimers',
      'http://localhost:3000/legal/acceptable-use',
      'http://localhost:3000/legal/marketplace-publishers',
      'http://localhost:3000/legal/complaints',
      'http://localhost:3000/legal/imprint',
      'http://localhost:3000/marketplace',
      'http://localhost:3000/gigs',
      'http://localhost:3000/chat',
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

describe('robots and sitemap per host (hybrid routing)', () => {
  const root = { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.test' };

  it('a surface subdomain describes itself on its own host, even with path links', () => {
    expect(robotsFor('marketplace', { ...root, TULZO_LINKS: 'path' }).sitemap).toBe('https://marketplace.tulzo.test/sitemap.xml');
    expect(urls('gigs', { ...root, TULZO_LINKS: 'path' })).toEqual(['https://gigs.tulzo.test/']);
    expect(urls('chat', root)).toEqual(['https://chat.tulzo.test/']);
  });

  it('path mode on the apex: one sitemap on the apex covering every prefix, with path links', () => {
    expect(robotsFor(null, root).sitemap).toBe('https://tulzo.test/sitemap.xml');
    expect(urls(null, root)).toEqual(expect.arrayContaining(['https://tulzo.test/', 'https://tulzo.test/pricing', 'https://tulzo.test/marketplace', 'https://tulzo.test/gigs', 'https://tulzo.test/chat']));
    expect(urls(null, root).every((u) => u.startsWith('https://tulzo.test/'))).toBe(true);
  });

  it('path mode with host links lists each surface home on its subdomain', () => {
    expect(urls(null, { ...root, TULZO_LINKS: 'host' })).toEqual(
      expect.arrayContaining(['https://tulzo.test/', 'https://marketplace.tulzo.test/', 'https://gigs.tulzo.test/', 'https://chat.tulzo.test/']),
    );
  });

  it('seoEnv forces host links for a single surface and leaves path mode alone', () => {
    expect(seoEnv('gigs', { ...root, TULZO_LINKS: 'path', PORT: '1' })).toEqual({ ...root, TULZO_LINKS: 'host', PORT: '1' });
    const env = { ...root, TULZO_LINKS: 'path' };
    expect(seoEnv(null, env)).toBe(env);
  });
});
