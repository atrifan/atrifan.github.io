import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * RAG query endpoint for native-host.
 * Text search against the user's knowledge base documents.
 *
 * POST body:
 * - query: string (the search query)
 * - rag_name?: string (optional specific RAG to search, defaults to all)
 * - limit?: number (max results, default 5)
 *
 * Headers:
 * - Authorization: Bearer <api_key>
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const supabase = getSupabase();

  const { data: keyRecord, error } = await supabase
    .from('api_keys')
    .select('user_id, plan, is_active')
    .eq('api_key_hash', apiKeyHash)
    .eq('is_active', true)
    .single();

  if (error || !keyRecord) {
    return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
  }

  if (keyRecord.plan === 'free') {
    return NextResponse.json({ error: 'plan_required' }, { status: 403 });
  }

  const body = await req.json();
  const { query, rag_name, limit = 5 } = body;

  if (!query || typeof query !== 'string') {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  let ragQuery = supabase
    .from('user_rags')
    .select('id, name')
    .eq('user_id', keyRecord.user_id);

  if (rag_name) {
    ragQuery = ragQuery.eq('name', rag_name);
  }

  const { data: rags } = await ragQuery;

  if (!rags || rags.length === 0) {
    return NextResponse.json({ results: [], message: 'No knowledge bases found' });
  }

  const ragIds = rags.map(r => r.id);

  // Text search against rag_documents
  const { data: textResults } = await supabase
    .from('rag_documents')
    .select('content, rag_id')
    .in('rag_id', ragIds)
    .textSearch('content', query)
    .limit(limit);

  await supabase.from('api_usage_log').insert({
    user_id: keyRecord.user_id,
    event_type: 'rag_query',
    metadata: { query: query.slice(0, 100), rag_name },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    results: (textResults || []).map((r: { content: string; rag_id: string }) => ({
      content: r.content,
      score: null,
      rag_id: r.rag_id,
    })),
  });
}
