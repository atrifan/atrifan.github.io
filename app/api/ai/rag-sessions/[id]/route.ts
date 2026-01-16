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

// GET - Get session with messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Get session
    const { data: session, error: sessError } = await supabase
      .from('rag_search_sessions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (sessError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get messages
    const { data: messages, error: msgError } = await supabase
      .from('rag_search_messages')
      .select('id, role, content, results, tokens, cost, created_at')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('Error fetching messages:', msgError);
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }

    return NextResponse.json({ session, messages: messages || [] });
  } catch (error) {
    console.error('Error in RAG session GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update session (title, add messages)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { title, userMessage, assistantMessage, results, tokens, cost } = body;

    // If just updating title
    if (title !== undefined && !userMessage) {
      const { data, error } = await supabase
        .from('rag_search_sessions')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating session:', error);
        return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
      }

      return NextResponse.json({ session: data });
    }

    // Adding messages
    if (userMessage) {
      // Insert user message
      await supabase.from('rag_search_messages').insert({
        session_id: id,
        role: 'user',
        content: userMessage,
      });

      // Insert assistant message with results
      if (assistantMessage) {
        await supabase.from('rag_search_messages').insert({
          session_id: id,
          role: 'assistant',
          content: assistantMessage,
          results: results || [],
          tokens: tokens || 0,
          cost: cost || 0,
        });
      }

      // Update session stats
      const { data: session } = await supabase
        .from('rag_search_sessions')
        .select('message_count, total_tokens, total_cost')
        .eq('id', id)
        .single();

      if (session) {
        await supabase
          .from('rag_search_sessions')
          .update({
            message_count: (session.message_count || 0) + 2,
            total_tokens: (session.total_tokens || 0) + (tokens || 0),
            total_cost: parseFloat(session.total_cost || 0) + (cost || 0),
            updated_at: new Date().toISOString(),
            title: title || (userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '')),
          })
          .eq('id', id);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'No update data provided' }, { status: 400 });
  } catch (error) {
    console.error('Error in RAG session PATCH:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete session
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { error } = await supabase
      .from('rag_search_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting session:', error);
      return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in RAG session DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

