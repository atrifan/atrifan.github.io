/**
 * GET /api/mcp-servers/list
 *
 * List all MCP servers available to the current user.
 * Includes:
 * - Default server with native tools
 * - User-created API key servers
 * - User-imported external MCP servers
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { getApiKeysByUser, getServerToolsWithDetails } from '@/src/lib/supabase-services';

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allServers: Array<{
      id: string;
      server_name: string;
      display_name: string;
      source_url: string;
      source_type: 'native' | 'api_key' | 'mcp_import';
      auth_type?: string;
      toolCount: number;
      category?: string;
      environment_name?: string;
      created_at?: string;
    }> = [];

    // 1. Get user's API key servers (includes default server with native tools)
    try {
      const apiKeys = await getApiKeysByUser(userId);
      for (const apiKey of apiKeys) {
        const serverTools = await getServerToolsWithDetails(userId, apiKey.server_name);
        const enabledTools = serverTools.filter(st => st.is_enabled);
        allServers.push({
          id: apiKey.id,
          server_name: apiKey.server_name,
          display_name: apiKey.name || apiKey.server_name,
          source_url: '', // Local server
          source_type: 'api_key',
          toolCount: enabledTools.length,
          category: 'Native',
          created_at: apiKey.created_at,
        });
      }
    } catch (err) {
      console.error('Error fetching API key servers:', err);
    }

    // 2. Get user-imported external MCP servers
    const { data: mcpServers, error } = await supabase
      .from('mcp_servers')
      .select(`
        id,
        server_name,
        display_name,
        source_url,
        auth_type,
        category,
        environment_name,
        created_at
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching MCP servers:', error);
    } else if (mcpServers) {
      // Get tool counts for each MCP server
      for (const server of mcpServers as Array<{ id: string; server_name: string; display_name: string; source_url: string; auth_type?: string; category?: string; environment_name?: string; created_at: string }>) {
        const { count } = await supabase
          .from('mcp_server_tools')
          .select('*', { count: 'exact', head: true })
          .eq('mcp_server_id', server.id);

        allServers.push({
          id: server.id,
          server_name: server.server_name,
          display_name: server.display_name,
          source_url: server.source_url,
          source_type: 'mcp_import',
          auth_type: server.auth_type,
          toolCount: count || 0,
          category: server.category,
          environment_name: server.environment_name,
          created_at: server.created_at,
        });
      }
    }

    return NextResponse.json({
      servers: allServers,
      count: allServers.length,
    });
  } catch (error) {
    console.error('Error listing MCP servers:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to list MCP servers'
    }, { status: 500 });
  }
}

