import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';

const state = vi.hoisted(() => ({ port: 0, active: true, keyOwner: 'owner', sessionStatus: 'active', plan: 'pro', failKey: false, idCalls: 0, failIdAfter: 0, hold: null as null | (() => Promise<void>) }));
vi.mock('ws', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ws')>();
  class LocalSocket extends actual.default {
    constructor(_url: string, options: ConstructorParameters<typeof actual.default>[1]) {
      super(`ws://127.0.0.1:${state.port}`, options);
    }
  }
  return { ...actual, default: LocalSocket };
});
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: 'owner', sessionId: 'session' }),
  clerkClient: async () => ({ sessions: { getSession: async (sessionId: string) => ({ id: sessionId, userId: sessionId === 'attacker-session' ? 'attacker' : 'owner', status: state.sessionStatus }) } }),
}));
vi.mock('@/src/lib/supabase-services', () => ({
  hashApiKey: (value: string) => value,
  getApiKeyByHash: async (hash: string) => { if (state.failKey) throw new Error('do-not-log-provider-detail'); return hash === 'synthetic-key' ? { id, user_id: state.keyOwner, is_active: state.active, revoked_at: null, plan: state.plan } : null; },
  getApiKeyById: async (value: string) => { state.idCalls++; if (state.hold) await state.hold(); if (state.failKey || (state.failIdAfter && state.idCalls >= state.failIdAfter)) throw new Error('do-not-log-provider-detail'); return value === id ? { id, user_id: state.keyOwner, is_active: state.active, revoked_at: null, plan: state.plan } : null; },
}));
import { POST as viewerStream } from '@/app/api/plugin/chat/v2/viewer/stream/route';
import { GET as viewerStreamGet } from '@/app/api/plugin/chat/v2/viewer/stream/route';
import { POST as viewerRequests } from '@/app/api/plugin/chat/v2/viewer/requests/route';
import { POST as deviceStream } from '@/app/api/plugin/chat/v2/device/stream/route';
import { POST as deviceFrames } from '@/app/api/plugin/chat/v2/device/frames/route';
import { issueToken } from '@/src/lib/chat-v2/protocol';

const id = '11111111-1111-4111-8111-111111111111';
const client = '22222222-2222-4222-8222-222222222222';
const connection = '33333333-3333-4333-8333-333333333333';
const requestId = '44444444-4444-4444-8444-444444444444';
const frameId = '55555555-5555-4555-8555-555555555555';
const request = (path: string, body: unknown, device = false) => new Request(`https://app.tulzo.test${path}`, {
  method: 'POST', headers: { origin: 'https://app.tulzo.test', 'content-type': 'application/json', ...(device ? { authorization: 'Bearer synthetic-key' } : {}) }, body: JSON.stringify(body),
});
const jwt = (claims: object) => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
let server: WebSocketServer;
let subscriptions: Map<WebSocket, string>;
let received: Array<Record<string, unknown>>;
let streams: ReadableStreamDefaultReader<Uint8Array>[];

beforeEach(async () => {
  state.active = true; state.keyOwner = 'owner'; state.sessionStatus = 'active'; state.plan = 'pro'; state.failKey = false; state.hold = null; state.idCalls = 0; state.failIdAfter = 0;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.tulzo.test';
  process.env.STORAGE_SUPABASE_URL = 'https://supabase.invalid.test';
  process.env.CHAT_REALTIME_ANON_KEY = jwt({ role: 'anon' });
  process.env.CHAT_BROKER_JWT = jwt({ role: 'tulzo_chat_broker', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });
  process.env.CHAT_RELAY_TOKEN_SECRET = 'A'.repeat(43);
  subscriptions = new Map(); received = []; streams = [];
  server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  state.port = (server.address() as { port: number }).port;
  server.on('connection', (ws) => {
    ws.on('close', () => subscriptions.delete(ws));
    ws.on('message', (raw) => {
      const frame = JSON.parse(raw.toString()) as Record<string, unknown>;
      received.push(frame);
      if (frame.event === 'phx_join') subscriptions.set(ws, frame.topic as string);
      if (frame.event === 'broadcast') {
        for (const [peer, topic] of subscriptions) {
          if (peer !== ws && topic === frame.topic) peer.send(JSON.stringify({ topic, event: 'broadcast', payload: frame.payload }));
        }
      }
      ws.send(JSON.stringify({ topic: frame.topic, event: 'phx_reply', ref: frame.ref, join_ref: '1', payload: { status: 'ok', response: {} } }));
    });
  });
});
afterEach(async () => {
  for (const reader of streams) await reader.cancel().catch(() => {});
  for (const ws of server.clients) ws.terminate();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});

async function next(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const data = await reader.read();
  if (!data.value) throw new Error('stream ended');
  const content = new TextDecoder().decode(data.value);
  const match = content.match(/^event:([^\n]+)\ndata:([^\n]+)\n\n$/);
  if (!match) throw new Error('bad synthetic event');
  return { event: match[1], data: JSON.parse(match[2]) as Record<string, string> };
}

