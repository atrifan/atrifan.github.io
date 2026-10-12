/**
 * Per-surface request routing, used by middleware.ts. Pure: no Next imports.
 *
 * Each Vercel project sets TULZO_SURFACE to one of hub | ai | marketplace |
 * gigs | chat. Pages for a non-hub surface live under its prefix folder
 * (`app/ai/**`, later `app/(ai)/ai/**`), so:
 *
 * - Unset: path-prefix mode. Everything is served as-is; the hub is at `/`,
 *   the others at `/ai`, `/marketplace`, `/gigs`, `/chat`.
 * - hub: serves its root pages and ALL `/api/*` (the assistant device calls
 *   /api/verify, /api/plugin/*, /api/chat and /api/oauth/plugin/* here).
 *   Other surfaces' prefixes are 404. `/dashboard[/*]` 308s to the ai surface.
 * - ai | marketplace | gigs | chat: `/x` is rewritten to `/<surface>/x`, so `/`
 *   shows the surface home. `/<surface>/x` 308s to the canonical `/x`. Other
 *   surfaces' prefixes and the hub's pages are 404. `/sign-in` and `/sign-up`
 *   308 to the hub. `/api/*` is limited to SURFACE_API_ALLOWLIST.
 * - Always passed through: `/_next/*`, `/__next*`, `/.well-known/*`, and
 *   root-level files with an extension (favicon, robots.txt, sitemap.xml).
 */
import { SURFACES, SURFACE_PREFIX, surfaceUrl, type Surface } from './surface-url';

export type RouteAction = 'next' | 'rewrite' | 'redirect' | 'notFound';

export interface RouteDecision {
  action: RouteAction;
  /** Path (rewrite) or URL/path (redirect, always 308). */
  destination?: string;
}

/**
 * API path prefixes each surface serves (matched on whole segments). The hub
 * serves every API route. Extend a surface's list when one of its pages starts
 * calling a new route.
 */
export const SURFACE_API_ALLOWLIST: Readonly<Record<Surface, 'all' | readonly string[]>> = {
  hub: 'all',
  ai: [
    '/api/keys',
    '/api/dashboard',
    '/api/usage',
    '/api/plugin/devices',
    '/api/plugin/presence',
    '/api/plugin/version',
    '/api/packages',
    '/api/marketplace/publisher',
    '/api/admin/downloads',
    // The control panel's Budget tab still buys credits here until it moves to hub /credits.
    '/api/billing/checkout',
  ],
  marketplace: ['/api/marketplace', '/api/packages', '/api/admin/downloads'],
  // Stripe Connect onboarding (/api/connect) and the billing webhook stay on the hub.
  gigs: ['/api/jobs', '/api/offers', '/api/bids'],
  chat: ['/api/plugin/chat', '/api/plugin/devices', '/api/plugin/presence'],
};

/** Pages that require a signed-in user. */
const PROTECTED_PREFIXES = ['/dashboard', '/chat', '/profile', '/credits', '/admin'];

/** Hub pages that live on the hub only; 404 elsewhere. */
const HUB_ONLY_PREFIXES = ['/dashboard', '/pricing', '/profile', '/credits', '/admin/qa'];

/** Auth pages; on non-hub surfaces they redirect to the hub. */
const AUTH_PREFIXES = ['/sign-in', '/sign-up'];

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function prefixOwner(pathname: string): Surface | null {
  for (const s of SURFACES) {
    const prefix = SURFACE_PREFIX[s];
    if (prefix && underPrefix(pathname, prefix)) return s;
  }
  return null;
}

/** Strip `prefix` from `pathname`, keeping a leading slash. */
function stripPrefix(pathname: string, prefix: string): string {
  return pathname.slice(prefix.length) || '/';
}

/**
 * Parse TULZO_SURFACE. Unset/blank gives null (path-prefix mode). An unknown
 * value throws: a typo in a project's env should fail loudly, not serve the
 * wrong routes.
 */
