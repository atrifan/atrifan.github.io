import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Get a single RAG with tool info
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Get the RAG
    const { data: rag, error: ragError } = await db
      .from('user_rags')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (ragError || !rag) {
      return NextResponse.json({ error: 'RAG not found' }, { status: 404 });
    }

    // Get the associated tool if exists
    let tool = null;
    if (rag.tool_id) {
      const { data: toolData } = await db
        .from('tools')
        .select('*')
        .eq('id', rag.tool_id)
        .single();
      tool = toolData;
    }

    return NextResponse.json({
      rag,
      tool,
    });
  } catch (error) {
    console.error('Error fetching RAG:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a RAG (tool is deleted via trigger)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Delete the RAG (trigger will delete associated tool)
    const { error } = await db
      .from('user_rags')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting RAG:', error);
      return NextResponse.json({ error: 'Failed to delete RAG' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting RAG:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update a RAG
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();

    const {
      name,
      description,
      icon,
      topN,
      tokenLimit,
      isEnabled,
      fieldConfig,
    } = body;

    // Build update object
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (icon !== undefined) updates.icon = icon;
    if (topN !== undefined) updates.top_n = topN;
    if (tokenLimit !== undefined) updates.token_limit = tokenLimit;
    if (isEnabled !== undefined) updates.is_enabled = isEnabled;
    if (fieldConfig !== undefined) updates.field_config = fieldConfig;

    const { data, error } = await db
      .from('user_rags')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating RAG:', error);
      return NextResponse.json({ error: 'Failed to update RAG' }, { status: 500 });
    }

    return NextResponse.json({ rag: data });
  } catch (error) {
    console.error('Error updating RAG:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

