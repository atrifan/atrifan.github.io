import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SURFACE_HEADER,
  requestHost,
  resolveLinkMode,
  resolveRequestSurface,
  resolveRoutingMode,
  routeRequest,
  surfaceFromHeader,
  surfaceFromHost,
  withSurfaceHeader,
} from '@/src/lib/surface-routing';
import { linkMode, surfaceUrl } from '@/src/lib/surface-url';

/**
 * Hybrid routing: one deploy serves the apex, vercel.app and localhost by path, and each surface
 * subdomain at its root. See .claude/rules/surfaces-and-design.md.
 */

const ROOT = 'tulzo.online';

describe('surfaceFromHost', () => {
  it('maps each surface subdomain to its surface', () => {
    expect(surfaceFromHost('ai.tulzo.online', ROOT)).toBe('ai');
    expect(surfaceFromHost('marketplace.tulzo.online', ROOT)).toBe('marketplace');
    expect(surfaceFromHost('gigs.tulzo.online', ROOT)).toBe('gigs');
    expect(surfaceFromHost('chat.tulzo.online', ROOT)).toBe('chat');
  });

  it('keeps the apex in path mode (it serves every surface by prefix)', () => {
    expect(surfaceFromHost('tulzo.online', ROOT)).toBeNull();
  });

  it('never maps the hub to a subdomain', () => {
    expect(surfaceFromHost('hub.tulzo.online', ROOT)).toBeNull();
  });

  it('sends jobs. to gigs. with the same path and query (308 in middleware)', () => {
    expect(surfaceFromHost('jobs.tulzo.online', ROOT, '/jobs/1?a=b')).toEqual({ redirect: 'https://gigs.tulzo.online/jobs/1?a=b' });
    expect(surfaceFromHost('jobs.tulzo.online', ROOT)).toEqual({ redirect: 'https://gigs.tulzo.online/' });
  });

  it('sends www. to the apex, as wwwRedirect does', () => {
    expect(surfaceFromHost('www.tulzo.online', ROOT, '/pricing?x=1')).toEqual({ redirect: 'https://tulzo.online/pricing?x=1' });
  });

  it('ignores case, the port and a trailing dot', () => {
    expect(surfaceFromHost('AI.Tulzo.Online', ROOT)).toBe('ai');
    expect(surfaceFromHost('gigs.tulzo.online:443', ROOT)).toBe('gigs');
    expect(surfaceFromHost('chat.tulzo.online.', ROOT)).toBe('chat');
    expect(surfaceFromHost(' Marketplace.TULZO.online.:3003 ', ROOT)).toBe('marketplace');
    expect(surfaceFromHost('JOBS.tulzo.online.:8080', ROOT, '/x')).toEqual({ redirect: 'https://gigs.tulzo.online/x' });
  });

  it('normalizes the root domain too (case, scheme, port, trailing slash or dot)', () => {
    expect(surfaceFromHost('ai.tulzo.online', ' Tulzo.Online/ ')).toBe('ai');
    expect(surfaceFromHost('ai.tulzo.online', 'tulzo.online.')).toBe('ai');
    expect(surfaceFromHost('ai.lvh.me:3000', 'http://lvh.me:3000')).toBe('ai');
  });

  it('keeps a scheme and port of the root domain on the jobs. redirect', () => {
    expect(surfaceFromHost('jobs.lvh.me:3000', 'http://lvh.me:3000', '/x')).toEqual({ redirect: 'http://gigs.lvh.me:3000/x' });
  });

  it('gives null (path mode) for unknown subdomains, other hosts, localhost and vercel.app', () => {
    for (const host of [
      'foo.tulzo.online',
      'x.ai.tulzo.online',
      'aitulzo.online',
      'ai.tulzo.online.evil.test',
      'tulzo.online.evil.test',
      'ai-tulzo.online',
      'localhost',
      'localhost:3000',
      '127.0.0.1:3000',
      'tulzo.vercel.app',
      'tulzo-git-main-acme.vercel.app',
      'ai.vercel.app',
    ]) {
      expect(surfaceFromHost(host, ROOT), host).toBeNull();
    }
  });

  it('gives null without a host or a root domain', () => {
    expect(surfaceFromHost(null, ROOT)).toBeNull();
    expect(surfaceFromHost(undefined, ROOT)).toBeNull();
    expect(surfaceFromHost('', ROOT)).toBeNull();
    expect(surfaceFromHost('ai.tulzo.online', '')).toBeNull();
    expect(surfaceFromHost('ai.tulzo.online', undefined)).toBeNull();
    expect(surfaceFromHost('jobs.tulzo.online', '  ')).toBeNull();
  });
});

