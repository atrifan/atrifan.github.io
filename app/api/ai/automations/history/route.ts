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

// GET - Fetch prompt history for an automation
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const automationId = searchParams.get('automationId');

    if (!automationId) {
      return NextResponse.json({ error: 'Automation ID is required' }, { status: 400 });
    }

    // Verify user owns this automation
    const { data: automation, error: autoError } = await supabase
      .from('automations')
      .select('id')
      .eq('id', automationId)
      .eq('user_id', userId)
      .single();

    if (autoError || !automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    // Fetch prompt history
    const { data: history, error } = await supabase
      .from('automation_prompt_history')
      .select('id, prompt, response_mermaid, input_tokens, output_tokens, created_at')
      .eq('automation_id', automationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch prompt history:', error);
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }

    return NextResponse.json({ history: history || [] });
  } catch (error) {
    console.error('Automation history GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

