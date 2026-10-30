import { describe, expect, it, vi } from 'vitest';
import { issueToken, verifyToken, parseRequest, parsePart } from '@/src/lib/chat-v2/protocol';
import { readBody } from '@/src/lib/chat-v2/http';
import { brokerConfig } from '@/src/lib/chat-v2/broker';

const id = '11111111-1111-4111-8111-111111111111';
const secret = 'synthetic-relay-token-secret-32-bytes';

describe('relay v2 control boundaries', () => {
  it('rejects altered, wrong-audience, expired and extra-claim capabilities', () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { v: 2 as const, aud: 'viewer' as const, userId: 'owner', deviceId: id, streamId: id, clientId: id, iat: now, exp: now + 45, nonce: id, viewerSessionId: 'session' };
    const token = issueToken(claims, secret);
    expect(verifyToken(token, 'viewer', secret)).toMatchObject(claims);
    expect(() => verifyToken(token, 'device', secret)).toThrow();
    expect(() => verifyToken(`${token}x`, 'viewer', secret)).toThrow();
    expect(() => verifyToken(issueToken({ ...claims, iat: now - 45, exp: now }, secret), 'viewer', secret)).toThrow();
    expect(() => verifyToken(issueToken({ ...claims, extra: true }, secret), 'viewer', secret)).toThrow();
  });

  it('rejects unknown operation fields and malformed fragments', () => {
    const expiresAt = new Date(Date.now() + 4000).toISOString();
    expect(parseRequest({ requestId: id, expiresAt, op: { kind: 'hello' } })).toBeTruthy();
    expect(() => parseRequest({ requestId: id, expiresAt, op: { kind: 'hello', url: 'https://bad.invalid' } })).toThrow();
    expect(() => parsePart({ frameId: id, requestId: id, index: 0, count: 1, sha256: 'a'.repeat(64), data: 'e30' })).toThrow();
  });

  it('enforces actual streamed body bytes without a Content-Length', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(131073)); c.close(); } });
    const req = new Request('https://app.invalid/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await expect(readBody(req)).rejects.toMatchObject({ status: 413 });
  });

  it('cancels a stalled body immediately when the operation deadline aborts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let bodyController!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(c) { bodyController = c; }, cancel });
    const request = new Request('https://app.invalid/', { method: 'POST', body, duplex: 'half' } as RequestInit);
    const operation = new AbortController();
    const pending = Reflect.apply(readBody, null, [request, operation.signal]).catch(() => undefined);
    try {
      operation.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      if (!cancel.mock.calls.length) bodyController.close();
      await pending;
      vi.useRealTimers();
    }
  });

  it('rejects unsafe broker roles and constructs only the configured project websocket', () => {
    const jwt = (claims: object) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
    const now = Math.floor(Date.now() / 1000);
    vi.stubEnv('STORAGE_SUPABASE_URL', 'https://project.invalid');
    vi.stubEnv('CHAT_REALTIME_ANON_KEY', jwt({ role: 'anon' }));
    vi.stubEnv('CHAT_BROKER_JWT', jwt({ role: 'tulzo_chat_broker', iat: now, exp: now + 120 }));
    vi.stubEnv('CHAT_RELAY_TOKEN_SECRET', 'A'.repeat(43));
    try {
      const url = new URL(brokerConfig().url);
      expect(url.protocol).toBe('wss:'); expect(url.host).toBe('project.invalid'); expect(url.pathname).toBe('/realtime/v1/websocket');
      vi.stubEnv('CHAT_RELAY_TOKEN_SECRET', 'synthetic-relay-token-secret-32-bytes');
      expect(() => brokerConfig()).toThrow();
      vi.stubEnv('CHAT_RELAY_TOKEN_SECRET', 'A'.repeat(43));
      vi.stubEnv('CHAT_BROKER_JWT', jwt({ role: 'service_role', iat: now, exp: now + 120 }));
      expect(() => brokerConfig()).toThrow();
      vi.stubEnv('CHAT_BROKER_JWT', jwt({ role: 'tulzo_chat_broker', iat: now, exp: now + 59 }));
      expect(() => brokerConfig()).toThrow();
      vi.stubEnv('CHAT_REALTIME_ANON_KEY', jwt({ role: 'service_role' }));
      expect(() => brokerConfig()).toThrow();
    } finally { vi.unstubAllEnvs(); }
  });
});