describe('requestHost', () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it('reads the Host header', () => {
    expect(requestHost(h({ host: 'ai.tulzo.online' }))).toBe('ai.tulzo.online');
  });

  it('falls back to x-forwarded-host without a Host header', () => {
    expect(requestHost(h({ 'x-forwarded-host': 'gigs.tulzo.online' }))).toBe('gigs.tulzo.online');
  });

  it('ignores a spoofed x-forwarded-host when Host is present', () => {
    expect(requestHost(h({ host: 'tulzo.online', 'x-forwarded-host': 'ai.tulzo.online' }))).toBe('tulzo.online');
  });

  it('takes the first value of a list-valued x-forwarded-host', () => {
    expect(requestHost(h({ 'x-forwarded-host': 'chat.tulzo.online, proxy.internal' }))).toBe('chat.tulzo.online');
  });

  it('treats a blank Host as missing, and gives null with neither', () => {
    expect(requestHost(h({ host: '  ', 'x-forwarded-host': 'ai.tulzo.online' }))).toBe('ai.tulzo.online');
    expect(requestHost(h({}))).toBeNull();
    expect(requestHost(h({ 'x-forwarded-host': ' ' }))).toBeNull();
  });
});

describe('resolveRoutingMode (TULZO_ROUTING)', () => {
  it('defaults to path', () => {
    expect(resolveRoutingMode(undefined)).toBe('path');
    expect(resolveRoutingMode('')).toBe('path');
    expect(resolveRoutingMode('  ')).toBe('path');
  });

  it('accepts path and hybrid, ignoring case and spaces', () => {
    expect(resolveRoutingMode('path')).toBe('path');
    expect(resolveRoutingMode(' Hybrid ')).toBe('hybrid');
  });

  it('throws on anything else, naming the variable', () => {
    expect(() => resolveRoutingMode('host')).toThrow(/TULZO_ROUTING/);
    expect(() => resolveRoutingMode('hybird')).toThrow(/path, hybrid/);
  });
});

describe('resolveLinkMode (TULZO_LINKS)', () => {
  it('defaults to path, accepts path and host', () => {
    expect(resolveLinkMode(undefined)).toBe('path');
    expect(resolveLinkMode('')).toBe('path');
    expect(resolveLinkMode('path')).toBe('path');
    expect(resolveLinkMode(' HOST ')).toBe('host');
  });

  it('throws on anything else', () => {
    expect(() => resolveLinkMode('subdomain')).toThrow(/TULZO_LINKS/);
  });

  it('the lenient linkMode() used by surfaceUrl reads only an exact host as host', () => {
    expect(linkMode('host')).toBe('host');
    expect(linkMode(' Host ')).toBe('host');
    expect(linkMode(undefined)).toBe('path');
    expect(linkMode('hosts')).toBe('path');
  });
});

