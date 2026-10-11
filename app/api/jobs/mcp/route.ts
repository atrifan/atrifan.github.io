import { NextRequest, NextResponse } from 'next/server';
import {
  JSONRPC_ERROR,
  dispatchMcpRequest,
  isNotification,
  rpcError,
  validateRequest,
  type JsonRpcId,
} from '@/src/lib/mcp/jsonrpc-core';
import { authenticateJobsAgent } from '@/src/lib/jobs/mcp/auth';
import { jobsMcpServer } from '@/src/lib/jobs/mcp/server';
import { resolveAgentIdentity, type AgentInfo } from '@/src/lib/jobs/agent-identities';
import type { JobsToolContext } from '@/src/lib/jobs/mcp/context';

export const dynamic = 'force-dynamic';

/**
 * Jobs MCP (Streamable HTTP, JSON responses only): an AI agent finds jobs, bids, and works
 * a contract as the signed-in user. Auth is Clerk OAuth (through /api/oauth) or a Tulzo API
 * key; the Free plan is allowed. Every request is authenticated; without credentials the
 * 401 points OAuth clients at /.well-known/oauth-protected-resource/api/jobs/mcp.
 */

function baseUrl(request: NextRequest): string {
  return (process.env.NEXT_PUBLIC_HOST || request.nextUrl.origin).replace(/\/$/, '');
}

function idOf(body: unknown): JsonRpcId {
  const id = (body as { id?: unknown } | null)?.id;
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}

function clientInfo(params: Record<string, unknown> | undefined): AgentInfo {
  const info = params?.clientInfo as { name?: unknown; version?: unknown } | undefined;
  return {
    name: typeof info?.name === 'string' ? info.name : undefined,
    version: typeof info?.version === 'string' ? info.version : undefined,
  };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json(rpcError(null, JSONRPC_ERROR.PARSE_ERROR, 'Parse error'), { status: 400 });
  }

  const auth = await authenticateJobsAgent(request);
  if (!auth.ok) {
    return NextResponse.json(rpcError(idOf(body), JSONRPC_ERROR.AUTH_REQUIRED, auth.message), {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer resource_metadata="${baseUrl(request)}/.well-known/oauth-protected-resource/api/jobs/mcp"`,
      },
    });
  }

  const checked = validateRequest(body);
  if (!checked.ok) return NextResponse.json(checked.response, { status: 400 });
  if (isNotification(body)) return new NextResponse(null, { status: 202 });

  const { request: rpc } = checked;
  const { caller } = auth;
  const agent = await resolveAgentIdentity(
    caller.userId,
    caller.client,
    rpc.method === 'initialize' ? clientInfo(rpc.params) : {},
  ).catch((err) => {
    console.error('[jobs-mcp] agent identity failed:', err);
    return null;
  });
  if (!agent) {
    return NextResponse.json(rpcError(rpc.id, JSONRPC_ERROR.INTERNAL_ERROR, 'Could not resolve the agent identity'), { status: 500 });
  }

  const ctx: JobsToolContext = { userId: caller.userId, plan: caller.plan, authMethod: caller.authMethod, agent };
  const response = await dispatchMcpRequest({ ...rpc, params: rpc.params ?? {} }, ctx, jobsMcpServer);
  return NextResponse.json(response);
}

/** No server-initiated SSE stream: Streamable HTTP clients get 405 and use POST only. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}
