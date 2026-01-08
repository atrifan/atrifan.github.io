/**
 * REST API Tool Management API
 * 
 * PATCH /api/swagger/tools/[toolId] - Update tool (name, description, widget)
 * DELETE /api/swagger/tools/[toolId] - Delete a single tool
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ toolId: string }>;
}

// PATCH - Update tool
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { toolId } = await params;
    const body = await request.json();
    const { name, description, hasWidget } = body;

    // Verify ownership (tool must belong to user)
    const { data: existingTool } = await supabase
      .from('tools')
      .select('id, user_id')
      .eq('id', toolId)
      .single();

    if (!existingTool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    }

    const tool = existingTool as { id: string; user_id: string | null };
    if (tool.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Build update object
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (hasWidget !== undefined) updates.has_widget = hasWidget;

    const { error } = await supabase
      .from('tools')
      .update(updates as never)
      .eq('id', toolId);

    if (error) {
      console.error('Error updating tool:', error);
      // Check for unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A tool with this name already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to update tool' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating tool:', error);
    return NextResponse.json({ error: 'Failed to update tool' }, { status: 500 });
  }
}

// DELETE - Delete tool
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { toolId } = await params;

    // Verify ownership
    const { data: existingTool } = await supabase
      .from('tools')
      .select('id, user_id')
      .eq('id', toolId)
      .single();

    if (!existingTool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    }

    const tool = existingTool as { id: string; user_id: string | null };
    if (tool.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Delete endpoint reference first (cascade should handle, but be explicit)
    await supabase.from('rest_api_endpoints').delete().eq('tool_id', toolId);

    // Delete the tool
    const { error } = await supabase.from('tools').delete().eq('id', toolId);

    if (error) {
      console.error('Error deleting tool:', error);
      return NextResponse.json({ error: 'Failed to delete tool' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tool:', error);
    return NextResponse.json({ error: 'Failed to delete tool' }, { status: 500 });
  }
}

