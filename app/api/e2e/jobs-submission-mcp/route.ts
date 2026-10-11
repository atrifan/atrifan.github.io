/**
 * TEST-ONLY stand-in for the Jobs MCP submission tools (send_project, qa_status,
 * qa_report_get), used by tests/e2e/submission-mcp.spec.ts until app/api/jobs/mcp lands.
 * 404 unless the gigs e2e identity header is valid, which requires NODE_ENV !== 'production'
 * and JOBS_E2E_AUTH_SECRET (src/lib/jobs/http.ts), so production builds never serve it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { e2eUser } from '@/src/lib/jobs/http';
import { SUBMISSION_TOOLS, type JobsMcpToolContext } from '@/src/lib/jobs/mcp/tools/submission';
import { handleMcpRequest, rpcError, type McpReply, type McpTool } from '@/src/lib/qa/mcp-jsonrpc';

export const dynamic = 'force-dynamic';

function reply({ status, body }: McpReply): NextResponse {
  return body === null ? new NextResponse(null, { status }) : NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const userId = e2eUser(request);
  if (!userId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply(rpcError(null, -32700, 'Parse error', 400));
  }
  const ctx: JobsMcpToolContext = { userId, principalId: null, agentIdentityId: null };
  return reply(
    await handleMcpRequest(body, {
      serverInfo: { name: 'tulzo-jobs-submission-e2e', version: '0.0.0' },
      tools: SUBMISSION_TOOLS as unknown as McpTool<JobsMcpToolContext>[],
      ctx,
      allowed: true,
    }),
  );
}