describe('resolveRequestSurface (the mode switch)', () => {
  const base = { rootDomain: ROOT, pathAndQuery: '/x?y=1' };

  it('path mode: every host is path mode', () => {
    for (const host of ['tulzo.online', 'ai.tulzo.online', 'gigs.tulzo.online', 'localhost:3000', 'tulzo.vercel.app']) {
      expect(resolveRequestSurface({ ...base, mode: 'path', override: null, host }), host).toEqual({ surface: null });
    }
  });

  it('path mode still sends www. to the apex', () => {
    expect(resolveRequestSurface({ ...base, mode: 'path', override: null, host: 'www.tulzo.online' })).toEqual({
      redirect: 'https://tulzo.online/x?y=1',
    });
  });

  it('path mode leaves jobs. alone (vercel.json redirects it)', () => {
    expect(resolveRequestSurface({ ...base, mode: 'path', override: null, host: 'jobs.tulzo.online' })).toEqual({ surface: null });
  });

  it('hybrid: the surface comes from the host', () => {
    const at = (host: string) => resolveRequestSurface({ ...base, mode: 'hybrid', override: null, host });
    expect(at('ai.tulzo.online')).toEqual({ surface: 'ai' });
    expect(at('marketplace.tulzo.online')).toEqual({ surface: 'marketplace' });
    expect(at('tulzo.online')).toEqual({ surface: null });
    expect(at('tulzo.vercel.app')).toEqual({ surface: null });
    expect(at('localhost:3000')).toEqual({ surface: null });
    expect(at('jobs.tulzo.online')).toEqual({ redirect: 'https://gigs.tulzo.online/x?y=1' });
    expect(at('www.tulzo.online')).toEqual({ redirect: 'https://tulzo.online/x?y=1' });
  });

  it('hybrid without a root domain is path mode', () => {
    expect(resolveRequestSurface({ mode: 'hybrid', override: null, host: 'ai.tulzo.online', rootDomain: undefined, pathAndQuery: '/' })).toEqual({
      surface: null,
    });
  });

  it('TULZO_SURFACE wins over both modes', () => {
    for (const mode of ['path', 'hybrid'] as const) {
      expect(resolveRequestSurface({ ...base, mode, override: 'ai', host: 'gigs.tulzo.online' })).toEqual({ surface: 'ai' });
      expect(resolveRequestSurface({ ...base, mode, override: 'hub', host: 'localhost:3002' })).toEqual({ surface: 'hub' });
      // The override does not turn jobs. into a redirect, but www. still goes to the apex.
      expect(resolveRequestSurface({ ...base, mode, override: 'gigs', host: 'jobs.tulzo.online' })).toEqual({ surface: 'gigs' });
      expect(resolveRequestSurface({ ...base, mode, override: 'hub', host: 'www.tulzo.online' })).toEqual({
        redirect: 'https://tulzo.online/x?y=1',
      });
    }
  });
});

describe('the x-tulzo-surface request header', () => {
  it('is named x-tulzo-surface', () => {
    expect(SURFACE_HEADER).toBe('x-tulzo-surface');
  });

  it('withSurfaceHeader replaces a client-sent value with the resolved surface', () => {
    const incoming = new Headers({ 'x-tulzo-surface': 'ai', cookie: 'a=1', host: 'tulzo.online' });
    const out = withSurfaceHeader(incoming, 'marketplace');
    expect(out.get('x-tulzo-surface')).toBe('marketplace');
    expect(out.get('cookie')).toBe('a=1');
    expect(out.get('host')).toBe('tulzo.online');
    // The incoming headers are not mutated.
    expect(incoming.get('x-tulzo-surface')).toBe('ai');
  });

  it('path mode is sent as "path", so a spoofed surface never survives', () => {
    const out = withSurfaceHeader(new Headers({ 'X-Tulzo-Surface': 'gigs' }), null);
    expect(out.get('x-tulzo-surface')).toBe('path');
    expect([...out.keys()].filter((k) => k === 'x-tulzo-surface')).toHaveLength(1);
  });

  it('a duplicated client header is collapsed to the one resolved value', () => {
    const incoming = new Headers();
    incoming.append('x-tulzo-surface', 'ai');
    incoming.append('x-tulzo-surface', 'chat');
    expect(withSurfaceHeader(incoming, 'gigs').get('x-tulzo-surface')).toBe('gigs');
  });

  it('surfaceFromHeader reads what the middleware wrote', () => {
    expect(surfaceFromHeader('ai')).toBe('ai');
    expect(surfaceFromHeader('hub')).toBe('hub');
    expect(surfaceFromHeader('path')).toBeNull();
  });

  it('surfaceFromHeader gives undefined (not set by middleware) for a missing or unknown value', () => {
    expect(surfaceFromHeader(null)).toBeUndefined();
    expect(surfaceFromHeader(undefined)).toBeUndefined();
    expect(surfaceFromHeader('')).toBeUndefined();
    expect(surfaceFromHeader('AI')).toBeUndefined();
    expect(surfaceFromHeader('ai, gigs')).toBeUndefined();
  });
});

