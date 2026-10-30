/// <reference types="vite/client" />
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';

const boundary = vi.hoisted(() => {
  type DbCall = {
    table: string;
    operation: string;
    allowed: boolean;
    filters: Array<{ operator: string; column: string; value: unknown }>;
  };
  const calls: DbCall[] = [];
  const allowedTables = new Set([
    'api_keys', 'users', 'profiles', 'user_profiles', 'subscriptions',
    'user_subscriptions', 'devices', 'device_presence', 'user_presence', 'device_heartbeats',
  ]);
  const keyRecords = [
    {
      id: '11111111-1111-4111-8111-111111111111', user_id: 'relay-user-a',
      api_key_hash: 'e60b7024c6f49b19df312c61fdad407e1fce189289916cf3acaaf9d8781ef8c9',
      name: 'synthetic-A1', device_name: 'synthetic-device-A1', plan: 'pro',
      is_active: true, revoked_at: null, expires_at: null,
    },
    {
      id: '44444444-4444-4444-8444-444444444444', user_id: 'relay-user-a',
      api_key_hash: '4496a85be4477a0f14427a2e630a6cd63bd8c397317626bcef7bd80e34fa0cd2',
      name: 'synthetic-A2', device_name: 'synthetic-device-A2', plan: 'plus',
      is_active: true, revoked_at: null, expires_at: null,
    },
    {
      id: '55555555-5555-4555-8555-555555555555', user_id: 'relay-user-b',
      api_key_hash: '12edb43e12f1aae96aae71ec796869358b4253945eb99c8859150d6b0a380c3f',
      name: 'synthetic-B1', device_name: 'synthetic-device-B1', plan: 'pro',
      is_active: true, revoked_at: null, expires_at: null,
    },
    {
      id: '66666666-6666-4666-8666-666666666666', user_id: 'relay-user-a',
      api_key_hash: 'c39096da68f9cd1f2800b7a41346e03ce94a4b3c10415a3320a118f061f1c281',
      name: 'synthetic-A3-revoked', device_name: 'synthetic-device-A3', plan: 'pro',
      is_active: false, revoked_at: '2026-01-01T00:00:00.000Z', expires_at: null,
    },
    {
      id: '77777777-7777-4777-8777-777777777777', user_id: 'relay-user-a',
      api_key_hash: 'fa65ed85c1a00da0188fa6398ce7642d30ac2403243893e09d3d174bf4628676',
      name: 'synthetic-A4-free', device_name: 'synthetic-device-A4', plan: 'free',
      is_active: true, revoked_at: null, expires_at: null,
    },
  ];
  const clerk = { userId: 'relay-user-a' as string | null, sessionId: 'relay-session-a' as string | null };

  function matches(table: string, filters: DbCall['filters']): Array<Record<string, unknown>> {
    if (!allowedTables.has(table)) return [];
    const records: Array<Record<string, unknown>> = table === 'api_keys'
      ? keyRecords
      : table === 'users' || table === 'profiles' || table === 'user_profiles'
        ? [{ id: 'relay-user-a', plan: 'pro' }, { id: 'relay-user-b', plan: 'pro' }]
        : [];
    return records.filter((record) => filters.every(({ operator, column, value }) => {
      const actual = record[column];
      if (operator === 'in') return Array.isArray(value) && value.includes(actual);
      if (operator === 'is') return actual === value;
      if (operator === 'neq') return actual !== value;
      return actual === value;
    }));
  }

  function createClient() {
    return {
      from(table: string) {
        let operation = 'select';
        const call: DbCall = { table, operation, allowed: allowedTables.has(table), filters: [] };
        calls.push(call);
        const result = () => {
          const rows = matches(table, call.filters);
          return call.allowed
            ? { data: rows, error: null, count: rows.length }
            : { data: null, error: { message: 'Synthetic DB allowlist rejected this table' }, count: null };
        };
        const query = new Proxy({}, {
          get(_target, property) {
            if (property === 'then') {
              return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
                return Promise.resolve(result()).then(resolve, reject);
              };
            }
            if (property === 'single' || property === 'maybeSingle') {
              return async () => {
                const found = result();
                const rows = Array.isArray(found.data) ? found.data : [];
                return { ...found, data: rows[0] ?? null };
              };
            }
            if (property === 'eq' || property === 'in' || property === 'is' || property === 'neq') {
              return (column: string, value: unknown) => {
                call.filters.push({ operator: String(property), column, value });
                return query;
              };
            }
            if (property === 'select' || property === 'insert' || property === 'update' ||
                property === 'upsert' || property === 'delete') {
              if (property !== 'select' || operation === 'select') operation = String(property);
              call.operation = operation;
              return () => query;
            }
            if (typeof property === 'string') return () => query;
            return undefined;
          },
        });
        return query;
      },
    };
  }

  return { calls, allowedTables, clerk, createClient };
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: boundary.clerk.userId, sessionId: boundary.clerk.sessionId })),
  currentUser: vi.fn(async () => boundary.clerk.userId ? ({ id: boundary.clerk.userId }) : null),
  clerkClient: vi.fn(async () => ({
    sessions: {
      getSession: vi.fn(async (sessionId: string) => ({
        id: sessionId,
        status: 'active',
        userId: sessionId === 'relay-session-b' ? 'relay-user-b' : 'relay-user-a',
      })),
    },
  })),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: boundary.createClient }));

