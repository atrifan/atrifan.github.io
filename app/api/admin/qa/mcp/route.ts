/**
 * Admin QA MCP (hub). JSON-RPC 2.0 over POST, tools in src/lib/qa/admin-qa-mcp-tools.ts.
 *
 * Auth: x-api-key / Bearer API key, or a Clerk OAuth/session bearer token (see
 * src/lib/qa/admin-auth.ts). Unauthenticated → 401 (-32001). Authenticated non-admins get
 * an empty tools/list and -32003 (HTTP 403) on tools/call. Separate from the Jobs MCP:
 * providers never reach these tools.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authenticateQaCaller } from '@/src/lib/qa/admin-auth';
import { ADMIN_QA_TOOLS, type AdminQaContext } from '@/src/lib/qa/admin-qa-mcp-tools';
import { handleAdminMcpRequest, type McpReply } from '@/src/lib/qa/admin-qa-server';
import { JSONRPC_ERROR, rpcError } from '@/src/lib/mcp/jsonrpc-core';

export const dynamic = 'force-dynamic';

const SERVER_INFO = { name: 'tulzo-admin-qa', version: '1.0.0' };
const INSTRUCTIONS =
  'Tulzo admin QA. qa_queue_list → qa_submission_get → qa_credentials_get (clone the pinned commit locally; ' +
  'call models through /api/chat with the review key) → qa_mark. Never run submitted code on Tulzo infrastructure.';

function reply({ status, body }: McpReply): NextResponse {
  if (body === null) return new NextResponse(null, { status });
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ status: 400, body: rpcError(null, JSONRPC_ERROR.PARSE_ERROR, 'Parse error') });
  }
  const id = (body as { id?: string | number | null } | null)?.id ?? null;
  const caller = await authenticateQaCaller(request);
  if (!caller.authenticated) return reply({ status: 401, body: rpcError(id, JSONRPC_ERROR.AUTH_REQUIRED, caller.error) });

  const ctx: AdminQaContext = { adminUserId: caller.userId };
  return reply(
    await handleAdminMcpRequest(body, ctx, {
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
      tools: ADMIN_QA_TOOLS,
      allowed: caller.isAdmin,
      forbiddenMessage: 'Admin access required',
    }),
  );
}

export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name,
    version: SERVER_INFO.version,
    description: 'Admin QA MCP: review gig submissions with your own agent. Admins only.',
    transport: 'JSON-RPC 2.0 over HTTP POST',
    authentication: { header: 'x-api-key', bearer: 'Authorization: Bearer <Clerk OAuth token or API key>' },
  });
}
