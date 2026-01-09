/**
 * REST API Environment Management API
 *
 * PATCH /api/swagger/environments/[envId] - Update environment (name, host)
 * DELETE /api/swagger/environments/[envId] - Delete environment
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { generateToolName, normalizeName } from '@/src/lib/openapi-parser';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ envId: string }>;
}

// PATCH - Update environment
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { envId } = await params;
    const body = await request.json();
    const { name, host } = body;

    // Verify ownership and get current environment data
    const { data: existingEnv } = await supabase
      .from('environments')
      .select('id, user_id, name')
      .eq('id', envId)
      .single();

    if (!existingEnv) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }

    const env = existingEnv as { id: string; user_id: string | null; name: string };
    if (env.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const oldEnvName = env.name;
    const newEnvName = name;

    // If name is changing, we need to rename all associated tools
    if (name !== undefined && name !== oldEnvName) {
      // Parse the old environment name to get serverName and envPrefix
      // Format is: serverName-envPrefix (e.g., "httpbin-prod")
      const dashIndex = oldEnvName.indexOf('-');
      if (dashIndex > 0) {
        const serverName = oldEnvName.substring(0, dashIndex);
        const oldEnvPrefix = oldEnvName.substring(dashIndex + 1);

        // Parse new environment name
        const newDashIndex = newEnvName.indexOf('-');
        const newEnvPrefix = newDashIndex > 0 ? newEnvName.substring(newDashIndex + 1) : newEnvName;

        // Get all tools linked to this environment via server_tools
        const { data: serverTools } = await supabase
          .from('server_tools')
          .select('tool_id')
          .eq('environment_id', envId);

        if (serverTools && serverTools.length > 0) {
          const toolIds = serverTools.map((st: { tool_id: string }) => st.tool_id);

          // Get the tools
          const { data: tools } = await supabase
            .from('tools')
            .select('id, name')
            .in('id', toolIds);

          if (tools) {
            // Rename each tool
            for (const tool of tools as { id: string; name: string }[]) {
              // Extract method and operation from old tool name
              // Format: oldEnvPrefix-serverName-method-operation or oldEnvPrefix-serverName-operation (legacy)
              const oldPrefix = `${normalizeName(oldEnvPrefix)}-${normalizeName(serverName)}-`;
              if (tool.name.startsWith(oldPrefix)) {
                const remainder = tool.name.substring(oldPrefix.length);
                // Check if remainder starts with an HTTP method
                const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
                const parts = remainder.split('-');
                let method = '';
                let operation = remainder;
                if (parts.length > 1 && httpMethods.includes(parts[0])) {
                  method = parts[0];
                  operation = parts.slice(1).join('-');
                }
                const newToolName = generateToolName(newEnvPrefix, serverName, operation, method || undefined);

                // Update tool name
                await supabase
                  .from('tools')
                  .update({ name: newToolName, updated_at: new Date().toISOString() } as never)
                  .eq('id', tool.id);
              }
            }
          }
        }
      }
    }

    // Build update object for environment
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (host !== undefined) updates.host = host;

    const { error } = await supabase
      .from('environments')
      .update(updates as never)
      .eq('id', envId);

    if (error) {
      console.error('Error updating environment:', error);
      return NextResponse.json({ error: 'Failed to update environment' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating environment:', error);
    return NextResponse.json({ error: 'Failed to update environment' }, { status: 500 });
  }
}

// DELETE - Delete environment
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { envId } = await params;

    // Verify ownership
    const { data: existingEnv } = await supabase
      .from('environments')
      .select('id, user_id')
      .eq('id', envId)
      .single();

    if (!existingEnv) {
      return NextResponse.json({ error: 'Environment not found' }, { status: 404 });
    }

    const env = existingEnv as { id: string; user_id: string | null };
    if (env.user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get all tools linked to this environment via server_tools
    const { data: serverTools } = await supabase
      .from('server_tools')
      .select('tool_id')
      .eq('environment_id', envId);

    const toolIds = serverTools?.map((st: { tool_id: string }) => st.tool_id) || [];

    // Delete server_tools entries first (before environment, to avoid ON DELETE SET NULL)
    if (toolIds.length > 0) {
      await supabase
        .from('server_tools')
        .delete()
        .eq('environment_id', envId);
    }

    // Delete the environment
    const { error } = await supabase.from('environments').delete().eq('id', envId);

    if (error) {
      console.error('Error deleting environment:', error);
      return NextResponse.json({ error: 'Failed to delete environment' }, { status: 500 });
    }

    // Delete the tools themselves (they are user-created REST tools)
    if (toolIds.length > 0) {
      const { error: toolsError } = await supabase
        .from('tools')
        .delete()
        .in('id', toolIds);

      if (toolsError) {
        console.error('Error deleting tools:', toolsError);
        // Don't fail the request, environment is already deleted
      }
    }

    return NextResponse.json({ success: true, deletedTools: toolIds.length });
  } catch (error) {
    console.error('Error deleting environment:', error);
    return NextResponse.json({ error: 'Failed to delete environment' }, { status: 500 });
  }
}