type Handler = (request: Request, context?: { params?: Record<string, string> }) =>
  Response | Promise<Response>;
type RouteModule = Record<string, unknown>;

const routeModules = import.meta.glob('../../app/api/plugin/chat/**/route.ts');
const routePaths = {
  viewerStream: '/api/plugin/chat/v2/viewer/stream',
  viewerRequests: '/api/plugin/chat/v2/viewer/requests',
  deviceStream: '/api/plugin/chat/v2/device/stream',
  deviceFrames: '/api/plugin/chat/v2/device/frames',
  sessions: '/api/plugin/chat/sessions',
  session: '/api/plugin/chat/sessions/00000000-0000-4000-8000-0000000000a1',
  messages: '/api/plugin/chat/sessions/00000000-0000-4000-8000-0000000000a1/messages',
  send: '/api/plugin/chat/send',
  receive: '/api/plugin/chat/receive',
  poll: '/api/plugin/chat/poll',
  emit: '/api/plugin/chat/emit',
} as const;

const routeSuffixes = {
  viewerStream: '/v2/viewer/stream/route.ts',
  viewerRequests: '/v2/viewer/requests/route.ts',
  deviceStream: '/v2/device/stream/route.ts',
  deviceFrames: '/v2/device/frames/route.ts',
  sessions: '/sessions/route.ts',
  session: '/sessions/[id]/route.ts',
  messages: '/sessions/[id]/messages/route.ts',
  send: '/send/route.ts',
  receive: '/receive/route.ts',
  poll: '/poll/route.ts',
  emit: '/emit/route.ts',
} as const;

const UUID_DEVICE = '11111111-1111-4111-8111-111111111111';
const UUID_CLIENT = '22222222-2222-4222-8222-222222222222';
const UUID_CONNECTION = '33333333-3333-4333-8333-333333333333';
const UUID_DEVICE_B = '55555555-5555-4555-8555-555555555555';
const UUID_OTHER = '88888888-8888-4888-8888-888888888888';
const TOKEN_SECRET = 'synthetic-relay-token-secret-32-bytes';
const apiKeys = {
  A1: 'relay_synthetic_key_A1_only',
  A2: 'relay_synthetic_key_A2_only',
  B1: 'relay_synthetic_key_B1_only',
  A3: 'relay_synthetic_key_A3_revoked',
  A4: 'relay_synthetic_key_A4_free',
};
const httpMethods = ['GET', 'POST', 'PATCH', 'DELETE'] as const;
function pathFor(key: keyof typeof routePaths): string {
  return Object.keys(routeModules).find((path) => path.endsWith(routeSuffixes[key])) ?? '';
}

