/**
 * Tulzo is one build deployed as five surfaces (see src/lib/surface-routing.ts):
 * the hub at the root domain, and ai., marketplace., gigs., chat. subdomains.
 *
 * `surfaceUrl()` builds a link to a page on any surface:
 * - NEXT_PUBLIC_ROOT_DOMAIN set (e.g. `tulzo.online`): absolute URL on that
 *   surface's host, `https://ai.tulzo.online/keys`. A scheme and port may be
 *   included for local testing (`http://lvh.me:3000`).
 * - Unset (localhost, previews): a root-relative path under the surface's
 *   prefix, `/ai/keys`, which works because every surface is served from one
 *   deploy in path-prefix mode.
 *
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

export interface SurfaceUrlOptions {
  /** Overrides NEXT_PUBLIC_ROOT_DOMAIN (tests, middleware). */
  rootDomain?: string;
}

export function surfaceUrl(surface: Surface, path: string = '/', opts?: SurfaceUrlOptions): string {
  const rawRoot =
    opts && 'rootDomain' in opts ? opts.rootDomain : process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const root = (rawRoot ?? '').trim().replace(/\/+$/, '');

  if (!root) {
    const prefix = SURFACE_PREFIX[surface];
    // A surface home is `/ai`, not `/ai/`; a query or hash stays attached.
    if (prefix && /^\/(?=[?#]|$)/.test(normalized)) return prefix + normalized.slice(1);
    return prefix + normalized;
  }

  const scheme = /^https?:\/\//.exec(root)?.[0];
  const host = scheme ? root.slice(scheme.length) : root;
  const fullHost = surface === 'hub' ? host : `${surface}.${host}`;
  return `${scheme ?? 'https://'}${fullHost}${normalized}`;
}
