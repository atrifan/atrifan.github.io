import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeSurface,
  isProtectedPath,
  resolveSurface,
  wwwRedirect,
  routeRequest,
  SURFACE_API_ALLOWLIST,
} from '@/src/lib/surface-routing';
import { surfaceUrl, type Surface } from '@/src/lib/surface-url';

const NON_HUB: Surface[] = ['ai', 'marketplace', 'gigs', 'chat'];
const route = (surface: Surface | null, pathname: string) => routeRequest({ surface, pathname, rootDomain: '' });

describe('resolveSurface', () => {
  it('returns null when TULZO_SURFACE is unset or blank', () => {
    expect(resolveSurface(undefined)).toBeNull();
    expect(resolveSurface('')).toBeNull();
    expect(resolveSurface('   ')).toBeNull();
  });

  it('accepts each surface name, ignoring case and whitespace', () => {
    expect(resolveSurface('hub')).toBe('hub');
    expect(resolveSurface('ai')).toBe('ai');
    expect(resolveSurface('marketplace')).toBe('marketplace');
    expect(resolveSurface('gigs')).toBe('gigs');
    expect(resolveSurface(' Chat ')).toBe('chat');
  });

  it('throws on an unknown surface so a misconfigured deploy fails loudly', () => {
    expect(() => resolveSurface('jobs')).toThrow(/TULZO_SURFACE/);
    expect(() => resolveSurface('hubs')).toThrow(/jobs|hubs/);
  });
});

describe('routeRequest: surface unset (path-prefix mode)', () => {
  it.each(['/', '/ai', '/ai/keys', '/marketplace', '/gigs/jobs/1', '/chat', '/dashboard', '/pricing', '/api/verify', '/api/anything'])(
    'passes %s through',
    (p) => {
      expect(route(null, p)).toEqual({ action: 'next' });
    },
  );
});

