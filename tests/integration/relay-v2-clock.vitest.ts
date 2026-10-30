import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

const state = vi.hoisted(() => ({ port: 0, active: true, events: [] as string[], checkNotify: null as null | (() => void) }));
vi.mock('ws', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ws')>();
  class LocalSocket extends actual.default {
    constructor(_url: string, options: ConstructorParameters<typeof actual.default>[1]) {
      super(`ws://127.0.0.1:${state.port}`, options);
      this.on('open', () => state.events.push(`ws open @${performance.now()}`));
      this.on('error', () => state.events.push(`ws error @${performance.now()}`));
      this.on('close', () => state.events.push(`ws close @${performance.now()}`));
    }
    terminate() {
      state.events.push(`ws terminate @${performance.now()}`);
      return super.terminate();
    }
  }
  return { ...actual, default: LocalSocket };
});
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: 'owner', sessionId: 'session' }),
  clerkClient: async () => ({ sessions: { getSession: async () => ({ id: 'session', userId: 'owner', status: 'active' }) } }),
}));
vi.mock('@/src/lib/supabase-services', () => ({
  getApiKeyById: async () => {
    state.checkNotify?.();
    return { id: '11111111-1111-4111-8111-111111111111', user_id: 'owner', is_active: state.active, revoked_at: null, plan: 'pro' };
  },
}));
import { POST as viewerStream } from '@/app/api/plugin/chat/v2/viewer/stream/route';

const jwt = (claims: object) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
let server: WebSocketServer;
beforeEach(async () => {
  state.events = [];
  state.active = true;
  state.checkNotify = null;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.tulzo.test';
  process.env.STORAGE_SUPABASE_URL = 'https://supabase.invalid.test';
  process.env.CHAT_REALTIME_ANON_KEY = jwt({ role: 'anon' });
  process.env.CHAT_BROKER_JWT = jwt({ role: 'tulzo_chat_broker', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  process.env.CHAT_RELAY_TOKEN_SECRET = 'A'.repeat(43);
  server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  state.port = (server.address() as { port: number }).port;
  server.on('connection', (ws) => ws.on('message', (raw) => {
    const frame = JSON.parse(raw.toString()) as Record<string, unknown>;
    state.events.push(`server ${String(frame.event)} @${performance.now()}`);
    ws.send(JSON.stringify({ topic: frame.topic, event: 'phx_reply', ref: frame.ref, join_ref: '1', payload: { status: 'ok' } }));
  }));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const ws of server.clients) ws.terminate();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('synthetic route clock diagnosis', () => {
  it('requires matching fake clearTimeout for a canceled fake deadline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const uncanceled = vi.fn();
    const wrongClock = setTimeout(uncanceled, 5000);
    clearTimeout(wrongClock);
    await vi.advanceTimersByTimeAsync(5000);
    expect(uncanceled).toHaveBeenCalledOnce();
    vi.useRealTimers();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const canceled = vi.fn();
    const sameClock = setTimeout(canceled, 5000);
    clearTimeout(sameClock);
    await vi.advanceTimersByTimeAsync(5000);
    expect(canceled).not.toHaveBeenCalled();
  });

  it('refreshes three leases and closes the real socket on revocation under a consistent injected clock', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const response = await viewerStream(new Request('https://app.tulzo.test/viewer', {
      method: 'POST', headers: { origin: 'https://app.tulzo.test', 'content-type': 'application/json' },
      body: JSON.stringify({ protocol: 2, deviceId: '11111111-1111-4111-8111-111111111111', clientId: '22222222-2222-4222-8222-222222222222' }),
    }));
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const read = async () => {
      const chunk = await reader.read();
      if (!chunk.value) throw new Error('stream ended');
      const match = new TextDecoder().decode(chunk.value).match(/^event:([^\n]+)\ndata:([^\n]+)\n\n$/);
      if (!match) throw new Error('invalid event');
      return { event: match[1], data: JSON.parse(match[2]) as Record<string, string> };
    };
    expect((await read()).event).toBe('ready');
    try {
      let previousUntil = 0;
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(2000);
        const event = await read();
        state.events.push(`sse ${event.event} @${performance.now()}`);
        expect(event.event).toBe('heartbeat');
        const until = Date.parse(event.data.authorizedUntil);
        expect(until).toBeGreaterThan(previousUntil);
        expect(until).toBeGreaterThan(Date.now());
        expect(until).toBeLessThanOrEqual(Date.now() + 5000);
        previousUntil = until;
      }
      state.active = false;
      await vi.advanceTimersByTimeAsync(2000);
      const closing = await read();
      state.events.push(`sse ${closing.event}/${closing.data.reason} @${performance.now()}`);
      expect(closing).toEqual({ event: 'closing', data: { protocol: 2, reason: 'revoked' } });
      expect(Date.now()).toBeLessThanOrEqual(previousUntil);
      expect((await reader.read()).done).toBe(true);
      expect(state.events.some((event) => event.startsWith('ws terminate'))).toBe(true);
      expect(state.events.filter((event) => event.startsWith('sse '))).toEqual([
        'sse heartbeat @2000', 'sse heartbeat @4000', 'sse heartbeat @6000', 'sse closing/revoked @8000',
      ]);
    } finally {
      await reader.cancel().catch(() => {});
    }
  });

  it('discards an undelivered frame on revocation while closing the broker socket', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const response = await viewerStream(new Request('https://app.tulzo.test/viewer', {
      method: 'POST', headers: { origin: 'https://app.tulzo.test', 'content-type': 'application/json' },
      body: JSON.stringify({ protocol: 2, deviceId: '11111111-1111-4111-8111-111111111111', clientId: '22222222-2222-4222-8222-222222222222' }),
    }));
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    try {
      const readyChunk = await reader.read();
      const readyMatch = new TextDecoder().decode(readyChunk.value).match(/^event:ready\ndata:([^\n]+)\n\n$/);
      expect(readyMatch).not.toBeNull();
      const ready = JSON.parse(readyMatch![1]) as { streamId: string; authorizedUntil: string };
      const socket = [...server.clients][0];
      const topic = `realtime:tc2:v:${ready.streamId}`;
      const frame = JSON.stringify({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'relay', payload: {
        protocol: 2, deviceId: '11111111-1111-4111-8111-111111111111', viewerStreamId: ready.streamId,
        connectionId: '33333333-3333-4333-8333-333333333333', part: {
          frameId: '44444444-4444-4444-8444-444444444444', requestId: '55555555-5555-4555-8555-555555555555',
          index: 0, count: 1, sha256: 'a'.repeat(64), data: 'e30=',
        },
      } } });
      socket.send(frame);
      const delivered = await reader.read();
      expect(new TextDecoder().decode(delivered.value)).toContain('event:frame');

      const checked = new Promise<void>((resolve) => { state.checkNotify = resolve; });
      socket.send(frame);
      await checked;
      state.checkNotify = null;
      await new Promise<void>((resolve) => setImmediate(resolve));
      state.active = false;
      await vi.advanceTimersByTimeAsync(2000);
      await expect(reader.read()).rejects.toThrow('relay_closed');
      expect(Date.now()).toBeLessThanOrEqual(Date.parse(ready.authorizedUntil));
      expect(state.events.some((event) => event.startsWith('ws terminate'))).toBe(true);
    } finally {
      state.checkNotify = null;
      await reader.cancel().catch(() => {});
    }
  });
});
