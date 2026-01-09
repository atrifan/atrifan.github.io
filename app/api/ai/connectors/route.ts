import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET - List user's chat connectors
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    // Get all connectors for this user
    const { data: connectors, error } = await supabase
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

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
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
      icon 
    } = body;

    // Validate connector type
    if (!['internal_mcp', 'external_mcp', 'internal_agent', 'external_agent'].includes(connectorType)) {
      return NextResponse.json({ error: 'Invalid connector type' }, { status: 400 });
    }

    // For internal_mcp, verify the MCP server exists and belongs to user
    if (connectorType === 'internal_mcp' && mcpServerId) {
      const { data: mcpServer } = await supabase
        .from('mcp_servers')
        .select('id, display_name')
        .eq('id', mcpServerId)
        .eq('user_id', userId)
        .single();

      if (!mcpServer) {
        return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
      }
    }

    const { data, error } = await supabase
      .from('chat_connectors')
      .insert({
        user_id: userId,
        connector_type: connectorType,
        mcp_server_id: connectorType === 'internal_mcp' ? mcpServerId : null,
        external_url: ['external_mcp', 'external_agent'].includes(connectorType) ? externalUrl : null,
        external_auth_type: externalAuthType || 'none',
        external_auth_config: externalAuthConfig || {},
        external_headers: externalHeaders || {},
        display_name: displayName,
        description,
        icon: icon || '🔌',
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

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const connectorId = searchParams.get('id');

    if (!connectorId) {
      return NextResponse.json({ error: 'Connector ID required' }, { status: 400 });
    }

    const { error } = await supabase
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

