import { surfaceUrl, type Surface } from './surface-url';

type Env = Record<string, string | undefined>;

/**
 * Absolute URL for a page on a surface, for metadataBase, robots.txt and the
 * sitemap (which need absolute URLs). With NEXT_PUBLIC_ROOT_DOMAIN set this is
 * surfaceUrl(); otherwise the path-prefix URL on this deploy's own origin
 * (Vercel's URL on previews, localhost in dev).
 */
export function absoluteSurfaceUrl(surface: Surface, path: string = '/', env: Env = process.env): string {
  const url = surfaceUrl(surface, path, { rootDomain: env.NEXT_PUBLIC_ROOT_DOMAIN });
  if (/^https?:\/\//.test(url)) return url;
  const host = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
  const origin = host ? `https://${host}` : `http://localhost:${env.PORT || '3000'}`;
  return origin + url;
}
