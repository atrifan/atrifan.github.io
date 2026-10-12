import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  isProtectedPath,
  requestHost,
  resolveLinkMode,
  resolveRequestSurface,
  resolveRoutingMode,
  resolveSurface,
  routeRequest,
  withSurfaceHeader,
} from '@/src/lib/surface-routing';
import { surfaceUrl } from '@/src/lib/surface-url';
import { e2eIdentity } from '@/src/lib/e2e-identity';

/**
 * 0. The request's surface (src/lib/surface-routing.ts resolveRequestSurface): TULZO_SURFACE
 *    if set (test servers), else path-prefix mode (TULZO_ROUTING=path, the default) or, with
 *    TULZO_ROUTING=hybrid, the surface named by the Host (`ai.<root>` → ai; the apex, vercel.app
 *    and localhost stay path mode). `www.<root>` 308s to the apex (the hub lives at the root
 *    domain; Vercel's own "redirect to www" setting must stay off), and in hybrid mode
 *    `jobs.<root>` 308s to `gigs.<root>`.
 * 1. routeRequest decides next / rewrite / redirect (308) / 404 from that surface and the path.
 *    Pages and route handlers get the surface in the x-tulzo-surface request header (any
 *    client-sent value is overwritten); they read it with requestSurface().
 * 2. Signed-in pages (isProtectedPath: /dashboard, /ai, the hub account pages, …) need a
 *    user. The check runs on the rewritten path. `chat.` `/` (rewritten to /chat) is public:
 *    signed out it is the remote-chat landing, signed in the chat itself. Outside production,
 *    the gigs Playwright identity header also passes (src/lib/e2e-identity.ts); the page then
 *    resolves the user from it.
 *
 * Route handlers do their own auth (API keys, Bearer, Clerk); the middleware
 * never blocks an API route for auth.
 */
// Parsed once: an invalid value fails every request loudly instead of serving the wrong routes.
const override = resolveSurface(process.env.TULZO_SURFACE);
const mode = resolveRoutingMode(process.env.TULZO_ROUTING);
const links = resolveLinkMode(process.env.TULZO_LINKS);
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

// Unauthenticated users go to the hub's own sign-in page, not Clerk's hosted portal.
const signInUrl = surfaceUrl('hub', '/sign-in');
const signUpUrl = surfaceUrl('hub', '/sign-up');

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname } = req.nextUrl;
    const resolved = resolveRequestSurface({
      mode,
      override,
      host: requestHost(req.headers),
      rootDomain,
      pathAndQuery: pathname + req.nextUrl.search,
    });
    if ('redirect' in resolved) return NextResponse.redirect(resolved.redirect, 308);
    const { surface } = resolved;

    const decision = routeRequest({ surface, pathname, rootDomain, links });

    if (decision.action === 'notFound') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }
      // No page matches this path, so Next renders app/not-found.tsx with a 404.
      return NextResponse.rewrite(new URL('/_surface-not-found', req.url));
    }

    if (decision.action === 'redirect') {
      const target = new URL(decision.destination!, req.url);
      if (!target.search) target.search = req.nextUrl.search;
      return NextResponse.redirect(target, 308);
    }

    const effectivePath = decision.action === 'rewrite' ? decision.destination! : pathname;
    if (isProtectedPath(effectivePath) && !e2eIdentity(req.headers)) {
      await auth.protect();
    }

    const request = { headers: withSurfaceHeader(req.headers, surface) };
    if (decision.action === 'rewrite') {
      const target = new URL(decision.destination!, req.url);
      target.search = req.nextUrl.search;
      return NextResponse.rewrite(target, { request });
    }
    return NextResponse.next({ request });
  },
  { signInUrl, signUpUrl },
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)',
    '/(api|trpc)(.*)',
    // Per-host robots and sitemap read the surface header.
    '/robots.txt',
    '/sitemap.xml',
  ],
};
