import { robotsTxt } from '@/src/lib/seo';
import { resolveSurface } from '@/src/lib/surface-routing';

// A route handler rather than app/robots.ts so the output uses the canonical
// "User-agent" spelling. Static: TULZO_SURFACE is fixed per deploy.
export const dynamic = 'force-static';

export function GET() {
  return new Response(robotsTxt(resolveSurface(process.env.TULZO_SURFACE)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
