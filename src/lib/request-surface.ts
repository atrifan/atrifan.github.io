import 'server-only';
import { headers } from 'next/headers';
import { SURFACE_HEADER, resolveSurface, surfaceFromHeader } from './surface-routing';
import type { Surface } from './surface-url';

/**
 * The surface of the current request (null = path-prefix mode), as `middleware.ts` resolved it from
 * TULZO_ROUTING / TULZO_SURFACE and the Host header. Middleware always overwrites the header, so a
 * client-sent value never gets here. Without it (a route the middleware matcher skips) this falls back
 * to TULZO_SURFACE. Server components and route handlers only; reading it makes the route dynamic.
 */
export function requestSurface(): Surface | null {
  const fromMiddleware = surfaceFromHeader(headers().get(SURFACE_HEADER));
  return fromMiddleware === undefined ? resolveSurface(process.env.TULZO_SURFACE) : fromMiddleware;
}
