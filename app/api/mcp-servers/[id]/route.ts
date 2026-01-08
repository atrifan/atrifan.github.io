/**
 * /api/mcp-servers/[id]
 * 
 * GET - Get a specific MCP server with its tools
 * PUT - Update an MCP server
 * DELETE - Delete an MCP server and its tools
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import type { MCPServerUpdate } from '@/src/types/supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get MCP server
    const { data: server, error: serverError } = await supabase
      .from('mcp_servers')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (serverError || !server) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
    }

    // Get tools for this server
    const { data: serverTools, error: toolsError } = await supabase
      .from('mcp_server_tools')
      .select(`
        id,
        original_name,
        original_description,
        has_widget,
        is_enabled,
        created_at,
        tool:tools (
          id,
          name,
          description,
          category,
          input_schema,
          output_schema,
          has_widget
        )
      `)
      .eq('mcp_server_id', id);

    if (toolsError) {
      console.error('Error fetching MCP server tools:', toolsError);
    }

    return NextResponse.json({
      server,
      tools: serverTools || [],
    });
  } catch (error) {
    console.error('Error fetching MCP server:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch MCP server' 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify ownership
    const { data: existing } = await supabase
      .from('mcp_servers')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
    }

    // Build update object
    const update: MCPServerUpdate = {};
    if (body.displayName !== undefined) update.display_name = body.displayName;
    if (body.sourceUrl !== undefined) update.source_url = body.sourceUrl;
    if (body.environmentName !== undefined) update.environment_name = body.environmentName;
    if (body.authType !== undefined) update.auth_type = body.authType;
    if (body.authConfig !== undefined) update.auth_config = body.authConfig;
    if (body.defaultHeaders !== undefined) update.default_headers = body.defaultHeaders;
    if (body.category !== undefined) update.category = body.category;

    const { data: updated, error } = await supabase
      .from('mcp_servers')
      .update(update as never)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating MCP server:', error);
      return NextResponse.json({ error: 'Failed to update MCP server' }, { status: 500 });
    }

    return NextResponse.json({ server: updated });
  } catch (error) {
    console.error('Error updating MCP server:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to update MCP server' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const { data: existing } = await supabase
      .from('mcp_servers')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
    }

    // Get tool IDs to delete
    const { data: serverTools } = await supabase
      .from('mcp_server_tools')
      .select('tool_id')
      .eq('mcp_server_id', id);

    const toolIds = (serverTools as Array<{ tool_id: string }> || []).map(t => t.tool_id);

    // Delete MCP server (cascades to mcp_server_tools)
    const { error: deleteError } = await supabase
      .from('mcp_servers')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting MCP server:', deleteError);
      return NextResponse.json({ error: 'Failed to delete MCP server' }, { status: 500 });
    }

    // Delete orphaned tools
    if (toolIds.length > 0) {
      await supabase
        .from('tools')
        .delete()
        .in('id', toolIds);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting MCP server:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to delete MCP server'
    }, { status: 500 });
  }
}

