import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// GET - List user's chat connectors
// Query param: context=chat|automation (default: chat)
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const context = searchParams.get('context') || 'chat';

    // Get all connectors for this user and context
    // Try with icon_url and context first, fall back if columns don't exist
    let connectors = null;
    let error = null;

    const result = await db
      .from('chat_connectors')
      .select(`
        id,
        connector_type,
        mcp_server_id,
        external_url,
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
          connector_type,
          mcp_server_id,
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

    return NextResponse.json({ connectors: connectors || [] });
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

    // For internal_mcp (api_key servers), verify the api_key exists and belongs to user
    // The api_key_id is stored in externalUrl as "api_key:<id>"
    if (connectorType === 'internal_mcp' && externalUrl?.startsWith('api_key:')) {
      const apiKeyId = externalUrl.replace('api_key:', '');
      const { data: apiKey } = await db
        .from('api_keys')
        .select('id, server_name')
        .eq('id', apiKeyId)
        .eq('user_id', userId)
        .single();

      if (!apiKey) {
        return NextResponse.json({ error: 'Server not found' }, { status: 404 });
      }
    }

    // Note: mcp_server_id only works for external_mcp (references mcp_servers table)
    // For internal_mcp, we store the api_key_id in external_url as a reference
    // Try with icon_url first, fall back to without if column doesn't exist
    const insertData: Record<string, unknown> = {
      user_id: userId,
      connector_type: connectorType,
      mcp_server_id: connectorType === 'external_mcp' ? mcpServerId : null,
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

