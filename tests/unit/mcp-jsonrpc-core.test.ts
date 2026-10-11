import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JSONRPC_ERROR,
  JsonRpcError,
  rpcResult,
  rpcError,
  isNotification,
  validateRequest,
  negotiateProtocolVersion,
  initializeResult,
  dispatchMcpRequest,
  extractAuth,
  toolResult,
  toolDescriptor,
  type McpServer,
} from '../../src/lib/mcp/jsonrpc-core.ts';

function headers(map: Record<string, string>): { get(name: string): string | null } {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

function server(over: Partial<McpServer<{ user: string }>> = {}): McpServer<{ user: string }> {
  return {
    initialize: () => ({ protocolVersion: 'v', serverInfo: { name: 's', version: '1' } }),
    listTools: () => [{ name: 't1' }],
    callTool: async (name, args, ctx) => ({ called: name, args, user: ctx.user }),
    ...over,
  };
}

test('error codes match the JSON-RPC and Tulzo MCP conventions', () => {
  assert.deepEqual(JSONRPC_ERROR, {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    SERVER_ERROR: -32000,
    AUTH_REQUIRED: -32001,
    TOOL_NOT_ENABLED: -32002,
    NOT_ALLOWED: -32003,
  });
});

test('rpcResult and rpcError build JSON-RPC 2.0 envelopes; data is omitted unless given', () => {
  assert.deepEqual(rpcResult(7, { ok: 1 }), { jsonrpc: '2.0', id: 7, result: { ok: 1 } });
  assert.deepEqual(rpcError('a', -32601, 'nope'), { jsonrpc: '2.0', id: 'a', error: { code: -32601, message: 'nope' } });
  assert.deepEqual(rpcError(null, -32602, 'bad', { field: 'x' }), {
    jsonrpc: '2.0', id: null, error: { code: -32602, message: 'bad', data: { field: 'x' } },
  });
});

test('isNotification: a method without an id member', () => {
  assert.equal(isNotification({ jsonrpc: '2.0', method: 'notifications/initialized' }), true);
  assert.equal(isNotification({ jsonrpc: '2.0', id: 1, method: 'ping' }), false);
  assert.equal(isNotification({ jsonrpc: '2.0', id: null, method: 'ping' }), false);
  assert.equal(isNotification({ jsonrpc: '2.0' }), false);
  assert.equal(isNotification(null), false);
  assert.equal(isNotification('x'), false);
});

test('validateRequest accepts a well-formed request', () => {
  const r = validateRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.request.method, 'tools/list');
});

test('validateRequest rejects malformed requests with -32600 and echoes a usable id', () => {
  for (const [body, id] of [
    [null, null],
    [[], null],
    ['str', null],
    [{ id: 3, method: 'x' }, 3],
    [{ jsonrpc: '1.0', id: 4, method: 'x' }, 4],
    [{ jsonrpc: '2.0', id: 5 }, 5],
    [{ jsonrpc: '2.0', id: 6, method: 42 }, 6],
    [{ jsonrpc: '2.0', id: { bad: true }, method: 'x' }, null],
    [{ jsonrpc: '2.0', id: 8, method: 'x', params: 'nope' }, 8],
  ] as const) {
    const r = validateRequest(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    if (!r.ok) {
      assert.equal(r.response.error?.code, -32600);
      assert.equal(r.response.id, id);
    }
  }
});

test('negotiateProtocolVersion echoes a supported version, else the newest', () => {
  const supported = ['2025-06-18', '2025-03-26', '2024-11-05'];
  assert.equal(negotiateProtocolVersion('2025-03-26', supported), '2025-03-26');
  assert.equal(negotiateProtocolVersion('2024-11-05', supported), '2024-11-05');
  assert.equal(negotiateProtocolVersion('1999-01-01', supported), '2025-06-18');
  assert.equal(negotiateProtocolVersion(undefined, supported), '2025-06-18');
  assert.equal(negotiateProtocolVersion(42, supported), '2025-06-18');
});

test('initializeResult includes instructions only when given', () => {
  assert.deepEqual(initializeResult({ protocolVersion: 'p', serverInfo: { name: 'n', version: '1' }, capabilities: { tools: {} } }), {
    protocolVersion: 'p', capabilities: { tools: {} }, serverInfo: { name: 'n', version: '1' },
  });
  assert.deepEqual(
    initializeResult({ protocolVersion: 'p', serverInfo: { name: 'n', version: '1' }, capabilities: {}, instructions: 'hi' }),
    { protocolVersion: 'p', capabilities: {}, serverInfo: { name: 'n', version: '1' }, instructions: 'hi' },
  );
});

test('dispatch: initialize returns the server initialize result and passes params and ctx', async () => {
  let seen: unknown;
  const res = await dispatchMcpRequest(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'x' } } },
    { user: 'u' },
    server({ initialize: (params, ctx) => { seen = { params, ctx }; return { hello: true }; } }),
  );
  assert.deepEqual(res, { jsonrpc: '2.0', id: 1, result: { hello: true } });
  assert.deepEqual(seen, { params: { clientInfo: { name: 'x' } }, ctx: { user: 'u' } });
});

test('dispatch: tools/list wraps the list in { tools }', async () => {
  const res = await dispatchMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { user: 'u' }, server());
  assert.deepEqual(res, { jsonrpc: '2.0', id: 2, result: { tools: [{ name: 't1' }] } });
});