describe('routeRequest: always passes framework and well-known paths', () => {
  const always = ['/_next/static/chunks/x.js', '/__nextjs_original-stack-frame', '/.well-known/openid-configuration', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/icon.svg'];
  for (const s of ['hub', ...NON_HUB] as Surface[]) {
    it.each(always)(`${s}: %s → next`, (p) => {
      expect(route(s, p)).toEqual({ action: 'next' });
    });
  }
});

describe('routeRequest: hub', () => {
  it('serves its own pages', () => {
    for (const p of ['/', '/pricing', '/sign-in', '/sign-in/factor-one', '/sign-up', '/profile', '/credits']) {
      expect(route('hub', p)).toEqual({ action: 'next' });
    }
  });

  it('keeps every existing API route', () => {
    for (const p of ['/api/verify', '/api/plugin/report', '/api/plugin/chat/poll', '/api/chat', '/api/oauth/plugin/verify', '/api/billing/webhook', '/api/webhooks/clerk', '/api/mcp', '/api/anything/new']) {
      expect(route('hub', p)).toEqual({ action: 'next' });
    }
  });

  it('308-redirects /dashboard to the ai surface home', () => {
    expect(route('hub', '/dashboard')).toEqual({ action: 'redirect', destination: '/ai' });
    expect(route('hub', '/dashboard/')).toEqual({ action: 'redirect', destination: '/ai' });
    expect(routeRequest({ surface: 'hub', pathname: '/dashboard', rootDomain: 'tulzo.online' })).toEqual({
      action: 'redirect',
      destination: 'https://ai.tulzo.online/',
    });
  });

  it('keeps the rest of a /dashboard deep link on the ai surface', () => {
    expect(routeRequest({ surface: 'hub', pathname: '/dashboard/admin/packages', rootDomain: 'tulzo.online' })).toEqual({
      action: 'redirect',
      destination: 'https://ai.tulzo.online/admin/packages',
    });
  });

  it('does not treat a lookalike path as /dashboard', () => {
    expect(route('hub', '/dashboards')).toEqual({ action: 'next' });
  });

  it('returns 404 for other surfaces’ pages', () => {
    for (const p of ['/ai', '/ai/keys', '/marketplace', '/marketplace/x', '/gigs', '/gigs/jobs/1', '/chat', '/chat/']) {
      expect(route('hub', p)).toEqual({ action: 'notFound' });
    }
  });

  it('does not treat a lookalike path as another surface', () => {
    expect(route('hub', '/airport')).toEqual({ action: 'next' });
    expect(route('hub', '/chatter')).toEqual({ action: 'next' });
  });
});

describe('routeRequest: non-hub surfaces', () => {
  it.each(NON_HUB)('%s: rewrites / to its home', (s) => {
    expect(route(s, '/')).toEqual({ action: 'rewrite', destination: `/${s}` });
  });

  it.each(NON_HUB)('%s: rewrites its own paths under its prefix', (s) => {
    expect(route(s, '/x/y')).toEqual({ action: 'rewrite', destination: `/${s}/x/y` });
  });

  it.each(NON_HUB)('%s: redirects its own prefixed URL to the canonical one', (s) => {
    expect(route(s, `/${s}`)).toEqual({ action: 'redirect', destination: '/' });
    expect(route(s, `/${s}/x`)).toEqual({ action: 'redirect', destination: '/x' });
  });

  it.each(NON_HUB)('%s: returns 404 for other surfaces’ pages', (s) => {
    for (const other of NON_HUB.filter((o) => o !== s)) {
      expect(route(s, `/${other}`)).toEqual({ action: 'notFound' });
      expect(route(s, `/${other}/deep`)).toEqual({ action: 'notFound' });
    }
  });

  it.each(NON_HUB)('%s: returns 404 for hub-only pages', (s) => {
    for (const p of ['/pricing', '/profile', '/credits', '/dashboard', '/admin/qa', '/admin/disputes']) {
      expect(route(s, p)).toEqual({ action: 'notFound' });
    }
  });

  it.each(NON_HUB)('%s: serves sign-in locally when there is no root domain (no redirect loop)', (s) => {
    expect(route(s, '/sign-in')).toEqual({ action: 'next' });
    expect(route(s, '/sign-up/verify')).toEqual({ action: 'next' });
  });

  it.each(NON_HUB)('%s: sends sign-in and sign-up to the hub', (s) => {
    expect(routeRequest({ surface: s, pathname: '/sign-up/verify', rootDomain: 'tulzo.online' })).toEqual({
      action: 'redirect',
      destination: 'https://tulzo.online/sign-up/verify',
    });
    expect(routeRequest({ surface: s, pathname: '/sign-in', rootDomain: 'tulzo.online' })).toEqual({
      action: 'redirect',
      destination: 'https://tulzo.online/sign-in',
    });
  });

  it('chat serves the device relay API', () => {
    for (const p of ['/api/plugin/chat/poll', '/api/plugin/chat/emit', '/api/plugin/chat/send', '/api/plugin/chat/receive', '/api/plugin/chat/sessions/abc/messages']) {
      expect(route('chat', p)).toEqual({ action: 'next' });
    }
  });

  it('keeps hub-only APIs off the other surfaces', () => {
    for (const s of NON_HUB) {
      for (const p of ['/api/verify', '/api/plugin/report', '/api/chat', '/api/oauth/plugin/verify', '/api/billing/webhook', '/api/webhooks/clerk']) {
        expect(route(s, p)).toEqual({ action: 'notFound' });
      }
    }
  });

  it('ai serves the control-panel APIs, and not the chat relay', () => {
    for (const p of ['/api/keys/list', '/api/dashboard/activity', '/api/usage/stats', '/api/plugin/devices']) {
      expect(route('ai', p)).toEqual({ action: 'next' });
    }
    expect(route('ai', '/api/plugin/chat/poll')).toEqual({ action: 'notFound' });
    // The Budget tab, the catalog and the publisher stats moved to the hub and marketplace.
    for (const p of ['/api/billing/checkout', '/api/packages', '/api/marketplace/publisher']) {
      expect(route('ai', p)).toEqual({ action: 'notFound' });
    }
  });

  it('gigs serves the jobs, offers and bids APIs; Connect onboarding stays on the hub', () => {
    for (const p of ['/api/jobs', '/api/jobs/1/bids', '/api/offers', '/api/bids/1/accept']) {
      expect(route('gigs', p)).toEqual({ action: 'next' });
    }
    expect(route('gigs', '/api/connect/onboard')).toEqual({ action: 'notFound' });
    expect(route('gigs', '/api/jobsx')).toEqual({ action: 'notFound' });
  });

  it('marketplace serves the catalog APIs', () => {
    for (const p of ['/api/marketplace/discover', '/api/packages', '/api/packages/x/ratings']) {
      expect(route('marketplace', p)).toEqual({ action: 'next' });
    }
    expect(route('marketplace', '/api/keys/list')).toEqual({ action: 'notFound' });
  });

  it('matches allow-list entries on whole path segments only', () => {
    expect(route('chat', '/api/plugin/chatter')).toEqual({ action: 'notFound' });
    expect(route('chat', '/api/plugin/chat')).toEqual({ action: 'next' });
  });

  it('lists an allow-list for every surface, hub as all', () => {
    expect(SURFACE_API_ALLOWLIST.hub).toBe('all');
    expect(SURFACE_API_ALLOWLIST.chat).toContain('/api/plugin/chat');
    expect(SURFACE_API_ALLOWLIST.gigs).toEqual(['/api/jobs', '/api/offers', '/api/bids', '/api/contracts', '/api/trust']);
  });
});

describe('routeRequest: Jobs MCP and the job room API', () => {
  const ROOM_API = [
    '/api/jobs/mcp',
    '/.well-known/oauth-protected-resource/api/jobs/mcp',
    '/api/contracts',
    '/api/contracts/c1',
    '/api/contracts/c1/messages',
    '/api/contracts/c1/activity',
    '/api/contracts/c1/milestones',
    '/api/contracts/c1/progress',
    '/api/contracts/c1/qa',
    '/api/contracts/c1/steering',
    '/api/contracts/c1/steering/s1/approve',
    '/api/contracts/c1/steering/s1/reject',
    '/api/contracts/c1/steering/s1/respond',
    '/api/contracts/c1/steering/s1/topup',
    '/api/contracts/c1/versions/v1/accept',
    // Phase 5 routes under the same prefix (delivery, accept, dispute, reviews)
    '/api/contracts/c1/delivery',
  ];

  it.each(ROOM_API)('gigs serves %s', (p) => {
    expect(route('gigs', p)).toEqual({ action: 'next' });
  });

  it.each(ROOM_API)('the hub serves %s', (p) => {
    expect(route('hub', p)).toEqual({ action: 'next' });
  });

  it.each(ROOM_API)('path-prefix mode serves %s', (p) => {
    expect(route(null, p)).toEqual({ action: 'next' });
  });

  it('the other surfaces do not serve the room API', () => {
    for (const s of ['ai', 'marketplace', 'chat'] as Surface[]) {
      expect(route(s, '/api/contracts/c1/messages')).toEqual({ action: 'notFound' });
      expect(route(s, '/api/jobs/mcp')).toEqual({ action: 'notFound' });
    }
    expect(route('gigs', '/api/contractsx')).toEqual({ action: 'notFound' });
  });
});

describe('routeRequest uses surfaceUrl for cross-surface destinations', () => {
  it('matches surfaceUrl in both modes', () => {
    expect(routeRequest({ surface: 'hub', pathname: '/dashboard', rootDomain: 'x.dev' }).destination).toBe(
      surfaceUrl('ai', '/', { rootDomain: 'x.dev' }),
    );
    expect(route('hub', '/dashboard').destination).toBe(surfaceUrl('ai', '/', { rootDomain: '' }));
  });
});

describe('isProtectedPath', () => {
  it('protects /dashboard, /ai and the hub account and admin pages, and everything below them', () => {
    for (const p of ['/dashboard', '/dashboard/admin/packages', '/chat/x', '/chat/sessions/1', '/profile', '/profile/account', '/credits', '/admin', '/admin/qa', '/ai', '/ai/secrets']) {
      expect(isProtectedPath(p)).toBe(true);
    }
  });

  it('leaves the chat landing (/chat, chat. /) public: signed out it explains remote chat', () => {
    expect(isProtectedPath('/chat')).toBe(false);
    expect(isProtectedPath('/chat/')).toBe(true);
  });

  it('leaves public pages and lookalikes alone', () => {
    for (const p of ['/', '/pricing', '/docs', '/legal', '/aim', '/marketplace', '/gigs', '/sign-in', '/chatter', '/dashboards', '/api/chat', '/profiles', '/administrator', '/api/ai']) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });

  it('protects the marketplace publisher and admin pages, not the catalog or package pages', () => {
    for (const p of ['/marketplace/publish', '/marketplace/admin', '/marketplace/admin/x']) {
      expect(isProtectedPath(p)).toBe(true);
    }
    for (const p of ['/marketplace/fx-github-mcp', '/marketplace/publisher-tools', '/marketplace/administrator']) {
      expect(isProtectedPath(p)).toBe(false);
    }
  });
});

describe('activeSurface', () => {
  it('is the configured surface when set, whatever the path', () => {
    expect(activeSurface({ surface: 'gigs', pathname: '/ai' })).toBe('gigs');
  });

  it('is derived from the path prefix when unset', () => {
    expect(activeSurface({ surface: null, pathname: '/ai' })).toBe('ai');
    expect(activeSurface({ surface: null, pathname: '/marketplace/p/1' })).toBe('marketplace');
    expect(activeSurface({ surface: null, pathname: '/gigs' })).toBe('gigs');
    expect(activeSurface({ surface: null, pathname: '/chat' })).toBe('chat');
  });

  it('treats /dashboard as the ai surface in path-prefix mode', () => {
    expect(activeSurface({ surface: null, pathname: '/dashboard' })).toBe('ai');
  });

  it('is the hub for everything else', () => {
    expect(activeSurface({ surface: null, pathname: '/' })).toBe('hub');
    expect(activeSurface({ surface: null, pathname: '/pricing' })).toBe('hub');
    expect(activeSurface({ surface: null, pathname: '/airport' })).toBe('hub');
  });
});

describe('routeRequest without an explicit rootDomain', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads NEXT_PUBLIC_ROOT_DOMAIN, as middleware calls it', () => {
    vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'tulzo.test');
    expect(routeRequest({ surface: 'hub', pathname: '/dashboard' })).toEqual({
      action: 'redirect',
      destination: 'https://ai.tulzo.test/',
    });
    expect(routeRequest({ surface: 'ai', pathname: '/sign-in' })).toEqual({
      action: 'redirect',
      destination: 'https://tulzo.test/sign-in',
    });
  });
});

