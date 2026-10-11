/**
 * JSON-RPC 2.0 / MCP core shared by Tulzo's MCP servers (`/api/mcp`, `/api/jobs/mcp`).
 * Pure: no I/O, no framework imports. Credential validation (Supabase / Clerk) lives in
 * `./auth.ts`; each route decides how to map an AuthResult to HTTP.
 */

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Standard JSON-RPC codes plus Tulzo's MCP server errors (-32001..-32003). */
export const JSONRPC_ERROR = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
  /** No or invalid credentials. */
  AUTH_REQUIRED: -32001,
  /** The tool exists but is not enabled for the caller's server. */
  TOOL_NOT_ENABLED: -32002,
  /** The caller's plan does not include this surface (Free on /api/mcp). */
  PLAN_REQUIRED: -32003,
} as const;

/** Throw from a handler to answer with a specific JSON-RPC error. */
export class JsonRpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = data;
  }
}

export function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  const error: JsonRpcResponse['error'] = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', id, error };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A notification is a request without an `id` member; it gets no response. */
export function isNotification(message: unknown): boolean {
  return isPlainObject(message) && typeof message.method === 'string' && !('id' in message);
}

function usableId(v: unknown): JsonRpcId {
  return typeof v === 'string' || typeof v === 'number' ? v : null;
}

export function validateRequest(
  body: unknown,
): { ok: true; request: JsonRpcRequest } | { ok: false; response: JsonRpcResponse } {
  const id = isPlainObject(body) ? usableId(body.id) : null;
  const invalid = (why: string) => ({ ok: false as const, response: rpcError(id, JSONRPC_ERROR.INVALID_REQUEST, `Invalid Request: ${why}`) });
  if (!isPlainObject(body)) return invalid('expected a JSON-RPC object');
  if (body.jsonrpc !== '2.0') return invalid('jsonrpc must be "2.0"');
  if (typeof body.method !== 'string') return invalid('method must be a string');
  if ('id' in body && body.id !== null && typeof body.id !== 'string' && typeof body.id !== 'number') {
    return invalid('id must be a string or number');
  }
  if (body.params !== undefined && !isPlainObject(body.params)) return invalid('params must be an object');
  return { ok: true, request: body as unknown as JsonRpcRequest };
}

/** Echo the client's protocol version when we support it, else offer our newest. */
export function negotiateProtocolVersion(requested: unknown, supported: readonly string[]): string {
  return typeof requested === 'string' && supported.includes(requested) ? requested : supported[0];
}

export interface InitializeOptions {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities: Record<string, unknown>;
  instructions?: string;
}

export function initializeResult(opts: InitializeOptions): Record<string, unknown> {
  const result: Record<string, unknown> = {
    protocolVersion: opts.protocolVersion,
    capabilities: opts.capabilities,
    serverInfo: opts.serverInfo,
  };
  if (opts.instructions) result.instructions = opts.instructions;
  return result;
}

type Awaitable<T> = T | Promise<T>;

export interface McpServer<Ctx> {
  initialize(params: Record<string, unknown> | undefined, ctx: Ctx): Awaitable<unknown>;
  listTools(ctx: Ctx): Awaitable<unknown[]>;
  callTool(name: string, args: Record<string, unknown>, ctx: Ctx): Awaitable<unknown>;
  /** Any other methods (resources/list, ping, ...). */
  methods?: Record<string, (params: Record<string, unknown> | undefined, ctx: Ctx) => Awaitable<unknown>>;
}

/**
 * Route one JSON-RPC request to the server. A thrown JsonRpcError answers with its own
 * code; anything else becomes -32000 with String(error), as /api/mcp has always done.
 */
export async function dispatchMcpRequest<Ctx>(request: JsonRpcRequest, ctx: Ctx, server: McpServer<Ctx>): Promise<JsonRpcResponse> {
  const { id, method, params } = request;
  try {
    switch (method) {
      case 'initialize':
        return rpcResult(id, await server.initialize(params, ctx));
      case 'tools/list':
        return rpcResult(id, { tools: await server.listTools(ctx) });
      case 'tools/call': {
        // Read params the way /api/mcp always has (missing params is a server error there).
        const call = params as { name: string; arguments?: Record<string, unknown> };
        return rpcResult(id, await server.callTool(call.name, call.arguments || {}, ctx));
      }
      default: {
        const handler = server.methods && Object.prototype.hasOwnProperty.call(server.methods, method)
          ? server.methods[method]
          : undefined;
        if (!handler) return rpcError(id, JSONRPC_ERROR.METHOD_NOT_FOUND, `Method not found: ${method}`);
        return rpcResult(id, await handler(params, ctx));
      }
    }
  } catch (error) {
    if (error instanceof JsonRpcError) return rpcError(id, error.code, error.message, error.data);
    return rpcError(id, JSONRPC_ERROR.SERVER_ERROR, String(error));
  }
}

export type AuthMethod = 'oauth' | 'header' | 'path' | 'internal' | 'none';

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  apiKeyId?: string;
  serverName?: string;
  plan?: string;
  isSubscribed?: boolean;
  authMethod: AuthMethod;
  error?: string;
}

/**
 * Where the caller's credentials are:
 *   X-User-Id (forwarded by /api/mcp/[key]) → internal
 *   x-api-key → API key
 *   Authorization: Bearer tlz_… → API key; any other Bearer → OAuth / Clerk JWT
 */
export function extractAuth(headers: { get(name: string): string | null }): { apiKey?: string; authMethod: AuthMethod } {
  if (headers.get('X-User-Id')) return { authMethod: 'internal' };
  const xApiKey = headers.get('x-api-key');
  if (xApiKey) return { apiKey: xApiKey, authMethod: 'header' };
  const authHeader = headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token.startsWith('tlz_')) return { apiKey: token, authMethod: 'header' };
    return { apiKey: token, authMethod: 'oauth' };
  }
  return { authMethod: 'none' };
}

export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: true;
}

/** An MCP tools/call result: the payload as JSON text and as structuredContent. */
export function toolResult(payload: Record<string, unknown>, isError = false): ToolCallResult {
  const result: ToolCallResult = {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
  if (isError) result.isError = true;
  return result;
}
