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

// GET - List all automations for user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const { data: automations, error } = await supabase
      .from('automations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch automations:', error);
      return NextResponse.json({ error: 'Failed to fetch automations' }, { status: 500 });
    }

    return NextResponse.json({ automations: automations || [] });
  } catch (error) {
    console.error('Automations GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create new automation
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const { name, display_name, description, category, model_id, personality_ids } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const { data: automation, error } = await supabase
      .from('automations')
      .insert({
        user_id: userId,
        name,
        display_name: display_name || name,
        description: description || '',
        category: category || 'general',
        model_id: model_id || 'meta-llama/llama-3.1-8b-instruct:free',
        personality_ids: personality_ids || [],
        flow_definition: { nodes: [], edges: [] },
        mermaid_diagram: 'flowchart TD\n  start([Start]) --> end_node([End])',
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create automation:', error);
      return NextResponse.json({ error: 'Failed to create automation' }, { status: 500 });
    }

    return NextResponse.json({ automation });
  } catch (error) {
    console.error('Automations POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update automation
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Automation ID is required' }, { status: 400 });
    }

    // Only allow updating certain fields
    const allowedFields = [
      'name', 'display_name', 'description', 'category',
      'flow_definition', 'mermaid_diagram', 'yaml_definition', 'typescript_code',
      'model_id', 'personality_ids',
      'schedule_type', 'schedule_config', 'trigger_config', 'cron_expression',
      'required_inputs', 'output_config',
      'workflow_version', 'status'
    ];
    const filteredUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) {
        filteredUpdates[key] = updates[key];
      }
    }

    const { data: automation, error } = await supabase
      .from('automations')
      .update(filteredUpdates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update automation:', error);
      return NextResponse.json({ error: 'Failed to update automation' }, { status: 500 });
    }

    return NextResponse.json({ automation });
  } catch (error) {
    console.error('Automations PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete automation
export async function DELETE(request: NextRequest) {
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
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Automation ID is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('automations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Failed to delete automation:', error);
      return NextResponse.json({ error: 'Failed to delete automation' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Automations DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

