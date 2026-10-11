import { describe, expect, it } from 'vitest';
import {
  resolveClerkFrontendApi,
  resolveClerkOAuthClient,
} from '@/src/lib/clerk-oauth-config';

const pk = (host: string, kind: 'test' | 'live' = 'test') =>
  `pk_${kind}_${Buffer.from(`${host}$`).toString('base64')}`;

describe('resolveClerkFrontendApi', () => {
  it('decodes the frontend API host from a test publishable key', () => {
    expect(resolveClerkFrontendApi({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk('foo-1.clerk.accounts.dev') }))
      .toBe('https://foo-1.clerk.accounts.dev');
  });

  it('decodes a live publishable key and strips every trailing $', () => {
    const key = `pk_live_${Buffer.from('clerk.tulzo.online$$').toString('base64')}`;
    expect(resolveClerkFrontendApi({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key })).toBe('https://clerk.tulzo.online');
  });

  it('prefers the publishable key over CLERK_HOST', () => {
    expect(
      resolveClerkFrontendApi({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk('a.clerk.accounts.dev'),
        CLERK_HOST: 'https://other.example',
      }),
    ).toBe('https://a.clerk.accounts.dev');
  });

  it('falls back to CLERK_HOST when the key does not decode to a clerk host', () => {
    expect(
      resolveClerkFrontendApi({
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: pk('not-a-frontend.example.com'),
        CLERK_HOST: 'https://x.clerk.accounts.dev',
      }),
    ).toBe('https://x.clerk.accounts.dev');
  });

  it('falls back to CLERK_HOST when there is no publishable key', () => {
    expect(resolveClerkFrontendApi({ CLERK_HOST: 'https://x.clerk.accounts.dev' })).toBe('https://x.clerk.accounts.dev');
  });

  it('returns null (no hard-coded host) when nothing is configured', () => {
    expect(resolveClerkFrontendApi({})).toBeNull();
    expect(resolveClerkFrontendApi({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '', CLERK_HOST: '' })).toBeNull();
  });

  it('returns null for an undecodable key with no CLERK_HOST', () => {
    expect(resolveClerkFrontendApi({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_###' })).toBeNull();
  });
});

describe('resolveClerkOAuthClient', () => {
  it('returns id and secret when both are set', () => {
    expect(
      resolveClerkOAuthClient({ NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID: 'cid', CLERK_OAUTH_CLIENT_SECRET: 'sec' }, { requireSecret: true }),
    ).toEqual({ clientId: 'cid', clientSecret: 'sec' });
  });

  it('returns null when the secret is required but missing', () => {
    expect(resolveClerkOAuthClient({ NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID: 'cid' }, { requireSecret: true })).toBeNull();
    expect(
      resolveClerkOAuthClient({ NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID: 'cid', CLERK_OAUTH_CLIENT_SECRET: '' }, { requireSecret: true }),
    ).toBeNull();
  });

  it('returns only the id when the secret is not required', () => {
    expect(resolveClerkOAuthClient({ NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID: 'cid' }, { requireSecret: false })).toEqual({
      clientId: 'cid',
    });
  });

  it('returns null when the client id is missing, whatever the secret', () => {
    expect(resolveClerkOAuthClient({ CLERK_OAUTH_CLIENT_SECRET: 'sec' }, { requireSecret: true })).toBeNull();
    expect(resolveClerkOAuthClient({ CLERK_OAUTH_CLIENT_SECRET: 'sec' }, { requireSecret: false })).toBeNull();
    expect(resolveClerkOAuthClient({ NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID: '' }, { requireSecret: false })).toBeNull();
  });
});
