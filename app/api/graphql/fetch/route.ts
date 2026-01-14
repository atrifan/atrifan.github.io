/**
 * GraphQL Schema Fetch API
 *
 * POST /api/graphql/fetch
 * Fetch and introspect a GraphQL schema from a URL
 * Supports OAuth2 authentication for protected APIs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchGraphQLSchema } from '@/src/lib/graphql-handler';
import { parseGraphQLSchema } from '@/src/lib/graphql-parser';
import { getValidOAuthToken } from '@/src/lib/oauth-token-manager';
import type { OAuth2AuthConfig } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

interface FetchRequest {
  url: string;
  headers?: Record<string, string>;
  authType?: 'none' | 'api_key' | 'bearer' | 'oauth2';
  oauth2Config?: OAuth2AuthConfig;
  specId?: string; // For OAuth token lookup
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: FetchRequest = await request.json();
    const { url, headers: customHeaders, authType, oauth2Config, specId } = body;

    if (!url) {
      return NextResponse.json({ error: 'Missing required field: url' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Build headers
    const headers: Record<string, string> = { ...customHeaders };

    // Handle OAuth2 authentication
    if (authType === 'oauth2' && oauth2Config) {
      const serverId = specId || `temp_${Buffer.from(url).toString('base64').slice(0, 32)}`;
      const tokenResult = await getValidOAuthToken(userId, { type: 'graphql', id: serverId }, oauth2Config);

      if (!tokenResult.success || !tokenResult.accessToken) {
        return NextResponse.json({
          success: false,
          error: tokenResult.error || 'OAuth authentication required',
          needsOAuth: true,
          oauthServerType: 'graphql',
        });
      }
      headers['Authorization'] = `${tokenResult.tokenType || 'Bearer'} ${tokenResult.accessToken}`;
    }

    // Fetch the schema via introspection
    const result = await fetchGraphQLSchema(url, headers);

    if (!result.success || !result.schema) {
      return NextResponse.json({ 
        error: result.error || 'Failed to fetch GraphQL schema' 
      }, { status: 400 });
    }

    // Parse the schema to extract operations
    const parsed = parseGraphQLSchema(result.schema as { __schema: Parameters<typeof parseGraphQLSchema>[0]['__schema'] });

    return NextResponse.json({
      success: true,
      schema: result.schema,
      stats: {
        queries: parsed.queries.length,
        mutations: parsed.mutations.length,
        subscriptions: parsed.subscriptions.length,
        types: parsed.types.length,
      },
      operations: {
        queries: parsed.queries.map(q => ({
          name: q.name,
          description: q.description,
          arguments: q.arguments,
          returnType: q.returnType,
          inputSchema: q.inputSchema,
          outputSchema: q.outputSchema,
        })),
        mutations: parsed.mutations.map(m => ({
          name: m.name,
          description: m.description,
          arguments: m.arguments,
          returnType: m.returnType,
          inputSchema: m.inputSchema,
          outputSchema: m.outputSchema,
        })),
      },
    });
  } catch (error) {
    console.error('GraphQL fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

