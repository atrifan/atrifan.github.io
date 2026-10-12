/**
 * Links inside the gigs surface. Pure. On the gigs host (gigs.<root>, or TULZO_SURFACE=gigs) pages live at
 * the root (`/jobs/1`); everywhere else under the `/gigs` prefix (`/gigs/jobs/1`).
 * Server components compute the base once and pass it to client components.
 */
import type { Surface } from '../../surface-url';

export type GigsBase = '' | '/gigs';

export function gigsBase(surface: Surface | null): GigsBase {
  return surface === 'gigs' ? '' : '/gigs';
}

export function gigsHref(base: GigsBase, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (p === '/') return base || '/';
  if (/^\/[?#]/.test(p)) return (base || '/') + p.slice(1);
  return base + p;
}
