/**
 * Collection Search API
 * 
 * Endpoint: GET/POST /api/collection/{apiKey}/{ragName}
 * 
 * Searches a user's RAG collection by api_key and rag_name.
 * Validates that the API key exists and the RAG belongs to that user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/src/lib/supabase';
import { queryCollection, isUpstashConfigured } from '@/src/lib/upstash-vector';
import { getApiKeyByHash, hashApiKey } from '@/src/lib/supabase-services';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface RouteParams {
  params: Promise<{
    apiKey: string;
    ragName: string;
  }>;
}

// GET - Search collection with query parameter
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { apiKey, ragName } = await params;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || searchParams.get('query');
  const topK = parseInt(searchParams.get('top_k') || searchParams.get('limit') || '5', 10);

  return handleSearch(apiKey, ragName, query, topK);
}

// POST - Search collection with body
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { apiKey, ragName } = await params;
  
  try {
    const body = await request.json();
    const query = body.query || body.q;
    const topK = body.top_k || body.limit || 5;

    return handleSearch(apiKey, ragName, query, topK);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}

async function handleSearch(
  apiKey: string,
  ragName: string,
  query: string | null,
  topK: number
): Promise<NextResponse> {
  // Validate inputs
  if (!apiKey) {
    return NextResponse.json({ error: 'API key required' }, { status: 400 });
  }

  if (!ragName) {
    return NextResponse.json({ error: 'RAG name required' }, { status: 400 });
  }

  if (!query) {
    return NextResponse.json({ error: 'Query required. Use ?q=your+query or POST with {"query": "..."}' }, { status: 400 });
  }

  // Validate API key exists by hash lookup
  const apiKeyRecord = await getApiKeyByHash(hashApiKey(apiKey));

  if (!apiKeyRecord || !apiKeyRecord.is_active) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  const userId = apiKeyRecord.user_id;

  // Validate RAG exists and belongs to user
  const { data: rag } = await db
    .from('user_rags')
    .select('id, name, rag_name, top_n')
    .eq('user_id', userId)
    .or(`rag_name.eq.${ragName},name.ilike.${ragName}`)
    .single();

  if (!rag) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  // Use RAG's configured top_n if not specified
  const effectiveTopK = Math.min(topK || rag.top_n || 5, 20);

  // Check if Upstash is configured
  if (!isUpstashConfigured()) {
    return NextResponse.json({ 
      error: 'Vector search not configured',
      message: 'Upstash Vector is not configured on this server'
    }, { status: 503 });
  }

  try {
    // Query Upstash Vector (use userId as namespace, not apiKey)
    const results = await queryCollection(userId, rag.rag_name || ragName, query, effectiveTopK);

    return NextResponse.json({
      success: true,
      collection: ragName,
      query,
      results: results.map(r => ({
        id: r.id,
        score: r.score,
        title: r.metadata.title,
        content: r.metadata.content,
        source: r.metadata.source,
      })),
      count: results.length,
    });
  } catch (error) {
    console.error('Error querying collection:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}

