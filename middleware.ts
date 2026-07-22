import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/chat(.*)',
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
  // Remote chat relay — device (Bearer API key) routes; handlers do their own auth.
  '/api/plugin/chat/emit(.*)',
  '/api/plugin/chat/poll(.*)',
  '/api/plugin/chat/sessions/(.*)/messages(.*)',
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
