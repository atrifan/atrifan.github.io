import { afterEach, describe, expect, it, vi } from 'vitest';
import { brokerConfig } from '@/src/lib/chat-v2/broker';
import { checkOrigin, configuredViewerOrigins } from '@/src/lib/chat-v2/http';
import { jwtExpiry, jwtPayload, newTokenSecret, signBrokerJwt } from '@/src/lib/chat-v2/relay-settings';
import { tokenSecret } from '@/src/lib/chat-v2/protocol';

const req = (url: string, origin: string | null) => new Request(url, { method: 'POST', headers: origin ? { origin } : {} });

afterEach(() => vi.unstubAllEnvs());

describe('signBrokerJwt', () => {
  it('signs the broker role with a two year expiry that brokerConfig accepts', () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = signBrokerJwt('s'.repeat(40), now);
    expect(jwtPayload(jwt)).toMatchObject({ role: 'tulzo_chat_broker', iat: now, exp: now + 2 * 365 * 24 * 3600 });
    expect(jwtExpiry(jwt)).toBe(now + 2 * 365 * 24 * 3600);
    const anon = `x.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.y`;
    vi.stubEnv('STORAGE_SUPABASE_URL', 'https://project.invalid');
    expect(() => brokerConfig({ tokenSecret: newTokenSecret(), realtimeAnonKey: anon, brokerJwt: jwt })).not.toThrow();
  });

  it('generates a secret tokenSecret() accepts', () => {
    expect(() => tokenSecret({ tokenSecret: newTokenSecret() })).not.toThrow();
  });
});

describe('checkOrigin', () => {
  it('accepts the host the request reached, with no configuration', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('CHAT_ALLOWED_ORIGINS', '');
    expect(() => checkOrigin(req('https://tulzo.vercel.app/api/x', 'https://tulzo.vercel.app'))).not.toThrow();
    expect(() => checkOrigin(req('https://new-domain.example/api/x', 'https://new-domain.example'))).not.toThrow();
  });

  it('accepts listed origins and bare hosts, and nothing else', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://tulzo.online');
    vi.stubEnv('CHAT_ALLOWED_ORIGINS', 'tulzo.vercel.app, https://other.example/ ,http://insecure.example');
    expect(configuredViewerOrigins()).toEqual(['https://tulzo.online', 'https://tulzo.vercel.app', 'https://other.example']);
    expect(() => checkOrigin(req('https://tulzo.online/api/x', 'https://other.example'))).not.toThrow();
    expect(() => checkOrigin(req('https://tulzo.online/api/x', 'https://evil.example'))).toThrow();
    expect(() => checkOrigin(req('https://tulzo.online/api/x', 'http://insecure.example'))).toThrow();
    expect(() => checkOrigin(req('https://tulzo.online/api/x', null))).toThrow();
  });
});
