import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { unifiedSearch, isAutomationEmbeddingsConfigured } from '@/src/lib/automation-embeddings';

export const dynamic = 'force-dynamic';

/**
 * POST /api/search/unified
 * 
 * Unified search across all user content and Tulzo website.
 * Searches: automations, chat history, RAG history, website pages
 * Results are sorted by relevance score.
 * 
 * Body:
 * - query: string - The search query
 * - topK?: number - Number of results (default 10, max 20)
 * - types?: string[] - Filter by types: 'automation', 'chat_history', 'rag_history', 'website', 'rag'
 * 
 * Returns:
 * - results: Array of { type, title, description, url, score, metadata }
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAutomationEmbeddingsConfigured()) {
      return NextResponse.json(
        { error: 'Search not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { query, topK = 10, types } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // Validate types if provided
    const validTypes = ['automation', 'chat_history', 'rag_history', 'website', 'rag'];
    if (types && Array.isArray(types)) {
      const invalidTypes = types.filter((t: string) => !validTypes.includes(t));
      if (invalidTypes.length > 0) {
        return NextResponse.json(
          { error: `Invalid types: ${invalidTypes.join(', ')}. Valid types: ${validTypes.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const results = await unifiedSearch({
      userId,
      query,
      topK: Math.min(topK, 20),
      includeTypes: types,
    });

    return NextResponse.json({
      success: true,
      query,
      results,
      totalResults: results.length,
    });
  } catch (error) {
    console.error('Unified search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/search/unified?q=query&topK=10&types=automation,website
 * 
 * Same as POST but with query params for convenience.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAutomationEmbeddingsConfigured()) {
      return NextResponse.json(
        { error: 'Search not configured' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const topK = parseInt(searchParams.get('topK') || '10', 10);
    const typesParam = searchParams.get('types');
    const types = typesParam ? typesParam.split(',') : undefined;

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const results = await unifiedSearch({
      userId,
      query,
      topK: Math.min(topK, 20),
      includeTypes: types as Array<'automation' | 'chat_history' | 'rag_history' | 'website' | 'rag'>,
    });

    return NextResponse.json({
      success: true,
      query,
      results,
      totalResults: results.length,
    });
  } catch (error) {
    console.error('Unified search error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

