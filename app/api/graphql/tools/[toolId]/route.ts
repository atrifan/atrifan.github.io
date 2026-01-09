/**
 * GraphQL Tool Management API
 * 
 * PATCH /api/graphql/tools/[toolId] - Update tool (description, hasWidget)
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
    const { description, hasWidget } = body;

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

    // Verify it's a GraphQL tool
    if (tool.tool_type !== 'GQL') {
      return NextResponse.json({ error: 'Not a GraphQL tool' }, { status: 400 });
    }

    // Build update object
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating GraphQL tool:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