describe('routeRequest edge cases (from mutation testing)', () => {
  it('names the valid surfaces in the error', () => {
    expect(() => resolveSurface('x')).toThrow('expected one of hub, ai, marketplace, gigs, chat');
  });

  it('only treats root-level files as static', () => {
    expect(route('ai', '/docs/v1.2')).toEqual({ action: 'rewrite', destination: '/ai/docs/v1.2' });
    expect(route('ai', '/v1.2/notes')).toEqual({ action: 'rewrite', destination: '/ai/v1.2/notes' });
  });

  it('drops every trailing slash from a /dashboard deep link', () => {
    expect(route('hub', '/dashboard/keys//')).toEqual({ action: 'redirect', destination: '/ai/keys' });
  });
});

describe('wwwRedirect', () => {
  it('sends www.<root> to the apex, keeping path and query', () => {
    expect(wwwRedirect({ host: 'www.tulzo.online', pathAndQuery: '/pricing?x=1', rootDomain: 'tulzo.online' })).toBe(
      'https://tulzo.online/pricing?x=1',
    );
    expect(wwwRedirect({ host: 'WWW.Tulzo.Online:443', pathAndQuery: '/', rootDomain: 'tulzo.online' })).toBe('https://tulzo.online/');
  });

  it('tolerates padding and trailing slashes', () => {
    expect(wwwRedirect({ host: ' www.tulzo.online ', pathAndQuery: '/', rootDomain: ' tulzo.online/ ' })).toBe('https://tulzo.online/');
    expect(wwwRedirect({ host: 'www.tulzo.online', pathAndQuery: '/x', rootDomain: 'tulzo.online//' })).toBe('https://tulzo.online/x');
  });

  it('keeps a scheme and port given in the root domain', () => {
    expect(wwwRedirect({ host: 'www.lvh.me:3000', pathAndQuery: '/a', rootDomain: 'http://lvh.me:3000' })).toBe('http://lvh.me:3000/a');
  });

  it('leaves the apex, subdomains and other hosts alone', () => {
    for (const host of ['tulzo.online', 'ai.tulzo.online', 'www.example.com', 'wwwtulzo.online', '', null]) {
      expect(wwwRedirect({ host, pathAndQuery: '/', rootDomain: 'tulzo.online' })).toBeNull();
    }
  });

  it('does nothing without a root domain', () => {
    expect(wwwRedirect({ host: 'www.tulzo.online', pathAndQuery: '/', rootDomain: '' })).toBeNull();
    expect(wwwRedirect({ host: 'www.tulzo.online', pathAndQuery: '/', rootDomain: undefined })).toBeNull();
  });
});
