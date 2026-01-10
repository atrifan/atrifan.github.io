import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// GET - List user's chat connectors
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all connectors for this user
    const { data: connectors, error } = await db
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
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

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
      iconUrl
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
    if (connectorType === 'internal_mcp' && mcpServerId) {
      const { data: apiKey } = await db
        .from('api_keys')
        .select('id, server_name')
        .eq('id', mcpServerId)
        .eq('user_id', userId)
        .single();

      if (!apiKey) {
        return NextResponse.json({ error: 'Server not found' }, { status: 404 });
      }
    }

    // Note: mcp_server_id only works for external_mcp (references mcp_servers table)
    // For internal_mcp, we store the api_key_id in external_url as a reference
    const { data, error } = await db
      .from('chat_connectors')
      .insert({
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
        icon_url: iconUrl || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating connector:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Connector already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create connector' }, { status: 500 });
    }

    return NextResponse.json({ connector: data });
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

