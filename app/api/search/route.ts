/**
 * Website Smart Search API
 * 
 * Endpoint: GET/POST /api/search
 * 
 * Searches the website's own vector database using api_key="tulzo".
 * This is used for the site-wide smart search feature.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryWebsite, isUpstashConfigured } from '@/src/lib/upstash-vector';

export const dynamic = 'force-dynamic';

// GET - Search with query parameter
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || searchParams.get('query');
  const topK = parseInt(searchParams.get('top_k') || searchParams.get('limit') || '5', 10);

  return handleSearch(query, topK);
}

// POST - Search with body
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query || body.q;
    const topK = body.top_k || body.limit || 5;

    return handleSearch(query, topK);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}

async function handleSearch(
  query: string | null,
  topK: number
): Promise<NextResponse> {
  if (!query) {
    return NextResponse.json({ 
      error: 'Query required. Use ?q=your+query or POST with {"query": "..."}' 
    }, { status: 400 });
  }

  // Check if Upstash is configured
  if (!isUpstashConfigured()) {
    return NextResponse.json({ 
      error: 'Vector search not configured',
      message: 'Upstash Vector is not configured on this server'
    }, { status: 503 });
  }

  try {
    // Query website vectors (api_key = "tulzo")
    const effectiveTopK = Math.min(topK, 20);
    const results = await queryWebsite(query, effectiveTopK);

    return NextResponse.json({
      success: true,
      query,
      results: results.map(r => ({
        id: r.id,
        score: r.score,
        title: r.metadata.title,
        content: r.metadata.content,
        source: r.metadata.source,
        rag_name: r.metadata.rag_name, // Include collection name for context
      })),
      count: results.length,
    });
  } catch (error) {
    console.error('Error in website search:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

