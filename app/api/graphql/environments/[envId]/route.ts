/**
 * GraphQL Environment Delete API
 * 
 * DELETE /api/graphql/environments/[envId] - Delete an environment and its tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ envId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { envId } = await params;

    // Get environment and verify ownership
    const { data: env } = await supabase
      .from('environments')
      .select('id, user_id, name')
      .eq('id', envId)
      .single();

    if (!env || (env as { user_id: string }).user_id !== userId) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }

    const envName = (env as { name: string }).name;

    // Find all GQL tools for this environment (by name pattern)
    // Tool names follow pattern: {envName}-{serverName}-{operation}
    const envPrefix = envName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    
    const { data: tools } = await supabase
      .from('tools')
      .select('id')
      .eq('tool_type', 'GQL')
      .eq('user_id', userId)
      .like('name', `${envPrefix}_%`);

    const toolIds = (tools || []).map((t: { id: string }) => t.id);

    // Delete server_tools entries for these tools
    if (toolIds.length > 0) {
      await supabase.from('server_tools').delete().in('tool_id', toolIds);
    }

    // Delete graphql_environments link
    await supabase.from('graphql_environments').delete().eq('environment_id', envId);

    // Delete the environment
    const { error } = await supabase.from('environments').delete().eq('id', envId);

    if (error) {
      console.error('Error deleting environment:', error);
      return NextResponse.json({ error: 'Failed to delete environment' }, { status: 500 });
    }

    // Delete the tools
    if (toolIds.length > 0) {
      await supabase.from('tools').delete().in('id', toolIds);
    }

    return NextResponse.json({ success: true, toolsDeleted: toolIds.length });
  } catch (error) {
    console.error('Error deleting GraphQL environment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

