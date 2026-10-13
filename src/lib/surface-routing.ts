/**
 * Per-request surface routing, used by middleware.ts. Pure: no Next imports.
 *
 * One deploy serves every surface. middleware.ts picks the surface of each request with
 * resolveRequestSurface(): TULZO_SURFACE (test servers) forces one; otherwise
 * TULZO_ROUTING=path (default) is path-prefix mode on every host, and TULZO_ROUTING=hybrid
 * reads it from the Host (surfaceFromHost): `<surface>.<root>` is that surface, the apex,
 * vercel.app and localhost stay in path-prefix mode. Pages for a non-hub surface live under
 * its prefix folder (`app/(ai)/ai/**`), and routeRequest() maps the path:
 *
 * - null: path-prefix mode. Everything is served as-is; the hub is at `/`,
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
import { SURFACES, SURFACE_PREFIX, surfaceUrl, type LinkMode, type Surface } from './surface-url';

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
  ],
  marketplace: ['/api/marketplace', '/api/packages', '/api/admin/downloads'],
  // Stripe Connect onboarding (/api/connect) and the billing webhook stay on the hub.
  // /api/contracts: the job room and delivery; /api/trust: badges on the public cards.
  // /api/activity/gigs: the My activity ledger.
  gigs: ['/api/jobs', '/api/offers', '/api/bids', '/api/contracts', '/api/trust', '/api/activity/gigs'],
  chat: ['/api/plugin/chat', '/api/plugin/devices', '/api/plugin/presence'],
};

/**
 * Exact API paths every surface serves: the header bell's feed (the AppShell is on every page).
 * Exact, not prefixes, so /api/notifications/{dispatch,preferences,unsubscribe} stay on the hub.
 */
export const SHARED_API_PATHS: readonly string[] = ['/api/notifications', '/api/notifications/read', '/api/notifications/unread-count'];

/** Pages that require a signed-in user. `/ai` is the control panel (rewritten from ai. `/x`). */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/ai',
  '/profile',
  '/credits',
  '/admin',
  '/notifications',
  '/marketplace/publish',
  '/marketplace/publisher',
  '/marketplace/admin',
];

/** Public at the prefix itself (the signed-out chat landing), signed-in below it. */
const PROTECTED_BELOW = ['/chat'];

/** Hub pages that live on the hub only; 404 elsewhere. */
const HUB_ONLY_PREFIXES = ['/dashboard', '/pricing', '/profile', '/credits', '/notifications', '/admin/qa', '/admin/disputes', '/admin/activity', '/admin/inbox', '/admin/complaints'];

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
  /** Passed to surfaceUrl (default: TULZO_LINKS). */
  links?: LinkMode;
}

