import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - List user's RAG search sessions
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { data: sessions, error } = await supabase
      .from('rag_search_sessions')
      .select('id, title, rag_id, rag_name, embedding_model, message_count, total_tokens, total_cost, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching RAG sessions:', error);
      return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
    }

    return NextResponse.json({ sessions: sessions || [] });
  } catch (error) {
    console.error('Error in RAG sessions API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new RAG search session
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { title, ragId, ragName, embeddingModel } = body;

    const { data, error } = await supabase
      .from('rag_search_sessions')
      .insert({
        user_id: userId,
        title: title || 'New Search',
        rag_id: ragId || null,
        rag_name: ragName || null,
        embedding_model: embeddingModel || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating RAG session:', error);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({ session: data });
  } catch (error) {
    console.error('Error in RAG sessions POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Clear all RAG search sessions
export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { error } = await supabase
      .from('rag_search_sessions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error clearing RAG sessions:', error);
      return NextResponse.json({ error: 'Failed to clear sessions' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in RAG sessions DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

