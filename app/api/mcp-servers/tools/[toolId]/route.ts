/**
 * MCP Server Tool Management API
 * 
 * PATCH /api/mcp-servers/tools/[toolId] - Update tool (name, description, hasWidget)
 * DELETE /api/mcp-servers/tools/[toolId] - Delete a tool
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
      .select('id, user_id, tool_type')
      .eq('id', toolId)
      .single();

    if (!existingTool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    }

    const tool = existingTool as { id: string; user_id: string | null; tool_type: string };
    if (tool.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Verify it's an MCP tool
    if (tool.tool_type !== 'MCP') {
      return NextResponse.json({ error: 'Not an MCP tool' }, { status: 400 });
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
      return NextResponse.json({ error: 'Failed to update tool' }, { status: 500 });
    }

    // Also update the mcp_server_tools record if hasWidget is provided
    if (hasWidget !== undefined) {
      await supabase
        .from('mcp_server_tools')
        .update({ has_widget: hasWidget } as never)
        .eq('tool_id', toolId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating MCP tool:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    // Verify ownership (tool must belong to user)
    const { data: existingTool } = await supabase
      .from('tools')
      .select('id, user_id, tool_type')
      .eq('id', toolId)
      .single();

    if (!existingTool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    }

    const tool = existingTool as { id: string; user_id: string | null; tool_type: string };
    if (tool.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Verify it's an MCP tool
    if (tool.tool_type !== 'MCP') {
      return NextResponse.json({ error: 'Not an MCP tool' }, { status: 400 });
    }

    // Delete the mcp_server_tools record first (foreign key)
    await supabase
      .from('mcp_server_tools')
      .delete()
      .eq('tool_id', toolId);

    // Delete the tool
    const { error } = await supabase
      .from('tools')
      .delete()
      .eq('id', toolId);

    if (error) {
      console.error('Error deleting tool:', error);
      return NextResponse.json({ error: 'Failed to delete tool' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting MCP tool:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

