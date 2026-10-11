import { describe, expect, it } from 'vitest';
import { absoluteSurfaceUrl } from '@/src/lib/site-url';

describe('absoluteSurfaceUrl', () => {
  it('uses the surface domain when NEXT_PUBLIC_ROOT_DOMAIN is set', () => {
    expect(absoluteSurfaceUrl('gigs', '/jobs', { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online', VERCEL_URL: 'x.vercel.app' })).toBe(
      'https://gigs.tulzo.online/jobs',
    );
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
