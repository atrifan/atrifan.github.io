/**
 * GraphQL Operation Management API
 * 
 * PATCH /api/graphql/operations/[opId] - Update operation's tool (name, description, widget)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ opId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { opId } = await params;
    const body = await request.json();
    const { description, hasWidget } = body;

    // Get operation and verify ownership through spec
    const { data: operation } = await supabase
      .from('graphql_operations')
      .select('id, tool_id, spec_id')
      .eq('id', opId)
      .single();

    if (!operation) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }

    const { data: spec } = await supabase
      .from('graphql_specs')
      .select('user_id')
      .eq('id', (operation as { spec_id: string }).spec_id)
      .single();

    if (!spec || (spec as { user_id: string }).user_id !== userId) {
      return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
    }

    // Update the tool
    const toolId = (operation as { tool_id: string }).tool_id;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    
    if (description !== undefined) updates.description = description;
    if (hasWidget !== undefined) updates.has_widget = hasWidget;

    const { error } = await supabase
      .from('tools')
      .update(updates as never)
      .eq('id', toolId);

    if (error) {
      console.error('Error updating tool:', error);
      return NextResponse.json({ error: 'Failed to update operation' }, { status: 500 });
    }

    // Also update the operation description if provided
    if (description !== undefined) {
      await supabase
        .from('graphql_operations')
        .update({ description, updated_at: new Date().toISOString() } as never)
        .eq('id', opId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating GraphQL operation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

