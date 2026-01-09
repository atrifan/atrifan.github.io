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

// Estimate token count (rough: ~4 chars per token)
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// GET - List user's personalities and active ones
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

    // Get all personalities
    const { data: personalities, error: pError } = await supabase
      .from('chat_personalities')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (pError) {
      console.error('Error fetching personalities:', pError);
      return NextResponse.json({ error: 'Failed to fetch personalities' }, { status: 500 });
    }

    // Get active personalities
    const { data: active, error: aError } = await supabase
      .from('chat_active_personalities')
      .select('personality_id, priority')
      .eq('user_id', userId)
      .order('priority', { ascending: true });

    if (aError) {
      console.error('Error fetching active personalities:', aError);
    }

    const activeIds = (active || []).map(a => a.personality_id);
    
    // Calculate combined system prompt tokens
    const activePersonalities = (personalities || []).filter(p => activeIds.includes(p.id));
    const totalSystemTokens = activePersonalities.reduce((sum, p) => sum + (p.prompt_token_count || 0), 0);

    return NextResponse.json({
      personalities: personalities || [],
      activeIds,
      totalSystemTokens,
    });
  } catch (error) {
    console.error('Error in personalities GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new personality
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
    const { name, description, icon, systemPrompt, isDefault } = body;

    if (!name || !systemPrompt) {
      return NextResponse.json({ error: 'Name and system prompt are required' }, { status: 400 });
    }

    const tokenCount = estimateTokens(systemPrompt);

    const { data, error } = await supabase
      .from('chat_personalities')
      .insert({
        user_id: userId,
        name: name.trim(),
        description: description?.trim() || null,
        icon: icon || '🤖',
        system_prompt: systemPrompt,
        prompt_token_count: tokenCount,
        is_default: isDefault || false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating personality:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A personality with this name already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create personality' }, { status: 500 });
    }

    return NextResponse.json({ personality: data });
  } catch (error) {
    console.error('Error in personalities POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update a personality
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
    const { id, name, description, icon, systemPrompt, isDefault } = body;

    if (!id) {
      return NextResponse.json({ error: 'Personality ID required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (icon) updates.icon = icon;
    if (systemPrompt) {
      updates.system_prompt = systemPrompt;
      updates.prompt_token_count = estimateTokens(systemPrompt);
    }
    if (isDefault !== undefined) updates.is_default = isDefault;

    const { data, error } = await supabase
      .from('chat_personalities')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating personality:', error);
      return NextResponse.json({ error: 'Failed to update personality' }, { status: 500 });
    }

    return NextResponse.json({ personality: data });
  } catch (error) {
    console.error('Error in personalities PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a personality
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
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Personality ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('chat_personalities')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting personality:', error);
      return NextResponse.json({ error: 'Failed to delete personality' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in personalities DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

