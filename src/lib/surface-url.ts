/**
 * Tulzo is one build and one deploy serving five surfaces (see src/lib/surface-routing.ts):
 * the hub at the root domain, ai, marketplace, gigs and chat under a path prefix on any host,
 * or at the root of their own subdomain.
 *
 * `surfaceUrl()` builds a link to a page on any surface:
 * - NEXT_PUBLIC_ROOT_DOMAIN set (e.g. `tulzo.online`; a scheme and port may be included for local
 *   testing, `http://lvh.me:3000`), the link is absolute and TULZO_LINKS picks the host:
 *   - `path` (default): the apex with the surface prefix, `https://tulzo.online/ai/keys`;
 *   - `host`: the surface subdomain, `https://ai.tulzo.online/keys`.
 * - Unset (localhost, previews): a root-relative path under the surface's prefix, `/ai/keys`.
 *
 * TULZO_LINKS is inlined at build time by next.config.mjs, so client code sees it too.
 * Pure: safe in middleware, server and client code.
 */

export type Surface = 'hub' | 'ai' | 'marketplace' | 'gigs' | 'chat';

export const SURFACES: readonly Surface[] = ['hub', 'ai', 'marketplace', 'gigs', 'chat'];

/** Path prefix of each surface in path-prefix mode. The hub has none. */
export const SURFACE_PREFIX: Readonly<Record<Surface, string>> = {
  hub: '',
  ai: '/ai',
  marketplace: '/marketplace',
  gigs: '/gigs',
  chat: '/chat',
};

/** Where cross-surface links point: the apex with a prefix, or the surface subdomains. */
export type LinkMode = 'path' | 'host';

/** TULZO_LINKS, leniently: only `host` means host links (middleware validates it strictly). */
export function linkMode(value: string | undefined): LinkMode {
  return value?.trim().toLowerCase() === 'host' ? 'host' : 'path';
}

export interface SurfaceUrlOptions {
  /** Overrides NEXT_PUBLIC_ROOT_DOMAIN (tests, middleware). */
  rootDomain?: string;
  /** Overrides TULZO_LINKS. */
  links?: LinkMode;
}

/** `path` under the surface prefix: a surface home is `/ai`, not `/ai/`; a query or hash stays attached. */
function prefixed(surface: Surface, path: string): string {
  const prefix = SURFACE_PREFIX[surface];
  if (prefix && /^\/(?=[?#]|$)/.test(path)) return prefix + path.slice(1);
  return prefix + path;
}

export function surfaceUrl(surface: Surface, path: string = '/', opts?: SurfaceUrlOptions): string {
  const rawRoot =
    opts && 'rootDomain' in opts ? opts.rootDomain : process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const root = (rawRoot ?? '').trim().replace(/\/+$/, '');

  if (!root) return prefixed(surface, normalized);

  const scheme = /^https?:\/\//.exec(root)?.[0];
  const host = scheme ? root.slice(scheme.length) : root;
  const origin = scheme ?? 'https://';
  if ((opts?.links ?? linkMode(process.env.TULZO_LINKS)) === 'host') {
    return `${origin}${surface === 'hub' ? host : `${surface}.${host}`}${normalized}`;
  }
  return `${origin}${host}${prefixed(surface, normalized)}`;
}
