import type { Surface } from './surface-url';

/**
 * Where the single footer ad may appear. Kept to the minimum: signed-out
 * visitors only, on public browsing pages (hub landing and docs, marketplace,
 * gigs listing and detail). Never on ai., chat., profile, credits, pricing,
 * auth, admin, posting, checkout or job rooms.
 *
 * `surface` is the active surface (activeSurface()); `pathname` may still carry
 * the surface prefix in path-prefix mode.
 */
const BLOCKED_SEGMENTS: Partial<Record<Surface, readonly string[]>> = {
  marketplace: ['admin', 'publish'],
  gigs: ['post', 'room', 'checkout'],
};

export function footerAdAllowed({
  surface,
  pathname,
  signedIn,
}: {
  surface: Surface;
  pathname: string;
  signedIn: boolean;
}): boolean {
  if (signedIn) return false;
  if (surface === 'hub') return pathname === '/' || pathname === '/docs' || pathname.startsWith('/docs/');
  if (surface !== 'marketplace' && surface !== 'gigs') return false;

  // The surface prefix (path-prefix mode) is never a blocked segment, so the full path can be checked as is.
  return !pathname.split('/').some((s) => BLOCKED_SEGMENTS[surface]!.includes(s));
}
