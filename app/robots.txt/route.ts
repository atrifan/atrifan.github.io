import { robotsTxt } from '@/src/lib/seo';
import { requestSurface } from '@/src/lib/request-surface';

// A route handler rather than app/robots.ts so the output uses the canonical
// "User-agent" spelling. Static in path mode; per request (each host describes its own
// surface) with TULZO_ROUTING=hybrid, where requestSurface() reads the request headers.

export function GET() {
  return new Response(robotsTxt(requestSurface()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
