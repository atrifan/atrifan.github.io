/// <reference types="vite/client" />
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  clerkUserId: 'owner-A',
  clerkSessionId: 'clerk-session-A',
  tableCalls: [] as Array<{ table: string; operation: string }>,
  rpcCalls: [] as string[],
  logLines: [] as string[],
}));

const API_KEYS = [
  { id: '00000000-0000-4000-8000-0000000000a1', user_id: 'owner-A', plan: 'pro', is_active: true, api_key_hash: 'hash-device-A1-pro', server_name: 'fixture-A1', device_name: 'Fixture A1', provider: 'custom', name: 'fixture', api_key_suffix: 'A1pr' },
  { id: '00000000-0000-4000-8000-0000000000a2', user_id: 'owner-A', plan: 'plus', is_active: true, api_key_hash: 'hash-device-A2-plus', server_name: 'fixture-A2', device_name: 'Fixture A2', provider: 'custom', name: 'fixture', api_key_suffix: 'A2pl' },
  { id: '00000000-0000-4000-8000-0000000000b1', user_id: 'owner-B', plan: 'pro', is_active: true, api_key_hash: 'hash-device-B1-pro', server_name: 'fixture-B1', device_name: 'Fixture B1', provider: 'custom', name: 'fixture', api_key_suffix: 'B1pr' },
  { id: '00000000-0000-4000-8000-0000000000a3', user_id: 'owner-A', plan: 'pro', is_active: false, api_key_hash: 'hash-device-A3-revoked', server_name: 'fixture-A3', device_name: 'Fixture A3', provider: 'custom', name: 'fixture', api_key_suffix: 'A3rv' },
  { id: '00000000-0000-4000-8000-0000000000a4', user_id: 'owner-A', plan: 'free', is_active: true, api_key_hash: 'hash-device-A4-free', server_name: 'fixture-A4', device_name: 'Fixture A4', provider: 'custom', name: 'fixture', api_key_suffix: 'A4fr' },
];

vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: fixture.clerkUserId, sessionId: fixture.clerkSessionId, sessionClaims: {} }),
  currentUser: async () => ({ id: fixture.clerkUserId }),
  clerkClient: async () => ({ users: { getUser: async (id: string) => ({ id }) } }),
  verifyToken: async () => ({ sub: fixture.clerkUserId, sid: fixture.clerkSessionId }),
}));

vi.mock('@/src/lib/supabase-services', () => ({
  hashApiKey: (key: string) => `hash-${key.replace(/^ak_test_/, '')}`,
  getApiKeyByHash: async (hash: string) => API_KEYS.find((key) => key.api_key_hash === hash) ?? null,
  getApiKeyById: async (id: string) => API_KEYS.find((key) => key.id === id) ?? null,
  getApiKeysByUser: async (userId: string) => API_KEYS.filter((key) => key.user_id === userId),
  getDevicesWithHeartbeats: async () => [],
}));

vi.mock('@supabase/supabase-js', () => {
  function builder(table: string) {
    fixture.tableCalls.push({ table, operation: 'read' });
    const b: Record<string, unknown> = {};
    let operation = 'read';
    const chain = () => b;
    for (const method of ['select', 'order', 'limit', 'range', 'filter', 'match', 'or', 'not', 'is', 'like', 'ilike', 'contains', 'neq', 'eq', 'in', 'gt', 'gte', 'lt', 'lte', 'abortSignal', 'returns']) {
      b[method] = chain;
    }
    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      b[method] = () => {
        operation = method;
        fixture.tableCalls.push({ table, operation });
        return b;
      };
    }
    b.single = async () => ({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    b.maybeSingle = async () => ({ data: null, error: null });
    b.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      fixture.tableCalls.push({ table, operation });
      return Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
    };
    return b;
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: async (name: string) => {
      fixture.rpcCalls.push(name);
      return { data: null, error: null };
    },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), send: async () => 'ok', subscribe: () => ({}) }),
    removeChannel: async () => 'ok',
  };
  return { createClient: () => client };
});

vi.mock('@/src/lib/supabase', () => {
  const fake = {
    from: (table: string) => {
      fixture.tableCalls.push({ table, operation: 'read' });
      throw new Error(`unexpected direct Supabase access to ${table}`);
    },
    rpc: async (name: string) => {
      fixture.rpcCalls.push(name);
      throw new Error(`unexpected Supabase RPC ${name}`);
    },
  };
  return { supabase: fake, supabaseAdmin: fake, adminSupabase: fake, default: fake };
});