async function dispatch(
  key: keyof typeof routePaths,
  method: string,
  options: {
    body?: unknown;
    streamBody?: ReadableStream<Uint8Array>;
    auth?: 'viewer' | 'device' | 'none';
    bearer?: string;
    userId?: string | null;
    sessionId?: string | null;
    origin?: string;
  } = {},
): Promise<Response> {
  const headers = new Headers({
    'content-type': 'application/json',
  });
  if (options.origin) headers.set('origin', options.origin);
  if (options.auth === 'device' && options.bearer) headers.set('authorization', `Bearer ${options.bearer}`);
  if (options.auth === 'viewer' || (options.userId !== undefined && options.userId !== null)) {
    headers.set('cookie', '__session=synthetic-relay-session');
    headers.set('x-csrf-token', 'synthetic-relay-csrf');
  }
  boundary.clerk.userId = options.userId !== undefined
    ? options.userId
    : options.auth === 'viewer' ? 'relay-user-a' : null;
  boundary.clerk.sessionId = options.sessionId === undefined ? 'relay-session-a' : options.sessionId;
  const init = {
    method,
    headers,
    ...(options.streamBody
      ? { body: options.streamBody, duplex: 'half' }
      : method === 'GET' || method === 'DELETE'
        ? {}
        : { body: JSON.stringify(options.body ?? {}) }),
  } as ConstructorParameters<typeof NextRequest>[1];
  const request = new NextRequest(`https://app.tulzo.test${routePaths[key]}`, init);
  if (options.streamBody) expect(request.headers.has('content-length'), 'oversize fixture must omit Content-Length').toBe(false);

  const modulePath = pathFor(key);
  // A missing new endpoint is an intentional observable 404, not an import error.
  if (!modulePath) return Response.json({ error: 'test_route_missing' }, { status: 404 });

  const route = await routeModules[modulePath]() as RouteModule;
  const handler = route[method] as Handler | undefined;
  if (typeof handler !== 'function') return new Response(null, { status: 405 });

  const params = key === 'session' || key === 'messages'
    ? { params: { id: '00000000-0000-4000-8000-0000000000a1' } }
    : undefined;
  return handler(request, params);
}

function issueToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function tokenClaims(
  aud: 'viewer' | 'device',
  userId: string,
  deviceId: string,
  sessionId = 'relay-session-a',
  connectionId = UUID_CONNECTION,
): Record<string, unknown> {
  const iat = Math.floor(Date.now() / 1000);
  return {
    v: 2,
    aud,
    userId,
    deviceId,
    streamId: '99999999-9999-4999-8999-999999999999',
    clientId: aud === 'device' ? connectionId : UUID_CLIENT,
    iat,
    exp: iat + 45,
    nonce: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ...(aud === 'viewer' ? { viewerSessionId: sessionId } : { connectionId }),
  };
}

function httpError(response: Response): Promise<string | undefined> {
  const contractCodes = new Set([
    'test_route_missing', 'unauthorized', 'plan_required', 'device_not_found', 'forbidden_origin',
    'invalid_request', 'payload_too_large', 'upgrade_required', 'server_misconfigured',
    'broker_unavailable', 'timeout', 'resync_required', 'stream_expired',
  ]);
  return response.clone().json().then((body: { error?: string }) =>
    typeof body?.error === 'string' && contractCodes.has(body.error) ? body.error : 'unrecognized_error'
  ).catch(() => undefined);
}

function securityHeaderProblems(response: Response): string[] {
  const expected: Record<string, string> = {
    'cache-control': 'private, no-store, max-age=0, must-revalidate',
    'cdn-cache-control': 'no-store',
    'vercel-cdn-cache-control': 'no-store',
    pragma: 'no-cache',
    expires: '0',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  };
  const issues = Object.entries(expected)
    .filter(([name, value]) => response.headers.get(name)?.toLowerCase().replace(/\s+/g, '') !== value.toLowerCase().replace(/\s+/g, ''))
    .map(([name]) => `missing/incorrect ${name}`);
  const vary = response.headers.get('vary')?.toLowerCase().split(',').map((item) => item.trim()) ?? [];
  for (const token of ['cookie', 'authorization', 'origin']) {
    if (!vary.includes(token)) issues.push(`Vary lacks ${token}`);
  }
  return issues;
}

