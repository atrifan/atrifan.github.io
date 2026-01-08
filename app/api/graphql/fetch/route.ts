/**
 * GraphQL Schema Fetch API
 * 
 * POST /api/graphql/fetch
 * Fetch and introspect a GraphQL schema from a URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchGraphQLSchema } from '@/src/lib/graphql-handler';
import { parseGraphQLSchema } from '@/src/lib/graphql-parser';

export const dynamic = 'force-dynamic';

interface FetchRequest {
  url: string;
  headers?: Record<string, string>;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body: FetchRequest = await request.json();
    const { url, headers } = body;

    if (!url) {
      return NextResponse.json({ error: 'Missing required field: url' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
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
        })),
        mutations: parsed.mutations.map(m => ({
          name: m.name,
          description: m.description,
          arguments: m.arguments,
          returnType: m.returnType,
        })),
      },
    });
  } catch (error) {
    console.error('GraphQL fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

