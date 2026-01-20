/**
 * Multi-RAG Context Search API
 * 
 * POST /api/ai/rag-context
 * 
 * Searches multiple RAGs simultaneously and returns combined results with source attribution.
 * Used by ChatPage and AutomationPage to inject RAG context into prompts.
 * 
 * Body:
 * - ragIds: string[] - Array of RAG IDs to search
 * - query: string - The search query (usually the user's message)
 * - topK?: number - Results per RAG (default 3)
 * 
 * Returns:
 * - results: Array of { ragId, ragName, ragIcon, results: SearchResult[] }
 * - contextString: Formatted string for system prompt injection
 * - totalResults: Total number of results across all RAGs
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { queryCollection, isUpstashConfigured } from '@/src/lib/upstash-vector';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface RAGRecord {
  id: string;
  name: string;
  rag_name: string;
  icon: string;
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

interface SearchResult {
  id: string;
  score: number;
  title?: string;
  content: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

interface RAGSearchResult {
  ragId: string;
  ragName: string;
  ragIcon: string;
  sourceType: 'csv' | 'url';
  results: SearchResult[];
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ragIds, query, topK = 3 } = body;

    if (!ragIds || !Array.isArray(ragIds) || ragIds.length === 0) {
      return NextResponse.json({ error: 'ragIds array required' }, { status: 400 });
    }

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query string required' }, { status: 400 });
    }

    // Fetch all requested RAGs
    const { data: rags, error: ragsError } = await db
      .from('user_rags')
      .select('id, name, rag_name, icon, source_type, source_url, top_n, http_method, params_location, request_content_type, field_mapping, auth_type, auth_config, custom_headers')
      .eq('user_id', userId)
      .in('id', ragIds);

    if (ragsError) {
      console.error('Error fetching RAGs:', ragsError);
      return NextResponse.json({ error: 'Failed to fetch RAGs' }, { status: 500 });
    }

    const ragRecords = (rags || []) as RAGRecord[];
    const effectiveTopK = Math.min(topK, 10);

    // Search each RAG in parallel
    const searchPromises = ragRecords.map(rag => searchRAG(userId, rag, query, effectiveTopK));
    const searchResults = await Promise.all(searchPromises);

    // Build context string for system prompt
    const contextParts: string[] = [];
    let totalResults = 0;

    for (const result of searchResults) {
      if (result.results.length > 0) {
        totalResults += result.results.length;
        contextParts.push(`\n### From "${result.ragName}" knowledge base:\n`);
        result.results.forEach((r, i) => {
          const title = r.title ? `**${r.title}**\n` : '';
          contextParts.push(`${i + 1}. ${title}${r.content}\n`);
        });
      }
    }

    const contextString = totalResults > 0
      ? `## Relevant Knowledge Base Context:\n${contextParts.join('\n')}\n---\n\n`
      : '';

    return NextResponse.json({
      success: true,
      results: searchResults,
      contextString,
      totalResults,
    });
  } catch (error) {
    console.error('RAG context search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function searchRAG(
  userId: string,
  rag: RAGRecord,
  query: string,
  topK: number
): Promise<RAGSearchResult> {
  const baseResult: RAGSearchResult = {
    ragId: rag.id,
    ragName: rag.name,
    ragIcon: rag.icon || '📚',
    sourceType: rag.source_type,
    results: [],
  };

  try {
    if (rag.source_type === 'url' && rag.source_url) {
      return await searchExternalRAG(rag, query, topK, baseResult);
    } else {
      return await searchInternalRAG(userId, rag, query, topK, baseResult);
    }
  } catch (error) {
    console.error(`Error searching RAG ${rag.name}:`, error);
    return { ...baseResult, error: 'Search failed' };
  }
}

// Search internal CSV RAG via Upstash
async function searchInternalRAG(
  userId: string,
  rag: RAGRecord,
  query: string,
  topK: number,
  baseResult: RAGSearchResult
): Promise<RAGSearchResult> {
  if (!isUpstashConfigured()) {
    return { ...baseResult, error: 'Vector search not configured' };
  }

  const results = await queryCollection(userId, rag.rag_name, query, topK);

  return {
    ...baseResult,
    results: results.map(r => ({
      id: r.id,
      score: r.score,
      title: r.metadata.title,
      content: r.metadata.content,
      source: r.metadata.source,
    })),
  };
}

// Search external URL RAG via proxy
async function searchExternalRAG(
  rag: RAGRecord,
  query: string,
  topK: number,
  baseResult: RAGSearchResult
): Promise<RAGSearchResult> {
  const fieldMapping = rag.field_mapping || {};
  const params: Record<string, string | number> = {
    [fieldMapping.query || 'query']: query,
    [fieldMapping.top_n || 'top_n']: topK,
  };

  // Build headers
  const headers: Record<string, string> = { ...rag.custom_headers };

  // Add auth headers
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

  // Build request
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
    requestBody = JSON.stringify(params);
  }

  const response = await fetch(requestUrl, {
    method: rag.http_method || 'POST',
    headers,
    body: rag.http_method === 'POST' ? requestBody : undefined,
  });

  if (!response.ok) {
    return { ...baseResult, error: `External RAG returned ${response.status}` };
  }

  const data = await response.json();
  const resultsField = fieldMapping.results || 'results';
  const results = data[resultsField] || data.data || data.items || data.documents || [];

  return {
    ...baseResult,
    results: Array.isArray(results) ? results.slice(0, topK).map((r: Record<string, unknown>, idx: number) => ({
      id: String(r.id || `result-${idx}`),
      score: Number(r.score || r.similarity || r.relevance || 1),
      title: String(r.title || r.name || ''),
      content: String(r.content || r.text || r.body || r.document || ''),
      source: String(r.source || r.url || r.link || ''),
    })) : [],
  };
}