beforeAll(() => {
  // Erase inherited app credentials by name before route import; use only synthetic auth metadata.
  for (const name of Object.keys(process.env)) {
    if (/SUPABASE|CLERK|CHAT_RELAY|API_KEY|SECRET|DATABASE|POSTGRES|REALTIME|BROKER|ENDPOINT|URL|HOST/i.test(name)) delete process.env[name];
  }
  (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  process.env.STORAGE_SUPABASE_URL = 'https://supabase.invalid.test';
  process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-role-not-a-credential';
  process.env.CHAT_RELAY_TOKEN_SECRET = TOKEN_SECRET;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.tulzo.test';
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  boundary.calls.length = 0;
  boundary.clerk.userId = 'relay-user-a';
  boundary.clerk.sessionId = 'relay-session-a';
});

const sameOriginCandidate = 'https://app.tulzo.test';
const frameBytes = Buffer.from('{}').toString('base64');
const frameHash = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
const testFrame = {
  frameId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  index: 0,
  count: 1,
  sha256: frameHash,
  data: frameBytes,
};

const relayCases: Array<{
  name: string;
  key: keyof typeof routePaths;
  options: NonNullable<Parameters<typeof dispatch>[2]>;
  expected: Array<{ status: number; error: string }>;
  tokenFixture?: 'wrong-session' | 'owner-b' | 'owner-a';
}> = [
  {
    name: 'viewer stream rejects unauthenticated Clerk callers', key: 'viewerStream',
    options: { auth: 'viewer', body: { protocol: 2, deviceId: UUID_DEVICE, clientId: UUID_CLIENT }, userId: null, sessionId: null, origin: sameOriginCandidate },
    expected: [{ status: 401, error: 'unauthorized' }],
  },
  {
    name: 'viewer stream does not reveal an unknown device', key: 'viewerStream',
    options: { auth: 'viewer', body: { protocol: 2, deviceId: UUID_OTHER, clientId: UUID_CLIENT }, origin: sameOriginCandidate },
    expected: [{ status: 404, error: 'device_not_found' }],
  },
  {
    name: 'viewer stream does not reveal another owner device', key: 'viewerStream',
    options: { auth: 'viewer', body: { protocol: 2, deviceId: UUID_DEVICE_B, clientId: UUID_CLIENT }, origin: sameOriginCandidate },
    expected: [{ status: 404, error: 'device_not_found' }],
  },
  {
    name: 'viewer request rejects a bad token before parsing its malformed request object', key: 'viewerRequests',
    options: { auth: 'viewer', body: { protocol: 2, viewerToken: 'invalid.synthetic.token', request: {} }, origin: sameOriginCandidate },
    expected: [{ status: 401, error: 'unauthorized' }],
  },
  {
    name: 'viewer request rejects a correctly signed token from another Clerk session', key: 'viewerRequests',
    options: { auth: 'viewer', body: { protocol: 2, viewerToken: '', request: {} }, origin: sameOriginCandidate },
    expected: [{ status: 401, error: 'unauthorized' }],
    tokenFixture: 'wrong-session',
  },
  {
    name: 'device stream rejects a missing Bearer key', key: 'deviceStream',
    options: { auth: 'none', body: { protocol: 2, connectionId: UUID_CONNECTION }, origin: 'https://attacker.invalid' },
    expected: [{ status: 401, error: 'unauthorized' }],
  },
  {
    name: 'device stream rejects a revoked key', key: 'deviceStream',
    options: { auth: 'device', bearer: apiKeys.A3, body: { protocol: 2, connectionId: UUID_CONNECTION }, origin: 'https://attacker.invalid' },
    expected: [{ status: 401, error: 'unauthorized' }],
  },
  {
    name: 'device stream rejects a free-plan key', key: 'deviceStream',
    options: { auth: 'device', bearer: apiKeys.A4, body: { protocol: 2, connectionId: UUID_CONNECTION }, origin: 'https://attacker.invalid' },
    expected: [{ status: 403, error: 'plan_required' }],
  },
  {
    name: 'device frames rejects a correctly signed cross-device capability before publish', key: 'deviceFrames',
    options: {
      auth: 'device', bearer: apiKeys.A1, origin: 'https://attacker.invalid',
      body: { protocol: 2, deviceToken: '', viewerToken: '', part: testFrame },
    },
    expected: [{ status: 401, error: 'unauthorized' }],
    tokenFixture: 'owner-b',
  },
  {
    name: 'device frames rejects malformed part shape after current principal authentication', key: 'deviceFrames',
    options: {
      auth: 'device', bearer: apiKeys.A1, origin: 'https://attacker.invalid',
      body: { protocol: 2, deviceToken: '', viewerToken: '', part: {} },
    },
    expected: [{ status: 400, error: 'invalid_request' }],
    tokenFixture: 'owner-a',
  },
  {
    name: 'viewer stream rejects a disallowed Origin', key: 'viewerStream',
    options: { auth: 'viewer', body: { protocol: 2, deviceId: UUID_DEVICE, clientId: UUID_CLIENT }, origin: 'https://attacker.invalid' },
    expected: [{ status: 403, error: 'forbidden_origin' }],
  },
  {
    name: 'device frames rejects actual streamed bytes over the cap without Content-Length', key: 'deviceFrames',
    options: {
      auth: 'device', bearer: apiKeys.A1, origin: 'https://attacker.invalid',
      streamBody: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(128 * 1024 + 1));
          controller.close();
        },
      }),
    },
    expected: [{ status: 413, error: 'payload_too_large' }],
  },
];

