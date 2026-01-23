import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Helper to get tool count for a connector
async function getToolCountForConnector(connector: Record<string, unknown>): Promise<number> {
  const connectorType = connector.connector_type as string;
  const userId = connector.user_id as string | undefined;
  const serverName = connector.server_name as string | undefined;
  const mcpServerId = connector.mcp_server_id as string | undefined;

  // For internal MCP connectors (compositions), count from server_tools table
  if (connectorType === 'internal_mcp' && userId && serverName) {
    const { count } = await db
      .from('server_tools')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('server_name', serverName)
      .eq('is_enabled', true);
    return count || 0;
  }

  // For external MCP connectors (imports), count from mcp_server_tools table
  if (connectorType === 'external_mcp' && mcpServerId) {
    const { count } = await db
      .from('mcp_server_tools')
      .select('*', { count: 'exact', head: true })
      .eq('mcp_server_id', mcpServerId)
      .eq('is_enabled', true);
    return count || 0;
  }

  // For agents, return 1 (the invoke tool)
  if (connectorType === 'internal_agent' || connectorType === 'external_agent') {
    return 1;
  }

  return 0;
}

// GET - List user's chat connectors
// Query param: context=chat|automation (default: chat)
// Query param: include_tool_count=true (optional, adds tool_count to each connector)
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const context = searchParams.get('context') || 'chat';
    const includeToolCount = searchParams.get('include_tool_count') === 'true';

    // Get all connectors for this user and context
    // Try with icon_url and context first, fall back if columns don't exist
    let connectors = null;
    let error = null;

    const result = await db
      .from('chat_connectors')
      .select(`
        id,
        user_id,
        connector_type,
        mcp_server_id,
        a2a_agent_id,
        server_name,
        external_url,
        external_auth_type,
        external_auth_config,
        external_headers,
        display_name,
        description,
        icon,
        icon_url,
        is_enabled,
        last_connected_at,
        created_at,
        context
      `)
      .eq('user_id', userId)
      .eq('context', context)
      .order('created_at', { ascending: false });

    if (result.error?.code === '42703') {
      // Column doesn't exist, try without icon_url/context (legacy)
      const fallbackResult = await db
        .from('chat_connectors')
        .select(`
          id,
          user_id,
          connector_type,
          mcp_server_id,
          server_name,
          external_url,
          display_name,
          description,
          icon,
          is_enabled,
          last_connected_at,
          created_at
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      connectors = (fallbackResult.data || []).map((c: Record<string, unknown>) => ({ ...c, icon_url: null, context: 'chat' }));
      error = fallbackResult.error;
    } else {
      connectors = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Error fetching connectors:', error);
      return NextResponse.json({ error: 'Failed to fetch connectors' }, { status: 500 });
    }

    // Add tool counts if requested
    let connectorsWithCounts = connectors || [];
    let totalToolCount = 0;

    if (includeToolCount && connectorsWithCounts.length > 0) {
      connectorsWithCounts = await Promise.all(
        connectorsWithCounts.map(async (c: Record<string, unknown>) => {
          const toolCount = await getToolCountForConnector(c);
          totalToolCount += toolCount;
          return { ...c, tool_count: toolCount };
        })
      );
    }

    return NextResponse.json({
      connectors: connectorsWithCounts,
      totalToolCount: includeToolCount ? totalToolCount : undefined,
    });
  } catch (error) {
    console.error('Error in connectors API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add a new connector
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      connectorType,
      mcpServerId,
      a2aAgentId,
      serverName, // For internal_mcp connectors (replaces apiKeyId)
      externalUrl,
      externalAuthType,
      externalAuthConfig,
      externalHeaders,
      displayName,
      description,
      icon,
      iconUrl,
      context = 'chat'  // 'chat' or 'automation'
    } = body;

    // Validate connector type
    if (!['internal_mcp', 'external_mcp', 'internal_agent', 'external_agent'].includes(connectorType)) {
      return NextResponse.json({ error: 'Invalid connector type' }, { status: 400 });
    }

    // For external_mcp (imported MCP servers), verify the MCP server exists and belongs to user
    if (connectorType === 'external_mcp' && mcpServerId) {
      const { data: mcpServer } = await db
        .from('mcp_servers')
        .select('id, display_name')
        .eq('id', mcpServerId)
        .eq('user_id', userId)
        .single();

      if (!mcpServer) {
        return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
      }
    }

    // For external_agent, verify the A2A agent exists and belongs to user
    if (connectorType === 'external_agent' && a2aAgentId) {
      const { data: agent } = await db
        .from('a2a_agents')
        .select('id, display_name')
        .eq('id', a2aAgentId)
        .eq('user_id', userId)
        .single();

      if (!agent) {
        return NextResponse.json({ error: 'A2A agent not found' }, { status: 404 });
      }
    }

    // For internal_mcp, verify the server exists for this user
    const effectiveServerName = serverName || 'default';
    if (connectorType === 'internal_mcp') {
      const { data: apiKey } = await db
        .from('api_keys')
        .select('id, server_name')
        .eq('server_name', effectiveServerName)
        .eq('user_id', userId)
        .single();

      if (!apiKey) {
        return NextResponse.json({ error: 'Server not found' }, { status: 404 });
      }
    }

    // Build insert data with proper references
    const insertData: Record<string, unknown> = {
      user_id: userId,
      connector_type: connectorType,
      mcp_server_id: connectorType === 'external_mcp' ? mcpServerId : null,
      a2a_agent_id: connectorType === 'external_agent' ? a2aAgentId : null,
      server_name: connectorType === 'internal_mcp' ? effectiveServerName : null,
      external_url: externalUrl || null,
      external_auth_type: externalAuthType || 'none',
      external_auth_config: externalAuthConfig || {},
      external_headers: externalHeaders || {},
      display_name: displayName,
      description,
      icon: icon || '🔌',
      context,  // 'chat' or 'automation'
    };

    // Only add icon_url if provided (column may not exist yet)
    if (iconUrl) {
      insertData.icon_url = iconUrl;
    }

    let result = await db
      .from('chat_connectors')
      .insert(insertData)
      .select()
      .single();

    // If icon_url column doesn't exist, retry without it
    if (result.error?.code === '42703' && iconUrl) {
      delete insertData.icon_url;
      result = await db
        .from('chat_connectors')
        .insert(insertData)
        .select()
        .single();
    }

    if (result.error) {
      console.error('Error creating connector:', result.error);
      if (result.error.code === '23505') {
        return NextResponse.json({ error: 'Connector already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create connector' }, { status: 500 });
    }

    return NextResponse.json({ connector: result.data });
  } catch (error) {
    console.error('Error in connectors POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove a connector
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const connectorId = searchParams.get('id');

    if (!connectorId) {
      return NextResponse.json({ error: 'Connector ID required' }, { status: 400 });
    }

    const { error } = await db
      .from('chat_connectors')
      .delete()
      .eq('id', connectorId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting connector:', error);
      return NextResponse.json({ error: 'Failed to delete connector' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in connectors DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

