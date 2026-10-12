import 'server-only';
import { headers } from 'next/headers';
import { SURFACE_HEADER, resolveRoutingMode, resolveSurface, surfaceFromHeader } from './surface-routing';
import type { Surface } from './surface-url';

/**
 * The surface of the current request (null = path-prefix mode), as `middleware.ts` resolved it from
 * TULZO_ROUTING / TULZO_SURFACE and the Host header. Server components and route handlers only.
 *
 * - TULZO_SURFACE set, or TULZO_ROUTING=path: the same for every request, so the header is not read
 *   and pages can still be prerendered.
 * - TULZO_ROUTING=hybrid: the x-tulzo-surface header, which middleware always overwrites (a
 *   client-sent value never gets here). This makes the route dynamic. Without the header (a path the
 *   middleware matcher skips) it is path-prefix mode.
 */
export function requestSurface(): Surface | null {
  const override = resolveSurface(process.env.TULZO_SURFACE);
  if (override !== null || resolveRoutingMode(process.env.TULZO_ROUTING) === 'path') return override;
  return surfaceFromHeader(headers().get(SURFACE_HEADER)) ?? null;
}