export function resolveSurface(value: string | undefined): Surface | null {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return null;
  if ((SURFACES as readonly string[]).includes(v)) return v as Surface;
  throw new Error(`Invalid TULZO_SURFACE "${value}"; expected one of ${SURFACES.join(', ')}`);
}

export interface RouteInput {
  surface: Surface | null;
  pathname: string;
  /** Passed to surfaceUrl for cross-surface redirects. */
  rootDomain?: string;
}

export function routeRequest({ surface, pathname, rootDomain }: RouteInput): RouteDecision {
  const next: RouteDecision = { action: 'next' };
  if (surface === null) return next;
  if (pathname.startsWith('/_next') || pathname.startsWith('/__next') || underPrefix(pathname, '/.well-known')) {
    return next;
  }

  // Omitted rootDomain means "read NEXT_PUBLIC_ROOT_DOMAIN" (surfaceUrl's default).
  const url = (s: Surface, p: string) => surfaceUrl(s, p, rootDomain === undefined ? undefined : { rootDomain });

  if (underPrefix(pathname, '/api')) {
    const allow = SURFACE_API_ALLOWLIST[surface];
    if (allow === 'all' || allow.some((p) => underPrefix(pathname, p))) return next;
    return { action: 'notFound' };
  }

  // Root-level static files (favicon.ico, robots.txt, icon.svg, …).
  if (/^\/[^/]+\.[a-z0-9]+$/i.test(pathname)) return next;

  if (surface === 'hub') {
    if (underPrefix(pathname, '/dashboard')) {
      const rest = stripPrefix(pathname, '/dashboard').replace(/\/+$/, '') || '/';
      return { action: 'redirect', destination: url('ai', rest) };
    }
    if (prefixOwner(pathname) !== null) return { action: 'notFound' };
    return next;
  }

  const own = SURFACE_PREFIX[surface];
  if (AUTH_PREFIXES.some((p) => underPrefix(pathname, p))) {
    const hub = url('hub', pathname);
    // Without a root domain the hub URL is this same path: serve it here instead of looping.
    return hub === pathname ? next : { action: 'redirect', destination: hub };
  }
  if (underPrefix(pathname, own)) {
    return { action: 'redirect', destination: stripPrefix(pathname, own) };
  }
  if (prefixOwner(pathname) !== null || HUB_ONLY_PREFIXES.some((p) => underPrefix(pathname, p))) {
    return { action: 'notFound' };
  }
  return { action: 'rewrite', destination: pathname === '/' ? own : own + pathname };
}

/** True for paths that need a signed-in user. Pass the rewritten path, if any. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => underPrefix(pathname, p));
}

/** Which surface a page belongs to, for highlighting the nav. */
export function activeSurface({ surface, pathname }: { surface: Surface | null; pathname: string }): Surface {
  if (surface) return surface;
  if (underPrefix(pathname, '/dashboard')) return 'ai';
  return prefixOwner(pathname) ?? 'hub';
}

/**
 * `www.<root>` → the apex (the hub lives at the root domain). Returns the redirect URL
 * (middleware answers 308), or null for any other host or without a root domain.
 */
export function wwwRedirect({
  host,
  pathAndQuery,
  rootDomain,
}: {
  host: string | null | undefined;
  pathAndQuery: string;
  rootDomain: string | undefined;
}): string | null {
  const root = (rootDomain ?? '').trim().replace(/\/+$/, '');
  if (!root || !host) return null;
  const scheme = /^https?:\/\//.exec(root)?.[0];
  const apex = (scheme ? root.slice(scheme.length) : root).toLowerCase();
  const apexHost = apex.replace(/:\d+$/, '');
  const reqHost = host.trim().toLowerCase().replace(/:\d+$/, '');
  if (reqHost !== `www.${apexHost}`) return null;
  return surfaceUrl('hub', pathAndQuery, { rootDomain: root });
}