describe('live relay v2 tenant and request-boundary matrix', () => {
  it.each(relayCases)('$name', async ({ key, options, expected, tokenFixture }) => {
    const requestOptions = { ...options };
    if (tokenFixture && typeof options.body === 'object' && options.body !== null) {
      const body = { ...options.body } as Record<string, unknown>;
      if (tokenFixture === 'wrong-session') {
        body.viewerToken = issueToken(tokenClaims('viewer', 'relay-user-a', UUID_DEVICE, 'relay-session-other'));
      } else if (tokenFixture === 'owner-b') {
        body.deviceToken = issueToken(tokenClaims('device', 'relay-user-b', UUID_DEVICE_B, 'relay-session-b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
        body.viewerToken = issueToken(tokenClaims('viewer', 'relay-user-b', UUID_DEVICE_B, 'relay-session-b'));
      } else {
        body.deviceToken = issueToken(tokenClaims('device', 'relay-user-a', UUID_DEVICE));
        body.viewerToken = issueToken(tokenClaims('viewer', 'relay-user-a', UUID_DEVICE));
      }
      requestOptions.body = body;
    }
    const response = await dispatch(key, 'POST', requestOptions);
    const error = await httpError(response);
    const failures: string[] = [];
    if (!expected.some((item) => item.status === response.status && item.error === error)) {
      failures.push(`expected contract rejection, got ${response.status}/${error ?? 'no error body'}; test_route_missing means auth was not reached`);
    }
    const badHeaders = securityHeaderProblems(response);
    if (badHeaders.length) failures.push(`security headers: ${badHeaders.join(', ')}`);
    const blocked = boundary.calls.filter((call) => !call.allowed);
    if (blocked.length) failures.push(`non-allowlisted DB access: ${blocked.map((call) => call.table).join(',')}`);
    expect(failures).toEqual([]);
  });

  it('an authorized viewer stream returns 500 when the private provider is unconfigured', async () => {
    const response = await dispatch('viewerStream', 'POST', {
      auth: 'viewer',
      userId: 'relay-user-a',
      sessionId: 'relay-session-a',
      origin: sameOriginCandidate,
      body: { protocol: 2, deviceId: UUID_DEVICE, clientId: UUID_CLIENT },
    });
    expect(await httpError(response)).toBe('server_misconfigured');
    expect(response.status).toBe(500);
    expect(securityHeaderProblems(response)).toEqual([]);
    expect(boundary.calls.filter((call) => !call.allowed)).toEqual([]);
  });
});

const legacyGroups: Array<{
  name: string;
  keys: Array<keyof typeof routePaths>;
  auth: 'viewer' | 'device';
}> = [
  { name: 'Clerk viewer legacy routes', keys: ['sessions', 'session', 'messages', 'send', 'receive'], auth: 'viewer' },
  { name: 'Bearer device legacy routes', keys: ['messages', 'poll', 'emit'], auth: 'device' },
];

async function exportedHandlers(keys: Array<keyof typeof routePaths>): Promise<Array<{ key: keyof typeof routePaths; method: string }>> {
  const handlers: Array<{ key: keyof typeof routePaths; method: string }> = [];
  for (const key of keys) {
    const modulePath = pathFor(key);
    if (!modulePath) throw new Error(`expected existing legacy route in test discovery: ${routePaths[key]}`);
    const route = await routeModules[modulePath]() as RouteModule;
    for (const method of httpMethods) {
      if (typeof route[method] === 'function') handlers.push({ key, method });
    }
  }
  return handlers;
}

describe('legacy durable chat cutover', () => {
  it.each(legacyGroups)('$name rejects unauthenticated callers before body parsing or chat storage', async ({ keys }) => {
    const failures: string[] = [];
    const handlers = await exportedHandlers(keys);
    for (const { key, method } of handlers) {
      boundary.calls.length = 0;
      const response = await dispatch(key, method, { auth: 'none', userId: null, sessionId: null });
      if (response.status !== 401) {
        failures.push(`${method} ${routePaths[key]}: expected 401, got ${response.status}`);
      }
      const blocked = boundary.calls.filter((call) => !call.allowed);
      if (blocked.length) failures.push(`${method} ${routePaths[key]}: unauthenticated request attempted non-allowlisted DB access (${blocked.map((call) => call.table).join(',')})`);
      const badHeaders = securityHeaderProblems(response);
      if (badHeaders.length) failures.push(`${method} ${routePaths[key]} 401 headers: ${badHeaders.join(', ')}`);
    }
    expect({ handlers: handlers.length, failures }).toEqual({ handlers: expect.any(Number), failures: [] });
    expect(handlers.length).toBeGreaterThanOrEqual(keys.length);
  });

  it.each(legacyGroups)('$name authenticates and returns 410 with security headers and no durable chat access', async ({ keys, auth }) => {
    const failures: string[] = [];
    const handlers = await exportedHandlers(keys);
    for (const { key, method } of handlers) {
      boundary.calls.length = 0;
      const response = await dispatch(key, method, {
        auth,
        bearer: auth === 'device' ? apiKeys.A1 : undefined,
        userId: auth === 'viewer' ? 'relay-user-a' : null,
        sessionId: auth === 'viewer' ? 'relay-session-a' : null,
      });
      if (response.status !== 410) {
        failures.push(`${method} ${routePaths[key]}: expected authenticated 410, got ${response.status}`);
      } else if (await httpError(response) !== 'upgrade_required') {
        failures.push(`${method} ${routePaths[key]}: 410 body must use upgrade_required`);
      } else {
        const body = await response.clone().json() as { protocol?: number };
        if (body.protocol !== 2) failures.push(`${method} ${routePaths[key]}: 410 protocol must be 2`);
      }
      const blocked = boundary.calls.filter((call) => !call.allowed);
      if (blocked.length) failures.push(`${method} ${routePaths[key]}: attempted non-allowlisted DB access (${blocked.map((call) => call.table).join(',')})`);
      const badHeaders = securityHeaderProblems(response);
      if (badHeaders.length) failures.push(`${method} ${routePaths[key]} 410 headers: ${badHeaders.join(', ')}`);
    }
    expect({ handlers: handlers.length, failures }).toEqual({ handlers: expect.any(Number), failures: [] });
    expect(handlers.length).toBeGreaterThanOrEqual(keys.length);
  });

  it('messages does not fall back to a valid Clerk session when an invalid Bearer credential is supplied', async () => {
    boundary.calls.length = 0;
    const response = await dispatch('messages', 'GET', {
      auth: 'device',
      bearer: 'invalid.synthetic.bearer',
      userId: 'relay-user-a',
      sessionId: 'relay-session-a',
    });
    expect(response.status).toBe(401);
    expect(boundary.calls.filter((call) => !call.allowed)).toEqual([]);
    expect(securityHeaderProblems(response)).toEqual([]);
  });
});
