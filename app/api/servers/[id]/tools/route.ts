import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getApiKeysByUser,
  getServerToolsWithDetails,
  bulkUpdateServerTools,
} from '@/src/lib/supabase-services';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Get tools linked to a specific server
 * GET /api/servers/[id]/tools
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the API key for this server
    const apiKeys = await getApiKeysByUser(userId);
    const apiKey = apiKeys.find(k => k.id === id);

    if (!apiKey) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    // Get all tools linked to this server
    const serverTools = await getServerToolsWithDetails(userId, apiKey.server_name);

    // Transform to expected format
    const tools = serverTools.map(st => ({
      id: st.id,
      toolId: st.tool_id,
      name: st.tool.name,
      description: st.tool.description,
      category: st.tool.category,
      toolType: st.tool.tool_type,
      hasWidget: st.tool.has_widget,
      isEnabled: st.is_enabled,
      environment: st.environment,
      customConfig: st.custom_config,
    }));

    return NextResponse.json({
      serverName: apiKey.server_name,
      apiKeyId: apiKey.id,
      tools,
      enabledCount: tools.filter(t => t.isEnabled).length,
      totalCount: tools.length,
    });
  } catch (error) {
    console.error('Error fetching server tools:', error);
    return NextResponse.json(
      { error: 'Failed to fetch server tools' },
      { status: 500 }
    );
  }
}

/**
 * Update tools for a specific server (enable/disable)
 * PUT /api/servers/[id]/tools
 * 
 * Body: { enabledToolIds: string[] }
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    const { id } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { enabledToolIds } = body as { enabledToolIds: string[] };

    if (!Array.isArray(enabledToolIds)) {
      return NextResponse.json(
        { error: 'enabledToolIds must be an array' },
        { status: 400 }
      );
    }

    // Get the API key for this server
    const apiKeys = await getApiKeysByUser(userId);
    const apiKey = apiKeys.find(k => k.id === id);

    if (!apiKey) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    // Bulk update server tools
    await bulkUpdateServerTools(userId, apiKey.server_name, enabledToolIds);

    return NextResponse.json({
      success: true,
      message: 'Server tools updated',
      enabledCount: enabledToolIds.length,
    });
  } catch (error) {
    console.error('Error updating server tools:', error);
    return NextResponse.json(
      { error: 'Failed to update server tools' },
      { status: 500 }
    );
  }
}

