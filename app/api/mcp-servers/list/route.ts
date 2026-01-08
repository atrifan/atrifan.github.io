/**
 * GET /api/mcp-servers/list
 * 
 * List all MCP servers imported by the current user.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all MCP servers for this user with tool counts
    const { data: servers, error } = await supabase
      .from('mcp_servers')
      .select(`
        id,
        server_name,
        display_name,
        source_url,
        environment_name,
        auth_type,
        category,
        server_info,
        created_at,
        updated_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching MCP servers:', error);
      return NextResponse.json({ error: 'Failed to fetch MCP servers' }, { status: 500 });
    }

    // Get tool counts for each server
    const serversWithCounts = await Promise.all(
      (servers as Array<{ id: string; [key: string]: unknown }> || []).map(async (server) => {
        const { count } = await supabase
          .from('mcp_server_tools')
          .select('*', { count: 'exact', head: true })
          .eq('mcp_server_id', server.id);

        return {
          ...server,
          toolCount: count || 0,
        };
      })
    );

    return NextResponse.json({
      servers: serversWithCounts,
      count: serversWithCounts.length,
    });
  } catch (error) {
    console.error('Error listing MCP servers:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to list MCP servers' 
    }, { status: 500 });
  }
}

