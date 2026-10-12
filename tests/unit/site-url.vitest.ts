import { describe, expect, it } from 'vitest';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';

describe('absoluteSurfaceUrl', () => {
  it('uses the surface subdomain when NEXT_PUBLIC_ROOT_DOMAIN is set and TULZO_LINKS=host', () => {
    expect(absoluteSurfaceUrl('gigs', '/jobs', { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online', TULZO_LINKS: 'host', VERCEL_URL: 'x.vercel.app' })).toBe(
      'https://gigs.tulzo.online/jobs',
    );
  });

  it('uses the apex with the surface prefix when TULZO_LINKS is path or unset', () => {
    expect(absoluteSurfaceUrl('gigs', '/jobs', { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online', VERCEL_URL: 'x.vercel.app' })).toBe(
      'https://tulzo.online/gigs/jobs',
    );
    expect(absoluteSurfaceUrl('ai', '/', { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online', TULZO_LINKS: 'path' })).toBe('https://tulzo.online/ai');
    expect(absoluteSurfaceUrl('hub', '/pricing', { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online' })).toBe('https://tulzo.online/pricing');
  });

  it('prefers the production Vercel URL, then the deployment URL, without a root domain', () => {
    expect(absoluteSurfaceUrl('ai', '/', { VERCEL_PROJECT_PRODUCTION_URL: 'tulzo.vercel.app', VERCEL_URL: 'p.vercel.app' })).toBe(
      'https://tulzo.vercel.app/ai',
    );
    expect(absoluteSurfaceUrl('hub', '/pricing', { VERCEL_URL: 'p.vercel.app' })).toBe('https://p.vercel.app/pricing');
  });

  it('falls back to localhost on PORT (default 3000)', () => {
    expect(absoluteSurfaceUrl('hub', '/', {})).toBe('http://localhost:3000/');
    expect(absoluteSurfaceUrl('marketplace', '/', { PORT: '3002' })).toBe('http://localhost:3002/marketplace');
  });
});

describe('absoluteSurfaceUrl edge cases (from mutation testing)', () => {
  it('defaults the path to /', () => {
    expect(absoluteSurfaceUrl('gigs', undefined, { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online', TULZO_LINKS: 'host' })).toBe('https://gigs.tulzo.online/');
  });

  it('keeps an http root domain absolute instead of prefixing an origin', () => {
    expect(absoluteSurfaceUrl('ai', '/x', { NEXT_PUBLIC_ROOT_DOMAIN: 'http://lvh.me:3000', TULZO_LINKS: 'host' })).toBe('http://ai.lvh.me:3000/x');
    expect(absoluteSurfaceUrl('ai', '/x', { NEXT_PUBLIC_ROOT_DOMAIN: 'http://lvh.me:3000' })).toBe('http://lvh.me:3000/ai/x');
  });

  it('still adds the origin when a relative path merely contains a URL', () => {
    expect(absoluteSurfaceUrl('hub', '/r?u=https://x', {})).toBe('http://localhost:3000/r?u=https://x');
  });
});