export function routeRequest({ surface, pathname, rootDomain, links }: RouteInput): RouteDecision {
  const next: RouteDecision = { action: 'next' };
  if (surface === null) return next;
  if (pathname.startsWith('/_next') || pathname.startsWith('/__next') || underPrefix(pathname, '/.well-known')) {
    return next;
  }

  // Omitted rootDomain means "read NEXT_PUBLIC_ROOT_DOMAIN" (surfaceUrl's default).
  const url = (s: Surface, p: string) => surfaceUrl(s, p, rootDomain === undefined ? { links } : { rootDomain, links });

  if (underPrefix(pathname, '/api')) {
    const allow = SURFACE_API_ALLOWLIST[surface];
    if (allow === 'all' || allow.some((p) => underPrefix(pathname, p)) || SHARED_API_PATHS.includes(pathname)) return next;
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
  return PROTECTED_PREFIXES.some((p) => underPrefix(pathname, p)) || PROTECTED_BELOW.some((p) => pathname.startsWith(`${p}/`));
}

/** Which surface a page belongs to, for highlighting the nav. */
export function activeSurface({ surface, pathname }: { surface: Surface | null; pathname: string }): Surface {
  if (surface) return surface;
  if (underPrefix(pathname, '/dashboard')) return 'ai';
  return prefixOwner(pathname) ?? 'hub';
}

/**
 * Is `pathname` an admin page, for the primary nav's "Admin" item: hub `/admin[/*]` and marketplace
 * moderation (`/marketplace/admin[/*]` in path mode, `/admin[/*]` on the marketplace surface).
 */
export function isAdminPath({ surface, pathname }: { surface: Surface | null; pathname: string }): boolean {
  const owner = activeSurface({ surface, pathname });
  if (owner !== 'hub' && owner !== 'marketplace') return false;
  const prefix = SURFACE_PREFIX[owner];
  const local = prefix && underPrefix(pathname, prefix) ? stripPrefix(pathname, prefix) : pathname;
  return underPrefix(local, '/admin');
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
  // An empty root gives "www.", which no bare host equals.
  if (!host || bareHost(host) !== `www.${bareHost(rootDomain ?? '')}`) return null;
  return surfaceUrl('hub', pathAndQuery, { rootDomain });
}

/** Lower-case host name without scheme, path, port or trailing dot. */
function bareHost(value: string): string {
  const noScheme = value.trim().toLowerCase().replace(/^https?:\/\//, '');
  return noScheme.split('/')[0].split(':')[0].replace(/\.$/, '');
}

/** TULZO_ROUTING: `path` (default) or `hybrid`. */
export type RoutingMode = 'path' | 'hybrid';

function parseEnum<T extends string>(name: string, values: readonly T[], value: string | undefined): T {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return values[0];
  if ((values as readonly string[]).includes(v)) return v as T;
  throw new Error(`Invalid ${name} "${value}"; expected one of ${values.join(', ')}`);
}

/** Parse TULZO_ROUTING. Unset is `path`; an unknown value throws. */
export function resolveRoutingMode(value: string | undefined): RoutingMode {
  return parseEnum<RoutingMode>('TULZO_ROUTING', ['path', 'hybrid'], value);
}

/** Parse TULZO_LINKS strictly (surfaceUrl reads it leniently). Unset is `path`; an unknown value throws. */
export function resolveLinkMode(value: string | undefined): LinkMode {
  return parseEnum<LinkMode>('TULZO_LINKS', ['path', 'host'], value);
}

/** The request's host: the Host header, or x-forwarded-host (first value) only when Host is missing. */
export function requestHost(headers: { get(name: string): string | null }): string | null {
  const host = headers.get('host')?.trim();
  if (host) return host;
  return headers.get('x-forwarded-host')?.split(',')[0].trim() || null;
}

/** Subdomains that serve a surface at their root. The hub has none: the apex is path-prefix mode. */
const SUBDOMAIN_SURFACES: readonly Surface[] = ['ai', 'marketplace', 'gigs', 'chat'];

/** Old name of the gigs surface; its host 308s to gigs.<root>. */
const JOBS_ALIAS = 'jobs';

/**
 * The surface a host names, under `rootDomain` (case, port and a trailing dot ignored):
 * `ai|marketplace|gigs|chat.<root>` → that surface; `jobs.<root>` → a redirect to `gigs.<root>` and
 * `www.<root>` → a redirect to the apex, both keeping `pathAndQuery`. Everything else (the apex, unknown
 * subdomains, localhost, *.vercel.app, no host or root) → null: path-prefix mode.
 */
export function surfaceFromHost(
  host: string | null | undefined,
  rootDomain: string | undefined,
  pathAndQuery: string = '/',
): Surface | null | { redirect: string } {
  if (!host) return null;
  const www = wwwRedirect({ host, pathAndQuery, rootDomain });
  if (www) return { redirect: www };
  // An empty root gives the suffix ".", which no bare host ends with.
  const suffix = `.${bareHost(rootDomain ?? '')}`;
  const name = bareHost(host);
  if (!name.endsWith(suffix)) return null;
  const label = name.slice(0, -suffix.length);
  if (label === JOBS_ALIAS) return { redirect: surfaceUrl('gigs', pathAndQuery, { rootDomain, links: 'host' }) };
  return SUBDOMAIN_SURFACES.find((s) => s === label) ?? null;
}

export interface RequestSurfaceInput {
  mode: RoutingMode;
  /** TULZO_SURFACE, parsed: wins over both modes. */
  override: Surface | null;
  host: string | null | undefined;
  rootDomain: string | undefined;
  pathAndQuery: string;
}

/** The surface middleware routes this request as (null = path-prefix mode), or a host redirect (308). */
export function resolveRequestSurface({
  mode,
  override,
  host,
  rootDomain,
  pathAndQuery,
}: RequestSurfaceInput): { surface: Surface | null } | { redirect: string } {
  if (mode === 'hybrid' && override === null) {
    const fromHost = surfaceFromHost(host, rootDomain, pathAndQuery);
    return typeof fromHost === 'object' && fromHost !== null ? fromHost : { surface: fromHost };
  }
  const www = wwwRedirect({ host, pathAndQuery, rootDomain });
  return www ? { redirect: www } : { surface: override };
}

/** Request header carrying the resolved surface from middleware to pages and route handlers. */
export const SURFACE_HEADER = 'x-tulzo-surface';
const PATH_MODE = 'path';

/** A copy of the request headers with any client-sent x-tulzo-surface replaced by `surface`. */
export function withSurfaceHeader(incoming: Headers, surface: Surface | null): Headers {
  const out = new Headers(incoming);
  // set() replaces every client-sent value of the header.
  out.set(SURFACE_HEADER, surface ?? PATH_MODE);
  return out;
}

/** Read x-tulzo-surface: a surface, null for path mode, undefined when middleware did not set it. */
export function surfaceFromHeader(value: string | null | undefined): Surface | null | undefined {
  if (value === PATH_MODE) return null;
  return SURFACES.find((s) => s === value);
}