type RouteModule = Record<string, ((request: NextRequest, context?: unknown) => Promise<Response>) | undefined>;
const routeModules = import.meta.glob<RouteModule>('../../app/api/plugin/chat/**/route.ts');
const routeByPath: Record<string, string> = {
  '/api/plugin/chat/p2p/config': '../../app/api/plugin/chat/p2p/config/route.ts',
  '/api/plugin/chat/p2p/viewer/pairs': '../../app/api/plugin/chat/p2p/viewer/pairs/route.ts',
  '/api/plugin/chat/p2p/device/poll': '../../app/api/plugin/chat/p2p/device/poll/route.ts',
  '/api/plugin/chat/p2p/device/answer': '../../app/api/plugin/chat/p2p/device/answer/route.ts',
  '/api/plugin/chat/p2p/state': '../../app/api/plugin/chat/p2p/state/route.ts',
  '/api/plugin/chat/p2p/authorize': '../../app/api/plugin/chat/p2p/authorize/route.ts',
  '/api/plugin/chat/p2p/close': '../../app/api/plugin/chat/p2p/close/route.ts',
  '/api/plugin/chat/sessions': '../../app/api/plugin/chat/sessions/route.ts',
  '/api/plugin/chat/sessions/[id]': '../../app/api/plugin/chat/sessions/[id]/route.ts',
  '/api/plugin/chat/sessions/[id]/messages': '../../app/api/plugin/chat/sessions/[id]/messages/route.ts',
  '/api/plugin/chat/send': '../../app/api/plugin/chat/send/route.ts',
  '/api/plugin/chat/receive': '../../app/api/plugin/chat/receive/route.ts',
  '/api/plugin/chat/poll': '../../app/api/plugin/chat/poll/route.ts',
  '/api/plugin/chat/emit': '../../app/api/plugin/chat/emit/route.ts',
};

const DEVICE_A1 = API_KEYS[0].id;
const SESSION_ID = '00000000-0000-4000-8000-0000000000c1';
const OFFER_NONCE = '00000000-0000-4000-8000-0000000000d1';
const CLIENT_ID = '00000000-0000-4000-8000-0000000000e1';
const OFFER: Description = {
  originId: '1826242014877713395',
  originVersion: '2',
  iceUfrag: 'A1b2C3d4',
  icePwd: 'AbCdEfGhIjKlMnOpQrStUv',
  fingerprint: '00:01:02:03:04:05:06:07:08:09:0A:0B:0C:0D:0E:0F:10:11:12:13:14:15:16:17:18:19:1A:1B:1C:1D:1E:1F',
  setup: 'actpass',
  sctpPort: 5000,
  maxMessageSize: 65536,
  candidates: [
    { foundation: '2', priority: 1694498815, address: 'peer-a.local', port: 54001, kind: 'host', relatedAddress: null, relatedPort: null },
    { foundation: '1', priority: 2130706431, address: '192.0.2.10', port: 54000, kind: 'host', relatedAddress: null, relatedPort: null },
  ],
  iceComplete: true,
};

