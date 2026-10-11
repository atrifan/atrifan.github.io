/**
 * Admin QA MCP on the shared JSON-RPC core (src/lib/mcp/jsonrpc-core.ts).
 *
 * - initialize echoes the client's protocolVersion (default 2025-06-18)
 * - notifications/initialized and notifications/cancelled: HTTP 202, no body
 * - non-admins: tools/list is empty, tools/call is -32003 with HTTP 403
 * - tool success: { content: [{ type: 'text', text: compact JSON }], structuredContent }
 * - tool error: isError with { error, message } (+ issues for invalid_request); JobsError
 *   gives its code, anything else is internal_error, logged without arguments
 */
import {
  JSONRPC_ERROR,
  JsonRpcError,
  dispatchMcpRequest,
  initializeResult,
  rpcError,
  toolDescriptor,
  toolResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpServer,
  type SimpleMcpTool,
} from '../mcp/jsonrpc-core';
import { JobsError } from '../jobs/errors';

export interface McpReply {
  status: number;
  body: JsonRpcResponse | null;
}

export interface AdminServerOptions<Ctx> {
  serverInfo: { name: string; version: string };
  instructions?: string;
  tools: readonly SimpleMcpTool<Ctx>[];
  /** false: tools/list is empty and tools/call is refused with -32003. */
  allowed: boolean;
  forbiddenMessage?: string;
}

const NOTIFICATIONS = new Set(['notifications/initialized', 'notifications/cancelled']);

async function runTool<Ctx>(tool: SimpleMcpTool<Ctx>, ctx: Ctx, args: Record<string, unknown>) {
  try {
    return toolResult((await tool.handler(ctx, args)) as Record<string, unknown>, false, { pretty: false });
  } catch (err) {
    if (err instanceof JobsError) {
      const data: Record<string, unknown> = { error: err.code, message: err.message };
      if (err.code === 'invalid_request' && err.details) data.issues = err.details;
      return toolResult(data, true, { pretty: false });
    }
    console.error(`[mcp] tool ${tool.name} failed:`, err instanceof Error ? err.message : 'error');
    return toolResult({ error: 'internal_error', message: 'Something went wrong' }, true, { pretty: false });
  }
}

function server<Ctx>(opts: AdminServerOptions<Ctx>): McpServer<Ctx> {
  return {
    initialize: (params) =>
      initializeResult({
        protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: opts.serverInfo,
        instructions: opts.instructions,
      }),
    listTools: () => (opts.allowed ? opts.tools.map((t) => toolDescriptor(t as SimpleMcpTool<unknown>)) : []),
    callTool: (name, args, ctx) => {
      if (!opts.allowed) throw new JsonRpcError(JSONRPC_ERROR.NOT_ALLOWED, opts.forbiddenMessage ?? 'Not allowed');
      const tool = opts.tools.find((t) => t.name === name);
      if (!tool) throw new JsonRpcError(JSONRPC_ERROR.INVALID_PARAMS, `Unknown tool: ${String(name)}`);
      return runTool(tool, ctx, args);
    },
    methods: { ping: () => ({}) },
  };
}

export async function handleAdminMcpRequest<Ctx>(raw: unknown, ctx: Ctx, opts: AdminServerOptions<Ctx>): Promise<McpReply> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 400, body: rpcError(null, JSONRPC_ERROR.INVALID_REQUEST, 'Invalid request') };
  }
  const req = raw as Partial<JsonRpcRequest> & { id?: JsonRpcRequest['id'] | null };
  const id = req.id ?? null;
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return { status: 400, body: rpcError(id, JSONRPC_ERROR.INVALID_REQUEST, 'Invalid request') };
  }
  if (NOTIFICATIONS.has(req.method)) return { status: 202, body: null };
  const response = await dispatchMcpRequest(
    { jsonrpc: '2.0', id: id as JsonRpcRequest['id'], method: req.method, params: req.params ?? {} },
    ctx,
    server(opts),
  );
  return { status: response.error?.code === JSONRPC_ERROR.NOT_ALLOWED ? 403 : 200, body: response };
}