test('dispatch: tools/call passes name, arguments (default {}) and ctx', async () => {
  const a = await dispatchMcpRequest(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'x', arguments: { q: 1 } } },
    { user: 'u' },
    server(),
  );
  assert.deepEqual(a.result, { called: 'x', args: { q: 1 }, user: 'u' });
  const b = await dispatchMcpRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'y' } }, { user: 'u' }, server());
  assert.deepEqual(b.result, { called: 'y', args: {}, user: 'u' });
});

test('dispatch: extra methods are routed; unknown methods are -32601', async () => {
  const s = server({ methods: { ping: () => ({}) } });
  assert.deepEqual(await dispatchMcpRequest({ jsonrpc: '2.0', id: 5, method: 'ping' }, { user: 'u' }, s), {
    jsonrpc: '2.0', id: 5, result: {},
  });
  assert.deepEqual(await dispatchMcpRequest({ jsonrpc: '2.0', id: 6, method: 'nope/x' }, { user: 'u' }, s), {
    jsonrpc: '2.0', id: 6, error: { code: -32601, message: 'Method not found: nope/x' },
  });
});

test('dispatch: inherited object keys are not methods', async () => {
  const res = await dispatchMcpRequest({ jsonrpc: '2.0', id: 9, method: 'toString' }, { user: 'u' }, server({ methods: {} }));
  assert.equal(res.error?.code, -32601);
});

test('dispatch: a thrown JsonRpcError keeps its code and data; anything else is -32000 String(err)', async () => {
  const s1 = server({ callTool: async () => { throw new JsonRpcError(-32602, 'Unknown tool: z', { name: 'z' }); } });
  assert.deepEqual(
    await dispatchMcpRequest({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'z' } }, { user: 'u' }, s1),
    { jsonrpc: '2.0', id: 7, error: { code: -32602, message: 'Unknown tool: z', data: { name: 'z' } } },
  );
  const s2 = server({ listTools: () => { throw new Error('boom'); } });
  assert.deepEqual(await dispatchMcpRequest({ jsonrpc: '2.0', id: 8, method: 'tools/list' }, { user: 'u' }, s2), {
    jsonrpc: '2.0', id: 8, error: { code: -32000, message: 'Error: boom' },
  });
});

test('JsonRpcError is an Error with a code', () => {
  const e = new JsonRpcError(-32001, 'auth');
  assert.ok(e instanceof Error);
  assert.equal(e.code, -32001);
  assert.equal(e.message, 'auth');
  assert.equal(e.data, undefined);
  assert.equal(e.name, 'JsonRpcError');
});

test('extractAuth: identity headers are not credentials', () => {
  assert.deepEqual(extractAuth(headers({ 'X-User-Id': 'u', 'x-api-key': 'k' })), { apiKey: 'k', authMethod: 'header' });
  assert.deepEqual(extractAuth(headers({ 'X-User-Id': 'u', 'X-Auth-Method': 'path', 'X-Original-Api-Key': 'tlz_x' })), { authMethod: 'none' });
});

test('extractAuth: x-api-key header', () => {
  assert.deepEqual(extractAuth(headers({ 'x-api-key': 'tlz_abc' })), { apiKey: 'tlz_abc', authMethod: 'header' });
  assert.deepEqual(extractAuth(headers({ 'x-api-key': 'k', authorization: 'Bearer ey.jwt' })), { apiKey: 'k', authMethod: 'header' });
});

test('extractAuth: Bearer tlz_ is an API key, any other Bearer is OAuth', () => {
  assert.deepEqual(extractAuth(headers({ authorization: 'Bearer tlz_123' })), { apiKey: 'tlz_123', authMethod: 'header' });
  assert.deepEqual(extractAuth(headers({ authorization: 'Bearer eyJhbGc.x.y' })), { apiKey: 'eyJhbGc.x.y', authMethod: 'oauth' });
});

test('extractAuth: nothing usable', () => {
  assert.deepEqual(extractAuth(headers({})), { authMethod: 'none' });
  assert.deepEqual(extractAuth(headers({ authorization: 'Basic abc' })), { authMethod: 'none' });
});

test('toolResult: text content mirrors structuredContent; isError only on failure', () => {
  assert.deepEqual(toolResult({ a: 1 }), {
    content: [{ type: 'text', text: JSON.stringify({ a: 1 }, null, 2) }],
    structuredContent: { a: 1 },
  });
  assert.deepEqual(toolResult({ error: 'x', message: 'y' }, true), {
    content: [{ type: 'text', text: JSON.stringify({ error: 'x', message: 'y' }, null, 2) }],
    structuredContent: { error: 'x', message: 'y' },
    isError: true,
  });
});

test('toolResult can write compact JSON text', () => {
  assert.deepEqual(toolResult({ a: [1, 2] }, false, { pretty: false }), {
    content: [{ type: 'text', text: '{"a":[1,2]}' }],
    structuredContent: { a: [1, 2] },
  });
  assert.equal(toolResult({ a: 1 }, true, { pretty: false }).isError, true);
  assert.equal(toolResult({ a: 1 }, false, { pretty: true }).content[0].text, JSON.stringify({ a: 1 }, null, 2));
});

test('toolDescriptor lists name, description, schema and annotations only when present', () => {
  const handler = async () => ({});
  assert.deepEqual(toolDescriptor({ name: 'a', description: 'd', inputSchema: { type: 'object' }, handler }), {
    name: 'a', description: 'd', inputSchema: { type: 'object' },
  });
  assert.deepEqual(
    toolDescriptor({ name: 'a', description: 'd', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true }, handler }),
    { name: 'a', description: 'd', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
  );
});
