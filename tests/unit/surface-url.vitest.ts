import { describe, expect, it } from 'vitest';
import { SURFACES, SURFACE_PREFIX, surfaceUrl } from '@/src/lib/surface-url';

describe('SURFACES', () => {
  it('lists the five surfaces, hub first', () => {
    expect(SURFACES).toEqual(['hub', 'ai', 'marketplace', 'gigs', 'chat']);
  });

  it('gives every non-hub surface a path prefix and the hub none', () => {
    expect(SURFACE_PREFIX).toEqual({ hub: '', ai: '/ai', marketplace: '/marketplace', gigs: '/gigs', chat: '/chat' });
  });
});

describe('surfaceUrl with NEXT_PUBLIC_ROOT_DOMAIN set', () => {
  const rootDomain = 'tulzo.online';

  it('puts the hub on the root domain over https', () => {
    expect(surfaceUrl('hub', '/', { rootDomain })).toBe('https://tulzo.online/');
    expect(surfaceUrl('hub', '/credits', { rootDomain })).toBe('https://tulzo.online/credits');
  });

  it('puts every other surface on its subdomain', () => {
    expect(surfaceUrl('ai', '/', { rootDomain })).toBe('https://ai.tulzo.online/');
    expect(surfaceUrl('marketplace', '/p/x', { rootDomain })).toBe('https://marketplace.tulzo.online/p/x');
    expect(surfaceUrl('gigs', '/jobs/1', { rootDomain })).toBe('https://gigs.tulzo.online/jobs/1');
    expect(surfaceUrl('chat', '/', { rootDomain })).toBe('https://chat.tulzo.online/');
  });

  it('defaults the path to /', () => {
    expect(surfaceUrl('ai', undefined, { rootDomain })).toBe('https://ai.tulzo.online/');
  });

  it('adds a missing leading slash and keeps query and hash', () => {
    expect(surfaceUrl('gigs', 'jobs?q=1#top', { rootDomain })).toBe('https://gigs.tulzo.online/jobs?q=1#top');
  });

  it('keeps an explicit scheme and port on the root domain', () => {
    expect(surfaceUrl('ai', '/x', { rootDomain: 'http://lvh.me:3000' })).toBe('http://ai.lvh.me:3000/x');
    expect(surfaceUrl('hub', '/x', { rootDomain: 'http://lvh.me:3000' })).toBe('http://lvh.me:3000/x');
  });

  it('ignores surrounding whitespace and a trailing slash on the root domain', () => {
    expect(surfaceUrl('ai', '/', { rootDomain: ' tulzo.online/ ' })).toBe('https://ai.tulzo.online/');
  });
});

describe('surfaceUrl with no root domain (path-prefix mode)', () => {
  const rootDomain = '';

  it('keeps hub paths at the root', () => {
    expect(surfaceUrl('hub', '/', { rootDomain })).toBe('/');
    expect(surfaceUrl('hub', '/profile', { rootDomain })).toBe('/profile');
  });

  it('prefixes other surfaces, without a trailing slash for their home', () => {
    expect(surfaceUrl('ai', '/', { rootDomain })).toBe('/ai');
    expect(surfaceUrl('marketplace', '/', { rootDomain })).toBe('/marketplace');
    expect(surfaceUrl('gigs', '/jobs/1', { rootDomain })).toBe('/gigs/jobs/1');
    expect(surfaceUrl('chat', '/', { rootDomain })).toBe('/chat');
  });

  it('keeps a query on a surface home', () => {
    expect(surfaceUrl('ai', '/?tab=keys', { rootDomain })).toBe('/ai?tab=keys');
    expect(surfaceUrl('ai', '?tab=keys', { rootDomain })).toBe('/ai?tab=keys');
  });

  it('treats an undefined root domain like an empty one', () => {
    expect(surfaceUrl('gigs', '/', { rootDomain: undefined })).toBe('/gigs');
  });
});

describe('surfaceUrl edge cases (from mutation testing)', () => {
  it('drops several trailing slashes from the root domain', () => {
    expect(surfaceUrl('ai', '/', { rootDomain: 'tulzo.online//' })).toBe('https://ai.tulzo.online/');
  });

  it('keeps a trailing slash on a non-home path in path-prefix mode', () => {
    expect(surfaceUrl('ai', '/keys/', { rootDomain: '' })).toBe('/ai/keys/');
  });
});
