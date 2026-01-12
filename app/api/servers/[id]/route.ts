import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import {
  getApiKeysByUser,
  getServerToolsWithDetails,
  deleteApiKey,
  updateApiKey,
  bulkUpdateServerTools,
  getToolByName,
  linkToolToServer,
  unlinkToolFromServer,
} from '@/src/lib/supabase-services';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Get a specific server by ID
 * GET /api/servers/[id]
 *
 * Special case: id='default' returns the default server
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all servers for user and find the one with matching ID
    const apiKeys = await getApiKeysByUser(userId);
    // Handle special 'default' case - find by server_name instead of id
    const apiKey = id === 'default'
      ? apiKeys.find(k => k.server_name === 'default')
      : apiKeys.find(k => k.id === id);

    if (!apiKey) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    const serverTools = await getServerToolsWithDetails(apiKey.id);

    return NextResponse.json({
      server: {
        id: apiKey.id,
        name: apiKey.name || apiKey.server_name,
        serverName: apiKey.server_name,
        plan: apiKey.plan,
        isActive: apiKey.is_active,
        createdAt: apiKey.created_at,
        tools: serverTools.map(st => ({
          id: st.id,
          toolId: st.tool_id,
          name: st.tool.name,
          description: st.tool.description,
          category: st.tool.category,
          isEnabled: st.is_enabled,
        })),
      },
    });
  } catch (error) {
    console.error('Error getting server:', error);
    return NextResponse.json({ error: 'Failed to get server' }, { status: 500 });
  }
}

/**
 * Update a server's tools
 * PUT /api/servers/[id]
 *
 * Body: { name?: string, tools?: string[], disabledTools?: string[] }
 * Special case: id='default' updates the default server
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKeys = await getApiKeysByUser(userId);
    // Handle special 'default' case - find by server_name instead of id
    const apiKey = id === 'default'
      ? apiKeys.find(k => k.server_name === 'default')
      : apiKeys.find(k => k.id === id);

    if (!apiKey) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, tools, disabledTools } = body;

    // Update name if provided
    if (name !== undefined) {
      await updateApiKey(apiKey.id, { name });
    }

    // If tools array provided, sync the tools
    if (Array.isArray(tools)) {
      const currentTools = await getServerToolsWithDetails(apiKey.id);
      const currentToolNames = currentTools.map(st => st.tool.name);
      
      // Add new tools
      for (const toolName of tools) {
        if (!currentToolNames.includes(toolName)) {
          const tool = await getToolByName(toolName);
          if (tool) {
            await linkToolToServer({
              api_key_id: apiKey.id,
              tool_id: tool.id,
              is_enabled: true,
            });
          }
        }
      }
      
      // Remove tools not in the new list
      for (const st of currentTools) {
        if (!tools.includes(st.tool.name)) {
          await unlinkToolFromServer(st.id);
        }
      }
    }

    // If disabledTools provided, update enabled status
    if (Array.isArray(disabledTools)) {
      const currentTools = await getServerToolsWithDetails(apiKey.id);
      const currentToolNames = new Set(currentTools.map(st => st.tool.name));
      const disabledSet = new Set(disabledTools);

      // Find tools that should be enabled but aren't linked yet
      // These are tools NOT in disabledTools that aren't currently linked
      // We need to get all available tools to know what should be linked
      const { getAllTools } = await import('@/src/lib/supabase-services');
      const allTools = await getAllTools(userId);

      for (const tool of allTools) {
        // If tool is not disabled and not already linked, link it
        if (!disabledSet.has(tool.name) && !currentToolNames.has(tool.name)) {
          await linkToolToServer({
            api_key_id: apiKey.id,
            tool_id: tool.id,
            is_enabled: true,
          });
        }
      }

      // Now update enabled status for all linked tools
      const updatedCurrentTools = await getServerToolsWithDetails(apiKey.id);
      const enabledToolIds = updatedCurrentTools
        .filter(st => !disabledTools.includes(st.tool.name))
        .map(st => st.tool_id);

      await bulkUpdateServerTools(apiKey.id, enabledToolIds);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating server:', error);
    return NextResponse.json({ error: 'Failed to update server' }, { status: 500 });
  }
}

/**
 * Delete a server
 * DELETE /api/servers/[id]
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKeys = await getApiKeysByUser(userId);
    // Handle special 'default' case - find by server_name instead of id
    const apiKey = id === 'default'
      ? apiKeys.find(k => k.server_name === 'default')
      : apiKeys.find(k => k.id === id);

    if (!apiKey) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    // Don't allow deleting the default server
    if (apiKey.server_name === 'default' || id === 'default') {
      return NextResponse.json(
        { error: 'Cannot delete the default server' },
        { status: 400 }
      );
    }

    // If Clerk provider, revoke the API key in Clerk
    if (apiKey.provider === 'clerk') {
      try {
        const client = await clerkClient();
        const clerkKeys = await client.apiKeys.list({ subject: userId });
        // Find and revoke matching key (by suffix match or name)
        for (const key of clerkKeys.data) {
          if (!key.revoked && key.name === apiKey.name) {
            await client.apiKeys.revoke({ apiKeyId: key.id });
            break;
          }
        }
      } catch (e) {
        console.error('Error revoking Clerk API key:', e);
      }
    }

    // Delete from Supabase (cascades to server_tools)
    await deleteApiKey(apiKey.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting server:', error);
    return NextResponse.json({ error: 'Failed to delete server' }, { status: 500 });
  }
}