describe('surfaceUrl link modes (TULZO_LINKS)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('path links keep every surface on the apex, under its prefix', () => {
    const o = { rootDomain: ROOT, links: 'path' as const };
    expect(surfaceUrl('hub', '/', o)).toBe('https://tulzo.online/');
    expect(surfaceUrl('hub', '/credits', o)).toBe('https://tulzo.online/credits');
    expect(surfaceUrl('ai', '/', o)).toBe('https://tulzo.online/ai');
    expect(surfaceUrl('ai', '/usage', o)).toBe('https://tulzo.online/ai/usage');
    expect(surfaceUrl('marketplace', '/?q=x', o)).toBe('https://tulzo.online/marketplace?q=x');
    expect(surfaceUrl('gigs', 'jobs/1#top', o)).toBe('https://tulzo.online/gigs/jobs/1#top');
    expect(surfaceUrl('chat', '/', o)).toBe('https://tulzo.online/chat');
  });

  it('path links keep an explicit scheme and port', () => {
    expect(surfaceUrl('gigs', '/x', { rootDomain: 'http://lvh.me:3000', links: 'path' })).toBe('http://lvh.me:3000/gigs/x');
  });

  it('host links put each surface on its subdomain', () => {
    const o = { rootDomain: ROOT, links: 'host' as const };
    expect(surfaceUrl('ai', '/usage', o)).toBe('https://ai.tulzo.online/usage');
    expect(surfaceUrl('hub', '/credits', o)).toBe('https://tulzo.online/credits');
  });

  it('reads TULZO_LINKS when links is not passed, defaulting to path', () => {
    expect(surfaceUrl('ai', '/usage', { rootDomain: ROOT })).toBe('https://tulzo.online/ai/usage');
    vi.stubEnv('TULZO_LINKS', 'host');
    expect(surfaceUrl('ai', '/usage', { rootDomain: ROOT })).toBe('https://ai.tulzo.online/usage');
    vi.stubEnv('TULZO_LINKS', 'path');
    expect(surfaceUrl('ai', '/usage', { rootDomain: ROOT })).toBe('https://tulzo.online/ai/usage');
  });

  it('without a root domain both link modes give a relative prefixed path', () => {
    expect(surfaceUrl('ai', '/usage', { rootDomain: '', links: 'host' })).toBe('/ai/usage');
    expect(surfaceUrl('ai', '/usage', { rootDomain: '', links: 'path' })).toBe('/ai/usage');
  });

  it('does not depend on TULZO_SURFACE', () => {
    vi.stubEnv('TULZO_SURFACE', 'ai');
    expect(surfaceUrl('ai', '/usage', { rootDomain: ROOT, links: 'path' })).toBe('https://tulzo.online/ai/usage');
    expect(surfaceUrl('ai', '/usage', { rootDomain: ROOT, links: 'host' })).toBe('https://ai.tulzo.online/usage');
  });
});

describe('edge cases (from mutation testing)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('requestHost trims a blank Host from any header source, and the first x-forwarded-host value', () => {
    const raw = (init: Record<string, string>) => ({ get: (n: string) => init[n] ?? null });
    expect(requestHost(raw({ host: '  ', 'x-forwarded-host': 'ai.tulzo.online' }))).toBe('ai.tulzo.online');
    expect(requestHost(raw({ host: ' gigs.tulzo.online ' }))).toBe('gigs.tulzo.online');
    expect(requestHost(raw({ 'x-forwarded-host': 'chat.tulzo.online , proxy.internal' }))).toBe('chat.tulzo.online');
  });

  it('routeRequest passes links through even without a rootDomain', () => {
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'tulzo.test');
    expect(routeRequest({ surface: 'hub', pathname: '/dashboard', links: 'host' }).destination).toBe('https://ai.tulzo.test/');
    expect(routeRequest({ surface: 'hub', pathname: '/dashboard', links: 'path' }).destination).toBe('https://tulzo.test/ai');
  });

  it('surfaceUrl with no options reads both env vars', () => {
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'tulzo.test');
    vi.stubEnv('TULZO_LINKS', 'host');
    expect(surfaceUrl('chat', '/x')).toBe('https://chat.tulzo.test/x');
    vi.stubEnv('TULZO_LINKS', '');
    expect(surfaceUrl('chat', '/x')).toBe('https://tulzo.test/chat/x');
  });

  it('a root domain with a path or trailing slashes still matches its hosts', () => {
    expect(surfaceFromHost('ai.tulzo.online', 'tulzo.online//')).toBe('ai');
    expect(surfaceFromHost('ai.tulzo.online', 'https://tulzo.online/x/y')).toBe('ai');
    expect(surfaceFromHost('www.tulzo.online', 'tulzo.online/', '/a')).toEqual({ redirect: 'https://tulzo.online/a' });
  });
});
