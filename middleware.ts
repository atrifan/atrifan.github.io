import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isProtectedPath, resolveSurface, routeRequest, wwwRedirect } from '@/src/lib/surface-routing';
import { surfaceUrl } from '@/src/lib/surface-url';
import { e2eIdentity } from '@/src/lib/e2e-identity';

/**
 * 1. Surface routing (src/lib/surface-routing.ts) decides next / rewrite /
 *    redirect (308) / 404 from TULZO_SURFACE and the path.
 * 2. Signed-in pages (isProtectedPath: /dashboard, /ai, the hub account pages, …) need a
 *    user. The check runs on the rewritten path. `chat.` `/` (rewritten to /chat) is public:
 *    signed out it is the remote-chat landing, signed in the chat itself. Outside production,
 *    the gigs Playwright identity header also passes (src/lib/e2e-identity.ts); the page then
 *    resolves the user from it.
 *
 * 0. `www.<root>` 308s to the apex: the hub lives at the root domain (tulzo.online).
 *    The www domain only needs to be attached to the hub's Vercel project; Vercel's own
 *    "redirect to www" domain setting must stay off.
 *
 * Route handlers do their own auth (API keys, Bearer, Clerk); the middleware
 * never blocks an API route for auth.
 */
const surface = resolveSurface(process.env.TULZO_SURFACE);

// Unauthenticated users go to the hub's own sign-in page, not Clerk's hosted portal.
const signInUrl = surfaceUrl('hub', '/sign-in');
const signUpUrl = surfaceUrl('hub', '/sign-up');

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname } = req.nextUrl;
    const toApex = wwwRedirect({
      host: req.headers.get('host'),
      pathAndQuery: pathname + req.nextUrl.search,
      rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
    });
    if (toApex) return NextResponse.redirect(toApex, 308);

    const decision = routeRequest({ surface, pathname });

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

    if (decision.action === 'rewrite') {
      const target = new URL(decision.destination!, req.url);
      target.search = req.nextUrl.search;
      return NextResponse.rewrite(target);
    }
    return NextResponse.next();
  },
  { signInUrl, signUpUrl },
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)',
    '/(api|trpc)(.*)',
  ],
};