describe('actual routes through a synthetic local WebSocket broker', () => {
  it('returns a no-store response for unsupported methods', async () => {
    const response = await viewerStreamGet();
    expect(response.status).toBe(405);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization, Origin');
  });
  it('joins before READY and forwards a request and frame without DB inbox or HTTP fallback', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const log = vi.spyOn(console, 'log');
    const err = vi.spyOn(console, 'error');
    const device = await deviceStream(request('/device/stream', { protocol: 2, connectionId: connection }, true));
    expect(device.status).toBe(200);
    const dr = device.body!.getReader(); streams.push(dr);
    const deviceReady = await next(dr); expect(deviceReady.event).toBe('ready');
    const viewer = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    expect(viewer.status).toBe(200);
    const vr = viewer.body!.getReader(); streams.push(vr);
    const viewerReady = await next(vr); expect(viewerReady.event).toBe('ready');
    const call = viewerRequests(request('/viewer/requests', { protocol: 2, viewerToken: viewerReady.data.viewerToken, request: { requestId, expiresAt: new Date(Date.now() + 10000).toISOString(), op: { kind: 'hello' } } }));
    const event = await next(dr); expect(event.event).toBe('request');
    expect((await call).status).toBe(202);
    const part = { frameId, requestId, index: 0, count: 1, sha256: 'a'.repeat(64), data: Buffer.from('synthetic-sensitive-sentinel').toString('base64') };
    const frameCall = deviceFrames(request('/device/frames', { protocol: 2, deviceToken: deviceReady.data.deviceToken, viewerToken: viewerReady.data.viewerToken, part }, true));
    const frame = await next(vr); expect(frame.event).toBe('frame');
    expect(frame.data.deviceId).toBe(id);
    expect((await frameCall).status).toBe(202);
    expect(received.filter((item) => item.event === 'phx_join')).toHaveLength(4);
    expect(received.filter((item) => item.event === 'broadcast')).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(err).not.toHaveBeenCalled();
  });

  it('rejects a revoked viewer session before publishing a device frame', async () => {
    const device = await deviceStream(request('/device/stream', { protocol: 2, connectionId: connection }, true));
    const dr = device.body!.getReader(); streams.push(dr); const dt = (await next(dr)).data.deviceToken;
    const viewer = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    const vr = viewer.body!.getReader(); streams.push(vr); const vt = (await next(vr)).data.viewerToken;
    state.sessionStatus = 'revoked';
    const response = await deviceFrames(request('/device/frames', { protocol: 2, deviceToken: dt, viewerToken: vt, part: { frameId, requestId, index: 0, count: 1, sha256: 'a'.repeat(64), data: 'e30=' } }, true));
    expect(response.status).toBe(401);
    expect(received.filter((item) => item.event === 'broadcast')).toHaveLength(0);
  });

  it('does not open a viewer stream for another user’s device key', async () => {
    state.keyOwner = 'attacker';
    const response = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    expect(response.status).toBe(404);
    expect(received.filter((item) => item.event === 'phx_join')).toHaveLength(0);
  });

  it('requires an active paid plan before opening a viewer stream', async () => {
    state.plan = 'free';
    const response = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    expect(response.status).toBe(403);
    expect(received.filter((item) => item.event === 'phx_join')).toHaveLength(0);
  });

  it('rejects a viewer capability scoped to a different device principal', async () => {
    const device = await deviceStream(request('/device/stream', { protocol: 2, connectionId: connection }, true));
    const dr = device.body!.getReader(); streams.push(dr); const dt = (await next(dr)).data.deviceToken;
    const now = Math.floor(Date.now() / 1000);
    const foreignViewer = issueToken({ v: 2, aud: 'viewer', userId: 'attacker', deviceId: id, streamId: id, clientId: client, iat: now, exp: now + 45, nonce: frameId, viewerSessionId: 'attacker-session' }, process.env.CHAT_RELAY_TOKEN_SECRET!);
    const response = await deviceFrames(request('/device/frames', {
      protocol: 2, deviceToken: dt, viewerToken: foreignViewer,
      part: { frameId, requestId, index: 0, count: 1, sha256: 'a'.repeat(64), data: 'e30=' },
    }, true));
    expect(response.status).toBe(401);
    expect(received.filter((item) => item.event === 'broadcast')).toHaveLength(0);
  });

  it('does not forward a foreign device frame even if the private broker sends one', async () => {
    const viewer = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    const vr = viewer.body!.getReader(); streams.push(vr); const ready = await next(vr);
    const topic = `realtime:tc2:v:${ready.data.streamId}`;
    const subscriber = [...subscriptions.entries()].find(([, name]) => name === topic)?.[0];
    expect(subscriber).toBeDefined();
    subscriber!.send(JSON.stringify({ topic, event: 'broadcast', payload: { type: 'broadcast', event: 'relay', payload: { protocol: 2, deviceId: '66666666-6666-4666-8666-666666666666', viewerStreamId: ready.data.streamId, connectionId: connection, part: { frameId, requestId, index: 0, count: 1, sha256: 'a'.repeat(64), data: 'e30=' } } } }));
    expect((await next(vr)).event).toBe('closing');
  });

  it('fails closed without logging a key provider failure', async () => {
    const error = vi.spyOn(console, 'error');
    state.failKey = true;
    const response = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'broker_unavailable' });
    expect(error).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it('closes the joined socket when fresh startup authorization fails', async () => {
    state.failIdAfter = 2;
    const closed = new Promise<void>((resolve) => server.once('connection', (ws) => ws.once('close', () => resolve())));
    const response = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    expect(response.status).toBe(503);
    await closed;
    expect(received.filter((item) => item.event === 'phx_join')).toHaveLength(1);
    expect(received.filter((item) => item.event === 'broadcast')).toHaveLength(0);
  });

  it('accepts a broker ACK with no device subscriber without implying PC presence', async () => {
    const viewer = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    const vr = viewer.body!.getReader(); streams.push(vr); const ready = await next(vr);
    const response = await viewerRequests(request('/viewer/requests', { protocol: 2, viewerToken: ready.data.viewerToken, request: { requestId, expiresAt: new Date(Date.now() + 10000).toISOString(), op: { kind: 'hello' } } }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, requestId });
    expect(received.filter((item) => item.event === 'broadcast')).toHaveLength(1);
  });

  it('authenticates before consuming the body', async () => {
    state.sessionStatus = 'revoked';
    const req = request('/viewer/stream', { sentinel: 'do-not-consume' });
    const response = await viewerStream(req);
    expect(response.status).toBe(401);
    expect(req.bodyUsed).toBe(false);
  });

  it('continues sending fresh heartbeats to a reader that consumes them', async () => {
    const viewer = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    const vr = viewer.body!.getReader(); streams.push(vr); expect((await next(vr)).event).toBe('ready');
    let previousServerTime = 0;
    let previousAuthorizedUntil = 0;
    for (let i = 0; i < 3; i++) {
      const heartbeat = await next(vr);
      expect(heartbeat.event, `${i} ${JSON.stringify(heartbeat.data)}`).toBe('heartbeat');
      const serverTime = Date.parse(heartbeat.data.serverTime);
      const authorizedUntil = Date.parse(heartbeat.data.authorizedUntil);
      expect(serverTime).toBeGreaterThan(previousServerTime);
      expect(authorizedUntil).toBeGreaterThan(previousAuthorizedUntil);
      expect(authorizedUntil).toBeGreaterThan(Date.now());
      previousServerTime = serverTime;
      previousAuthorizedUntil = authorizedUntil;
    }
    expect(state.idCalls).toBeGreaterThanOrEqual(5);
  });

  it('closes before stale authorization can release a delayed frame', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const device = await deviceStream(request('/device/stream', { protocol: 2, connectionId: connection }, true));
    const dr = device.body!.getReader(); streams.push(dr); const dt = (await next(dr)).data.deviceToken;
    const viewer = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
    const vr = viewer.body!.getReader(); streams.push(vr); const vt = (await next(vr)).data.viewerToken;
    let start!: () => void; let release!: () => void;
    const started = new Promise<void>((resolve) => { start = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    state.hold = async () => { start(); await held; };
    try {
      const call = deviceFrames(request('/device/frames', { protocol: 2, deviceToken: dt, viewerToken: vt, part: { frameId, requestId, index: 0, count: 1, sha256: 'a'.repeat(64), data: 'e30=' } }, true));
      await started;
      await call;
      const read = vr.read();
      await vi.advanceTimersByTimeAsync(5001);
      const outcome = await Promise.race([read, Promise.resolve('pending' as const)]);
      expect(outcome).not.toBe('pending');
      if (outcome !== 'pending') expect(new TextDecoder().decode(outcome.value)).toContain('event:closing');
    } finally { release(); state.hold = null; vi.useRealTimers(); }
  });

  it('discards a frame still buffered behind a blocked reader when the key is revoked', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    try {
      const device = await deviceStream(request('/device/stream', { protocol: 2, connectionId: connection }, true));
      const dr = device.body!.getReader(); streams.push(dr); const dt = (await next(dr)).data.deviceToken;
      const viewer = await viewerStream(request('/viewer/stream', { protocol: 2, deviceId: id, clientId: client }));
      const vr = viewer.body!.getReader(); streams.push(vr); const vt = (await next(vr)).data.viewerToken;
      const response = await deviceFrames(request('/device/frames', { protocol: 2, deviceToken: dt, viewerToken: vt, part: { frameId, requestId, index: 0, count: 1, sha256: 'a'.repeat(64), data: 'c2VudGluZWw=' } }, true));
      expect(response.status).toBe(202);
      state.active = false;
      await vi.advanceTimersByTimeAsync(2000);
      const result = await vr.read().then((chunk) => chunk.value ? new TextDecoder().decode(chunk.value) : '', () => 'closed');
      expect(result).not.toContain('event:frame');
      expect(result).not.toContain('c2VudGluZWw=');
    } finally { vi.useRealTimers(); }
  });
});
