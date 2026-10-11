/**
 * The Jobs MCP server: the tool registry over every module in ./tools, plus the MCP methods.
 * Transport and auth are in app/api/jobs/mcp/route.ts.
 */
import {
  JSONRPC_ERROR,
  JsonRpcError,
  initializeResult,
  negotiateProtocolVersion,
  type McpServer,
} from '@/src/lib/mcp/jsonrpc-core';
import { buildRegistry } from './registry';
import { JOBS_MCP_INSTRUCTIONS, type JobsToolContext } from './context';
import * as toolModules from './tools';

export const JOBS_MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const JOBS_MCP_SERVER_INFO = { name: 'tulzo-jobs', version: '1.0.0' };

export const jobsRegistry = buildRegistry<JobsToolContext>(Object.values(toolModules));

export const jobsMcpServer: McpServer<JobsToolContext> = {
  initialize: (params) =>
    initializeResult({
      protocolVersion: negotiateProtocolVersion(params?.protocolVersion, JOBS_MCP_PROTOCOL_VERSIONS),
      serverInfo: JOBS_MCP_SERVER_INFO,
      capabilities: { tools: { listChanged: false } },
      instructions: JOBS_MCP_INSTRUCTIONS,
    }),
  listTools: () => jobsRegistry.list(),
  callTool: (name, args, ctx) => {
    if (typeof name !== 'string' || !name) throw new JsonRpcError(JSONRPC_ERROR.INVALID_PARAMS, 'tools/call needs params.name');
    return jobsRegistry.call(name, args, ctx);
  },
  methods: { ping: () => ({}) },
};
