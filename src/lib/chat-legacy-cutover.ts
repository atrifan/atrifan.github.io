import { auth, clerkClient } from '@clerk/nextjs/server';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  Vary: 'Cookie, Authorization, Origin',
};

function reply(status: number, error: string): Response {
  return Response.json(error === 'upgrade_required' ? { error, protocol: 2 } : { error }, { status, headers });
}

type Scheme = 'viewer' | 'device' | 'either';

/** Legacy routes never inspect their body, URL parameters, or historical rows. */
export function legacyCutover(scheme: Scheme) {
  return async (request: Request): Promise<Response> => {
    try {
      const authorization = request.headers.get('authorization') ?? null;
      const device = scheme === 'device' || (scheme === 'either' && authorization !== null);
      if (device) {
        const match = authorization?.match(/^Bearer ([^\s]+)$/i);
        if (!match) return reply(401, 'unauthorized');
        const { getApiKeyByHash, hashApiKey } = await import('./supabase-services');
        const key = await getApiKeyByHash(hashApiKey(match[1]));
        if (!key || !key.is_active || key.revoked_at) return reply(401, 'unauthorized');
        if (key.plan !== 'pro' && key.plan !== 'plus') return reply(403, 'plan_required');
      } else {
        const { userId, sessionId } = await auth();
        if (!userId || !sessionId) return reply(401, 'unauthorized');
        const client = await clerkClient();
        const session = await client.sessions.getSession(sessionId);
        if (session.id !== sessionId || session.userId !== userId || session.status !== 'active') {
          return reply(401, 'unauthorized');
        }
        const { getApiKeysByUser } = await import('./supabase-services');
        const keys = await getApiKeysByUser(userId);
        if (!keys.some((key) => key.user_id === userId && key.is_active && !key.revoked_at && (key.plan === 'pro' || key.plan === 'plus'))) {
          return reply(403, 'plan_required');
        }
      }
      return reply(410, 'upgrade_required');
    } catch {
      return reply(503, 'broker_unavailable');
    }
  };
}

/** Same cutover for routes with an [id] segment; Next checks the second argument's shape. */
export function legacyCutoverWithId(scheme: Scheme) {
  const handler = legacyCutover(scheme);
  return (request: Request, _context: { params: Promise<{ id: string }> }): Promise<Response> => handler(request);
}
