import { afterEach, describe, expect, it, vi } from 'vitest';
import { req } from './vitest-env';

/**
 * The Clerk OAuth proxy routes must not fall back to hard-coded credentials.
 * With the env unset they answer 500 { error: 'server_misconfigured' }.
 * No network or DB is needed: the guard runs before anything else.
 */
const unset = (...names: string[]) => names.forEach((n) => vi.stubEnv(n, ''));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/oauth/token without Clerk OAuth env', () => {
  it('returns 500 server_misconfigured when the client secret is missing', async () => {
    unset('CLERK_OAUTH_CLIENT_SECRET');
    const { POST } = await import('@/app/api/oauth/token/route');
    const res = await POST(
      req('/api/oauth/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=authorization_code&code=x',
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_misconfigured' });
  });

  it('returns 500 server_misconfigured when the client id is missing', async () => {
    unset('NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID');
    const { POST } = await import('@/app/api/oauth/token/route');
    const res = await POST(req('/api/oauth/token', { method: 'POST', body: 'grant_type=refresh_token' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_misconfigured' });
  });

  it('returns 500 server_misconfigured when no Clerk host can be resolved', async () => {
    unset('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_HOST');
    vi.stubEnv('NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID', 'cid');
    vi.stubEnv('CLERK_OAUTH_CLIENT_SECRET', 'sec');
    const { POST } = await import('@/app/api/oauth/token/route');
    const res = await POST(req('/api/oauth/token', { method: 'POST', body: '' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_misconfigured' });
  });
});

describe('GET /api/oauth/authorize without Clerk OAuth env', () => {
  it('returns 500 server_misconfigured when the client id is missing', async () => {
    unset('NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID');
    const { GET } = await import('@/app/api/oauth/authorize/route');
    const res = await GET(req('/api/oauth/authorize?client_id=u&redirect_uri=http://localhost/cb'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_misconfigured' });
  });

  it('does not redirect anywhere when misconfigured', async () => {
    unset('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_HOST');
    const { GET } = await import('@/app/api/oauth/authorize/route');
    const res = await GET(req('/api/oauth/authorize?client_id=u&redirect_uri=http://localhost/cb'));
    expect(res.status).toBe(500);
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('Clerk proxy routes without a Clerk host', () => {
  it('GET /api/oauth/userinfo returns 500 server_misconfigured', async () => {
    unset('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_HOST');
    const { GET } = await import('@/app/api/oauth/userinfo/route');
    const res = await GET(req('/api/oauth/userinfo', { headers: { authorization: 'Bearer t' } }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_misconfigured' });
  });

  it('GET /api/oauth/jwks returns 500 server_misconfigured', async () => {
    unset('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_HOST');
    const { GET } = await import('@/app/api/oauth/jwks/route');
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_misconfigured' });
  });
});
