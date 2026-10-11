import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the Jobs MCP at /api/jobs/mcp.
 * MCP clients find this through the WWW-Authenticate header of a 401, then sign in with
 * the authorization server described at /.well-known/oauth-authorization-server.
 */
export async function GET(request: NextRequest) {
  const baseUrl = (process.env.NEXT_PUBLIC_HOST || request.nextUrl.origin).replace(/\/$/, '');
  return NextResponse.json(
    {
      resource: `${baseUrl}/api/jobs/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: ['openid', 'profile', 'email'],
      bearer_methods_supported: ['header'],
      resource_name: 'Tulzo Gigs (Jobs MCP)',
      resource_documentation: `${baseUrl}/gigs/docs/mcp`,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
