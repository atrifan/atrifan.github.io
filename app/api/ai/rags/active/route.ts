import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// POST - Link a RAG (make it active)
// Body: { ragId, priority?, context?: 'chat' | 'automation' }
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ragId, priority, context = 'chat' } = body;

    if (!ragId) {
      return NextResponse.json({ error: 'RAG ID required' }, { status: 400 });
    }

    // Verify RAG belongs to user
    const { data: rag } = await db
      .from('user_rags')
      .select('id')
      .eq('id', ragId)
      .eq('user_id', userId)
      .single();

    if (!rag) {
      return NextResponse.json({ error: 'RAG not found' }, { status: 404 });
    }

    // Get current max priority for this context
    const { data: existing } = await db
      .from('chat_active_rags')
      .select('priority')
      .eq('user_id', userId)
      .eq('context', context)
      .order('priority', { ascending: false })
      .limit(1);

    const newPriority = priority ?? (((existing as { priority: number }[] | null)?.[0]?.priority ?? -1) + 1);

    // Insert or update
    const { data, error } = await db
      .from('chat_active_rags')
      .upsert({
        user_id: userId,
        rag_id: ragId,
        priority: newPriority,
        context,
      }, { onConflict: 'user_id,rag_id,context' })
      .select()
      .single();

    if (error) {
      console.error('Error linking RAG:', error);
      return NextResponse.json({ error: 'Failed to link RAG' }, { status: 500 });
    }

    return NextResponse.json({ success: true, active: data });
  } catch (error) {
    console.error('Error in active RAGs POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Unlink a RAG (make it inactive)
// Query params: ragId, context=chat|automation (default: chat)
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ragId = searchParams.get('ragId');
    const context = searchParams.get('context') || 'chat';

    if (!ragId) {
      return NextResponse.json({ error: 'RAG ID required' }, { status: 400 });
    }

    const { error } = await db
      .from('chat_active_rags')
      .delete()
      .eq('user_id', userId)
      .eq('rag_id', ragId)
      .eq('context', context);

    if (error) {
      console.error('Error unlinking RAG:', error);
      return NextResponse.json({ error: 'Failed to unlink RAG' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in active RAGs DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Reorder active RAGs
// Body: { orderedIds, context?: 'chat' | 'automation' }
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orderedIds, context = 'chat' } = body;

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'orderedIds array required' }, { status: 400 });
    }

    // Update priorities for the specified context
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .from('chat_active_rags')
        .update({ priority: i })
        .eq('user_id', userId)
        .eq('rag_id', orderedIds[i])
        .eq('context', context);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in active RAGs PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

