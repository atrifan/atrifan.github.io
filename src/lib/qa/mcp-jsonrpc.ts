/**
 * Minimal MCP JSON-RPC 2.0 handler (initialize, ping, tools/list, tools/call) for the
 * Admin QA MCP and the e2e stand-in for the Jobs MCP submission tools. Self-contained on
 * purpose: when src/lib/mcp/jsonrpc-core.ts lands, `handleMcpRequest` can be replaced by it
 * (the tool shape is the same {name, description, inputSchema, handler(ctx, args)}).
 *
 * - Tool success:  result = { content: [{ type: 'text', text: JSON }], structuredContent }
 * - Tool error:    result = { isError: true, content: [...], structuredContent: { error, message } }
 *   (JobsError → its code; anything else → internal_error, logged without arguments)
 * - Not allowed:   JSON-RPC error -32003 with HTTP 403 (and tools/list returns [])
 */
import { JobsError } from '../jobs/errors';

export interface McpTool<Ctx> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  handler: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>;
}

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface McpReply {
  status: number;
  body: unknown;
}

export const RPC_UNAUTHENTICATED = -32001;
export const RPC_FORBIDDEN = -32003;

export function rpcError(id: unknown, code: number, message: string, status = 200): McpReply {
  return { status, body: { jsonrpc: '2.0', id: id ?? null, error: { code, message } } };
}

function toolResult(data: unknown, isError = false) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

export async function handleMcpRequest<Ctx>(
  raw: unknown,
  opts: {
    serverInfo: { name: string; version: string };
    instructions?: string;
    tools: McpTool<Ctx>[];
    ctx: Ctx;
    /** false: tools/list is empty and tools/call is refused with -32003. */
    allowed: boolean;
    forbiddenMessage?: string;
  },
): Promise<McpReply> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return rpcError(null, -32600, 'Invalid request', 400);
  const req = raw as RpcRequest;
  const id = req.id ?? null;
  if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') return rpcError(id, -32600, 'Invalid request', 400);

  switch (req.method) {
    case 'initialize':
      return {
        status: 200,
        body: {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : '2025-06-18',
            capabilities: { tools: { listChanged: false } },
            serverInfo: opts.serverInfo,
            ...(opts.instructions ? { instructions: opts.instructions } : {}),
          },
        },
      };
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return { status: 202, body: null };
    case 'ping':
      return { status: 200, body: { jsonrpc: '2.0', id, result: {} } };
    case 'tools/list':
      return {
        status: 200,
        body: {
          jsonrpc: '2.0',
          id,
          result: {
            tools: opts.allowed
              ? opts.tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) }))
              : [],
          },
        },
      };
    case 'tools/call': {
      if (!opts.allowed) return rpcError(id, RPC_FORBIDDEN, opts.forbiddenMessage ?? 'Not allowed', 403);
      const name = req.params?.name;
      const tool = opts.tools.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(name)}`);
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const data = await tool.handler(opts.ctx, args);
        return { status: 200, body: { jsonrpc: '2.0', id, result: toolResult(data) } };
      } catch (err) {
        if (err instanceof JobsError) {
          const data: Record<string, unknown> = { error: err.code, message: err.message };
          if (err.code === 'invalid_request' && err.details) data.issues = err.details;
          return { status: 200, body: { jsonrpc: '2.0', id, result: toolResult(data, true) } };
        }
        console.error(`[mcp] tool ${tool.name} failed:`, err instanceof Error ? err.message : 'error');
        return { status: 200, body: { jsonrpc: '2.0', id, result: toolResult({ error: 'internal_error', message: 'Something went wrong' }, true) } };
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${req.method}`);
  }
}
