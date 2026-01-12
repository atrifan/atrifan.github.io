import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// POST - Link a personality (make it active)
// Body: { personalityId, priority?, context?: 'chat' | 'automation' }
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { personalityId, priority, context = 'chat' } = body;

    if (!personalityId) {
      return NextResponse.json({ error: 'Personality ID required' }, { status: 400 });
    }

    // Verify personality belongs to user
    const { data: personality } = await db
      .from('chat_personalities')
      .select('id')
      .eq('id', personalityId)
      .eq('user_id', userId)
      .single();

    if (!personality) {
      return NextResponse.json({ error: 'Personality not found' }, { status: 404 });
    }

    // Get current max priority for this context
    const { data: existing } = await db
      .from('chat_active_personalities')
      .select('priority')
      .eq('user_id', userId)
      .eq('context', context)
      .order('priority', { ascending: false })
      .limit(1);

    const newPriority = priority ?? (((existing as { priority: number }[] | null)?.[0]?.priority ?? -1) + 1);

    // Insert or update
    const { data, error } = await db
      .from('chat_active_personalities')
      .upsert({
        user_id: userId,
        personality_id: personalityId,
        priority: newPriority,
        context,
      }, { onConflict: 'user_id,personality_id,context' })
      .select()
      .single();

    if (error) {
      console.error('Error linking personality:', error);
      return NextResponse.json({ error: 'Failed to link personality' }, { status: 500 });
    }

    return NextResponse.json({ success: true, active: data });
  } catch (error) {
    console.error('Error in active personalities POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Unlink a personality (make it inactive)
// Query params: personalityId, context=chat|automation (default: chat)
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const personalityId = searchParams.get('personalityId');
    const context = searchParams.get('context') || 'chat';

    if (!personalityId) {
      return NextResponse.json({ error: 'Personality ID required' }, { status: 400 });
    }

    const { error } = await db
      .from('chat_active_personalities')
      .delete()
      .eq('user_id', userId)
      .eq('personality_id', personalityId)
      .eq('context', context);

    if (error) {
      console.error('Error unlinking personality:', error);
      return NextResponse.json({ error: 'Failed to unlink personality' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in active personalities DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Reorder active personalities
// Body: { orderedIds, context?: 'chat' | 'automation' }
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orderedIds, context = 'chat' } = body; // Array of personality IDs in order

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'orderedIds array required' }, { status: 400 });
    }

    // Update priorities for the specified context
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .from('chat_active_personalities')
        .update({ priority: i })
        .eq('user_id', userId)
        .eq('personality_id', orderedIds[i])
        .eq('context', context);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in active personalities PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

