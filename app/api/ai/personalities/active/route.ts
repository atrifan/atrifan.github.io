import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// POST - Link a personality (make it active)
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
    const { personalityId, priority } = body;

    if (!personalityId) {
      return NextResponse.json({ error: 'Personality ID required' }, { status: 400 });
    }

    // Verify personality belongs to user
    const { data: personality } = await supabase
      .from('chat_personalities')
      .select('id')
      .eq('id', personalityId)
      .eq('user_id', userId)
      .single();

    if (!personality) {
      return NextResponse.json({ error: 'Personality not found' }, { status: 404 });
    }

    // Get current max priority
    const { data: existing } = await supabase
      .from('chat_active_personalities')
      .select('priority')
      .eq('user_id', userId)
      .order('priority', { ascending: false })
      .limit(1);

    const newPriority = priority ?? ((existing?.[0]?.priority ?? -1) + 1);

    // Insert or update
    const { data, error } = await supabase
      .from('chat_active_personalities')
      .upsert({
        user_id: userId,
        personality_id: personalityId,
        priority: newPriority,
      }, { onConflict: 'user_id,personality_id' })
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
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const personalityId = searchParams.get('personalityId');

    if (!personalityId) {
      return NextResponse.json({ error: 'Personality ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('chat_active_personalities')
      .delete()
      .eq('user_id', userId)
      .eq('personality_id', personalityId);

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
export async function PUT(request: NextRequest) {
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
    const { orderedIds } = body; // Array of personality IDs in order

    if (!Array.isArray(orderedIds)) {
      return NextResponse.json({ error: 'orderedIds array required' }, { status: 400 });
    }

    // Update priorities
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase
        .from('chat_active_personalities')
        .update({ priority: i })
        .eq('user_id', userId)
        .eq('personality_id', orderedIds[i]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in active personalities PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