interface Description {
  originId: string;
  originVersion: string;
  iceUfrag: string;
  icePwd: string;
  fingerprint: string;
  setup: 'actpass' | 'active' | 'passive';
  sctpPort: 5000;
  maxMessageSize: number;
  candidates: Array<{
    foundation: string;
    priority: number;
    address: string;
    port: number;
    kind: 'host' | 'srflx' | 'prflx';
    relatedAddress: string | null;
    relatedPort: number | null;
  }>;
  iceComplete: true;
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const sortedCandidates = (description: Description) => [...description.candidates]
  .map((candidate) => [candidate.foundation, candidate.priority, candidate.address, candidate.port, candidate.kind, candidate.relatedAddress, candidate.relatedPort])
  .sort((a, b) => {
    const left = JSON.stringify(a);
    const right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
const descriptionHash = (description: Description) => sha256(JSON.stringify([
  description.originId,
  description.originVersion,
  description.iceUfrag,
  description.icePwd,
  description.fingerprint,
  description.setup,
  description.sctpPort,
  description.maxMessageSize,
  true,
  sortedCandidates(description),
]));
const OFFER_HASH_VECTOR = '291dd41edb6e8005025ff978c78f5930d4f1f96b8689822841a80258b3957952';

function resetFixture(): void {
  fixture.clerkUserId = 'owner-A';
  fixture.clerkSessionId = 'clerk-session-A';
  fixture.tableCalls.length = 0;
  fixture.rpcCalls.length = 0;
  fixture.logLines.length = 0;
}

async function dispatch(pathname: string, method: string, body?: unknown, headers: HeadersInit = {}): Promise<Response> {
  const url = new URL(pathname, 'http://localhost:3000');
  const routePath = url.pathname;
  const modulePath = routeByPath[routePath]
    ?? (routePath.match(/^\/api\/plugin\/chat\/sessions\/[^/]+\/messages$/) ? routeByPath['/api/plugin/chat/sessions/[id]/messages'] : undefined)
    ?? (routePath.match(/^\/api\/plugin\/chat\/sessions\/[^/]+$/) ? routeByPath['/api/plugin/chat/sessions/[id]'] : undefined);
  const loader = modulePath ? routeModules[modulePath] : undefined;
  if (!loader) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const route = await loader();
  const handler = route[method.toUpperCase()];
  if (!handler) return Response.json({ error: 'not_found' }, { status: 404 });
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has('content-type')) requestHeaders.set('content-type', 'application/json');
  const request = new NextRequest(url, {
    method,
    headers: requestHeaders,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const context = routePath.includes('/sessions/') ? { params: Promise.resolve({ id: SESSION_ID }) } : undefined;
  return handler(request, context);
}

function controlHeaders(): Record<string, string> {
  return { origin: 'http://localhost:3000', cookie: '__session=synthetic-clerk-session' };
}

function legacyHeaders(pathname: string): Record<string, string> {
  return pathname.endsWith('/poll') || pathname.endsWith('/emit')
    ? { authorization: 'Bearer ak_test_device-A1-pro' }
    : controlHeaders();
}

function expectPrivateResponse(response: Response): void {
  expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate');
  expect(response.headers.get('cdn-cache-control')).toBe('no-store');
  expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
  expect(response.headers.get('expires')).toBe('0');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('vary')).toBe('Cookie, Authorization, Origin');
}

beforeEach(() => resetFixture());
afterEach(() => vi.restoreAllMocks());

describe('approved direct P2P v2 control-wire endpoints', () => {
  it.each(Object.keys(routeByPath).filter((pathname) => pathname.includes('/p2p/')))(
    'publishes POST %s as a real control endpoint, not a missing-route 404',
    async (pathname) => {
      const modulePath = routeByPath[pathname];
      expect(routeModules[modulePath], `${pathname} is absent; the dispatcher intentionally reports only a test-side 404`).toBeDefined();
    },
  );

  it('answers authenticated device poll with an empty, key-scoped control list', async () => {
    const response = await dispatch('/api/plugin/chat/p2p/device/poll', 'POST', {
      protocol: 2,
      deviceInstanceId: '00000000-0000-4000-8000-0000000000d2',
    }, { authorization: 'Bearer ak_test_device-A1-pro' });
    expect(response.status).toBe(200);
    expectPrivateResponse(response);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['protocol', 'serverTime', 'pairs'].sort());
    expect(body).toMatchObject({ protocol: 2, pairs: [] });
    expect(body.serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('returns the canonical owner-bound config with no default public STUN/TURN', async () => {
    const response = await dispatch('/api/plugin/chat/p2p/config', 'POST', { deviceId: DEVICE_A1 }, controlHeaders());
    expect(response.status).toBe(200);
    expectPrivateResponse(response);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(['deviceId', 'iceServers', 'ownerUserId', 'protocol', 'serverTime'].sort());
    expect(body).toMatchObject({ protocol: 2, deviceId: DEVICE_A1, ownerUserId: 'owner-A', iceServers: [] });
    expect(body.serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(JSON.stringify(body)).not.toMatch(/turns?:|stun:/i);
  });

  it('creates only a typed offered record and hashes the approved independent description vector', async () => {
    expect(descriptionHash(OFFER)).toBe(OFFER_HASH_VECTOR);
    const response = await dispatch('/api/plugin/chat/p2p/viewer/pairs', 'POST', {
      protocol: 2,
      deviceId: DEVICE_A1,
      clientId: CLIENT_ID,
      offerNonce: OFFER_NONCE,
      offer: OFFER,
    }, controlHeaders());
    expect(response.status).toBe(201);
    expectPrivateResponse(response);
    const pair = await response.json();
    expect(Object.keys(pair).sort()).toEqual([
      'protocol', 'pairId', 'deviceId', 'clientId', 'state', 'createdAt', 'negotiationExpiresAt', 'expiresAt',
      'serverTime', 'offerNonce', 'offer', 'offerHash', 'deviceInstanceId', 'answerNonce', 'answer', 'answerHash', 'bindingHash', 'iceServers',
    ].sort());
    expect(pair).toMatchObject({ protocol: 2, deviceId: DEVICE_A1, clientId: CLIENT_ID, state: 'offered', offerNonce: OFFER_NONCE, offer: OFFER, iceServers: [] });
    expect(pair.pairId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    for (const field of ['createdAt', 'negotiationExpiresAt', 'expiresAt', 'serverTime']) {
      expect(pair[field]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    expect(pair.offerHash).toBe(OFFER_HASH_VECTOR);
    expect(pair).toMatchObject({ deviceInstanceId: null, answerNonce: null, answer: null, answerHash: null, bindingHash: null });
    expect(JSON.stringify(pair)).not.toContain('owner-A');
    expect(JSON.stringify(pair)).not.toContain('clerk-session-A');
  });

  it.each([
    ['unknown top-level field', { protocol: 2, deviceId: DEVICE_A1, privateLabel: 'synthetic-conversation-sentinel' }],
    ['non-data media candidate', { protocol: 2, deviceId: DEVICE_A1, clientId: CLIENT_ID, offerNonce: OFFER_NONCE, offer: { ...OFFER, media: 'audio' } }],
    ['TURN candidate', { protocol: 2, deviceId: DEVICE_A1, clientId: CLIENT_ID, offerNonce: OFFER_NONCE, offer: { ...OFFER, candidates: [{ foundation: 'abc', priority: 1, address: 'relay.invalid', port: 3478, kind: 'relay', relatedAddress: null, relatedPort: null }] } }],
    ['URL in candidate address', { protocol: 2, deviceId: DEVICE_A1, clientId: CLIENT_ID, offerNonce: OFFER_NONCE, offer: { ...OFFER, candidates: [{ foundation: 'abc', priority: 1, address: 'https://example.invalid/path', port: 443, kind: 'host', relatedAddress: null, relatedPort: null }] } }],
  ])('rejects %s as a strict data-only control schema', async (_label, body) => {
    const response = await dispatch('/api/plugin/chat/p2p/viewer/pairs', 'POST', body, controlHeaders());
    expect(response.status).toBe(400);
    expectPrivateResponse(response);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
    expect(JSON.stringify(fixture.tableCalls)).not.toContain('synthetic-conversation-sentinel');
  });

  it('rejects unauthorized and foreign-origin viewer requests before creating control state', async () => {
    const noOrigin = await dispatch('/api/plugin/chat/p2p/config', 'POST', { deviceId: DEVICE_A1 }, { cookie: '__session=synthetic' });
    const foreignOrigin = await dispatch('/api/plugin/chat/p2p/config', 'POST', { deviceId: DEVICE_A1 }, { ...controlHeaders(), origin: 'https://attacker.invalid' });
    expect(noOrigin.status).toBe(403);
    expect(await noOrigin.json()).toEqual({ error: 'forbidden_origin' });
    expect(foreignOrigin.status).toBe(403);
    expect(await foreignOrigin.json()).toEqual({ error: 'forbidden_origin' });
    expect(fixture.tableCalls.filter(({ table }) => table === 'device_peer_pairings')).toEqual([]);
  });

  it('does not fall back from an invalid Bearer key to an otherwise valid Clerk session', async () => {
    const response = await dispatch('/api/plugin/chat/p2p/config', 'POST', {}, {
      ...controlHeaders(),
      authorization: 'Bearer ak_test_invalid_device_key',
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
  });

  it('does not disclose a device owned by another Clerk user', async () => {
    const response = await dispatch('/api/plugin/chat/p2p/config', 'POST', { deviceId: API_KEYS[2].id }, controlHeaders());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'device_not_found' });
    expect(JSON.stringify(await response.clone().text())).not.toContain('owner-B');
  });

  it('enforces the actual streamed-byte cap when Content-Length is absent', async () => {
    const oversized = JSON.stringify({
      protocol: 2,
      deviceId: DEVICE_A1,
      clientId: CLIENT_ID,
      offerNonce: OFFER_NONCE,
      offer: { ...OFFER, icePwd: 'x'.repeat(33_000) },
    });
    const response = await dispatch('/api/plugin/chat/p2p/viewer/pairs', 'POST', oversized, controlHeaders());
    expect(response.status).toBe(413);
    expectPrivateResponse(response);
    expect(await response.json()).toEqual({ error: 'payload_too_large' });
  });
});

describe('legacy chat cutover preserves old data and never touches chat storage', () => {
  const legacyRequests: Array<[string, string, unknown?]> = [
    ['/api/plugin/chat/sessions', 'GET'],
    ['/api/plugin/chat/sessions', 'POST', { api_key_id: DEVICE_A1 }],
    ['/api/plugin/chat/sessions/[id]', 'GET'],
    ['/api/plugin/chat/sessions/[id]', 'PATCH', { title: 'synthetic-title-not-to-cloud' }],
    ['/api/plugin/chat/sessions/[id]', 'DELETE'],
    ['/api/plugin/chat/sessions/[id]/messages', 'GET'],
    ['/api/plugin/chat/send', 'POST', { session_id: SESSION_ID, frame: { type: 'SEND_MESSAGE', text: 'synthetic-message-never-cloud' } }],
    [`/api/plugin/chat/receive?session_id=${SESSION_ID}&after=0`, 'GET'],
    ['/api/plugin/chat/poll', 'GET'],
    ['/api/plugin/chat/emit', 'POST', { session_id: SESSION_ID, frame: { type: 'SYNTHETIC_RESULT', value: 'synthetic-result-never-cloud' } }],
  ];

  it.each(legacyRequests)('%s %s returns authenticated 410 upgrade_required without chat DB reads/writes', async (routePath, method, body) => {
    const requestUrl = routePath.includes('[id]') ? routePath.replace('[id]', SESSION_ID) : routePath;
    const pathname = new URL(requestUrl, 'http://localhost:3000').pathname;
    const response = await dispatch(requestUrl, method, body, legacyHeaders(routePath));
    const chatAccess = fixture.tableCalls.filter(({ table }) => /(?:^|_)chat(?:_|$)|remote_chat/i.test(table));
    expect.soft(chatAccess, `${method} ${pathname} must not read or write chat tables`).toEqual([]);
    expect.soft(fixture.rpcCalls, `${method} ${pathname} must not call a chat storage RPC`).toEqual([]);
    expect.soft(response.status).toBe(410);
    expect.soft(response.headers.get('cache-control')).toBe('private, no-store, max-age=0, must-revalidate');
    expect.soft(response.headers.get('cdn-cache-control')).toBe('no-store');
    expect.soft(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
    expect.soft(response.headers.get('pragma')).toBe('no-cache');
    expect.soft(response.headers.get('expires')).toBe('0');
    expect.soft(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect.soft(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect.soft(response.headers.get('vary')).toBe('Cookie, Authorization, Origin');
    expect.soft(await response.json()).toEqual({ error: 'upgrade_required', protocol: 2 });
  });

  it('does not log old conversation sentinels while upgrading legacy callers', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => fixture.logLines.push(values.map(String).join(' ')));
    const warn = vi.spyOn(console, 'warn').mockImplementation((...values: unknown[]) => fixture.logLines.push(values.map(String).join(' ')));
    const error = vi.spyOn(console, 'error').mockImplementation((...values: unknown[]) => fixture.logLines.push(values.map(String).join(' ')));
    const response = await dispatch('/api/plugin/chat/send', 'POST', { session_id: SESSION_ID, frame: { text: 'synthetic-private-log-sentinel' } }, controlHeaders());
    expect(response.status).toBe(410);
    expect(fixture.logLines.join('\n')).not.toContain('synthetic-private-log-sentinel');
    log.mockRestore();
    warn.mockRestore();
    error.mockRestore();
  });
});
