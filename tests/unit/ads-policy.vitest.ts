import { describe, expect, it } from 'vitest';
import { footerAdAllowed } from '@/src/lib/ads-policy';

const ok = (surface: Parameters<typeof footerAdAllowed>[0]['surface'], pathname: string, signedIn = false) =>
  footerAdAllowed({ surface, pathname, signedIn });

describe('footerAdAllowed', () => {
  it('allows the hub landing and docs for signed-out users', () => {
    expect(ok('hub', '/')).toBe(true);
    expect(ok('hub', '/docs')).toBe(true);
    expect(ok('hub', '/docs/getting-started')).toBe(true);
  });

  it('never shows ads to signed-in users', () => {
    expect(ok('hub', '/', true)).toBe(false);
    expect(ok('marketplace', '/marketplace', true)).toBe(false);
    expect(ok('gigs', '/gigs', true)).toBe(false);
  });

  it('keeps ads off other hub pages', () => {
    for (const p of ['/pricing', '/profile', '/credits', '/sign-in', '/sign-up', '/dashboard', '/docsx']) {
      expect(ok('hub', p)).toBe(false);
    }
  });

  it('never shows ads on ai. or chat.', () => {
    for (const p of ['/', '/ai', '/ai/keys', '/chat']) {
      expect(ok('ai', p)).toBe(false);
      expect(ok('chat', p)).toBe(false);
    }
  });

  it('allows marketplace browsing, in both URL forms, but not admin', () => {
    expect(ok('marketplace', '/marketplace')).toBe(true);
    expect(ok('marketplace', '/marketplace/p/weather')).toBe(true);
    expect(ok('marketplace', '/')).toBe(true);
    expect(ok('marketplace', '/p/weather')).toBe(true);
    expect(ok('marketplace', '/marketplace/admin')).toBe(false);
    expect(ok('marketplace', '/admin/queue')).toBe(false);
    expect(ok('marketplace', '/marketplace/publish')).toBe(false);
    expect(ok('marketplace', '/publish')).toBe(false);
  });

  it('allows the gigs listing and detail, not post, checkout or job rooms', () => {
    expect(ok('gigs', '/gigs')).toBe(true);
    expect(ok('gigs', '/gigs/jobs/42')).toBe(true);
    expect(ok('gigs', '/jobs/42')).toBe(true);
    for (const p of ['/gigs/post', '/post', '/gigs/jobs/42/room', '/jobs/42/room/messages', '/gigs/contracts/1/checkout', '/checkout']) {
      expect(ok('gigs', p)).toBe(false);
    }
  });

  it('allows the public gigs docs, never contracts, the offer form or the admin docs', () => {
    expect(ok('gigs', '/gigs/docs/mcp')).toBe(true);
    expect(ok('gigs', '/docs/mcp')).toBe(true);
    for (const p of ['/gigs/contracts/1', '/contracts/1', '/gigs/offers/new', '/offers/new', '/gigs/docs/admin-qa', '/docs/admin-qa']) {
      expect(ok('gigs', p), p).toBe(false);
    }
  });
});
