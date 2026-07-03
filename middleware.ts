import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
]);

const isPublicRoute = createRouteMatcher([
  '/',
  '/pricing(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/oauth/plugin/verify(.*)',
  '/api/mcp(.*)',
  '/api/marketplace/discover(.*)',
  '/api/marketplace/publish(.*)',
  '/api/marketplace/install(.*)',
  '/api/billing/webhook(.*)',
  '/api/chat(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|txt|xml)).*)',
    '/(api|trpc)(.*)',
  ],
};
