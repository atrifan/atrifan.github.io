export type Surface = 'hub' | 'ai' | 'marketplace' | 'gigs' | 'chat';

const DEFAULT_ROOT_DOMAIN = 'tulzo.online';

/**
 * Absolute URL on a Tulzo surface, from `NEXT_PUBLIC_ROOT_DOMAIN`.
 * Production: hub is the root domain, other surfaces are subdomains.
 * localhost: one server serves every surface under a path prefix (`/gigs/...`).
 * Kept local to notify so it has no dependency on the UI shell's `surfaceUrl`.
 */
export function appUrl(surface: Surface, path: string, rootDomain?: string): string {
  const raw = (rootDomain ?? process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN).trim() || DEFAULT_ROOT_DOMAIN;
  const root = raw.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(root);
  if (local) {
    const prefix = surface === 'hub' ? '' : `/${surface}`;
    return `http://${root}${prefix}${cleanPath}`;
  }
  const host = surface === 'hub' ? root : `${surface}.${root}`;
  return `https://${host}${cleanPath}`;
}
