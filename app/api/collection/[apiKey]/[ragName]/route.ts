/**
 * Unified Collection Search API
 *
 * Endpoint: GET/POST /api/collection/{apiKey}/{ragName}
 *
 * Unified handler for both CSV (internal/Upstash) and URL (external/proxy) RAGs.
 * Like MCP pattern: validates API key, gets user_id, then routes based on source_type.
 *
 * Flow:
 * 1. Validate API key → extract user_id
 * 2. Fetch RAG config → check source_type
 * 3. CSV: query Upstash with user_id + rag_name
 * 4. URL: proxy to external endpoint with configured auth
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

interface RAGRecord {
  id: string;
  name: string;
  rag_name: string;
  source_type: 'csv' | 'url';
  source_url: string | null;
  top_n: number;
  http_method: 'GET' | 'POST';
  params_location: 'query' | 'body';
  request_content_type: string;
  field_mapping: Record<string, string>;
  auth_type: string;
  auth_config: Record<string, unknown>;
  custom_headers: Record<string, string>;
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

  // Fetch full RAG config including source_type and external config
  const { data: rag } = await db
    .from('user_rags')
    .select('id, name, rag_name, source_type, source_url, top_n, http_method, params_location, request_content_type, field_mapping, auth_type, auth_config, custom_headers')
    .eq('user_id', userId)
    .or(`rag_name.eq.${ragName},name.ilike.${ragName}`)
    .single();

  if (!rag) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 });
  }

  const ragData = rag as RAGRecord;
  const effectiveTopK = Math.min(topK || ragData.top_n || 5, 20);

  // Route based on source_type (like MCP internal vs external)
  if (ragData.source_type === 'url' && ragData.source_url) {
    return handleExternalQuery(ragData, query, effectiveTopK, ragName);
  } else {
    return handleInternalQuery(userId, ragData, query, effectiveTopK, ragName);
  }
}

// Internal CSV RAG - query Upstash directly
async function handleInternalQuery(
  userId: string,
  rag: RAGRecord,
  query: string,
  topK: number,
  ragName: string
): Promise<NextResponse> {
  if (!isUpstashConfigured()) {
    return NextResponse.json({
      error: 'Vector search not configured',
      message: 'Upstash Vector is not configured on this server'
    }, { status: 503 });
  }

  try {
    const results = await queryCollection(userId, rag.rag_name || ragName, query, topK);

    return NextResponse.json({
      success: true,
      source: 'internal',
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
    console.error('Error querying Upstash:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}


// External URL RAG - proxy to remote endpoint (like MCP external)
async function handleExternalQuery(
  rag: RAGRecord,
  query: string,
  topK: number,
  ragName: string
): Promise<NextResponse> {
  const fieldMapping = rag.field_mapping || {};
  const params: Record<string, string | number> = {
    [fieldMapping.query || 'query']: query,
    [fieldMapping.top_n || 'top_n']: topK,
  };

  // Build headers
  const headers: Record<string, string> = { ...rag.custom_headers };

  // Add auth headers based on auth_type
  if (rag.auth_type === 'api_key' && rag.auth_config) {
    const headerName = (rag.auth_config.header_name as string) || 'X-API-Key';
    const apiKeyValue = rag.auth_config.api_key as string;
    if (apiKeyValue) headers[headerName] = apiKeyValue;
  } else if (rag.auth_type === 'bearer' && rag.auth_config) {
    const token = rag.auth_config.token as string;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } else if (rag.auth_type === 'basic' && rag.auth_config) {
    const username = rag.auth_config.username as string;
    const password = rag.auth_config.password as string;
    if (username && password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    }
  }

  // Build request URL and body
  let requestUrl = rag.source_url!;
  let requestBody: string | undefined;

  if (rag.params_location === 'query') {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.set(key, String(value));
    });
    requestUrl = `${rag.source_url}${rag.source_url!.includes('?') ? '&' : '?'}${searchParams.toString()}`;
  } else {
    headers['Content-Type'] = rag.request_content_type || 'application/json';
    if (rag.request_content_type === 'application/json') {
      requestBody = JSON.stringify(params);
    } else {
      const formParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        formParams.set(key, String(value));
      });
      requestBody = formParams.toString();
    }
  }

  try {
    const response = await fetch(requestUrl, {
      method: rag.http_method || 'POST',
      headers,
      body: rag.http_method === 'POST' ? requestBody : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('External RAG error:', response.status, errorText);
      return NextResponse.json({
        error: 'External RAG query failed',
        status: response.status,
      }, { status: 502 });
    }

    const data = await response.json();

    // Normalize response format - external RAGs may return results differently
    const resultsField = fieldMapping.results || 'results';
    const results = data[resultsField] || data.data || data.items || data.documents || [];

    return NextResponse.json({
      success: true,
      source: 'external',
      collection: ragName,
      query,
      results: Array.isArray(results) ? results.map((r: Record<string, unknown>, idx: number) => ({
        id: r.id || `result-${idx}`,
        score: r.score || r.similarity || r.relevance || 1,
        title: r.title || r.name || '',
        content: r.content || r.text || r.body || r.document || '',
        source: r.source || r.url || r.link || '',
      })) : [],
      count: Array.isArray(results) ? results.length : 0,
    });
  } catch (error) {
    console.error('Error proxying to external RAG:', error);
    return NextResponse.json({
      error: 'Failed to connect to external RAG',
    }, { status: 502 });
  }
}


