import { robotsTxt } from '@/src/lib/seo';
import { requestSurface } from '@/src/lib/request-surface';

// A route handler rather than app/robots.ts so the output uses the canonical
// "User-agent" spelling. Per request: each host describes its own surface.
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(robotsTxt(requestSurface()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
