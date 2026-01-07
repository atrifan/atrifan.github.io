import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getApiKeysByUser } from '@/src/lib/supabase-services';
import { supabase } from '@/src/lib/supabase';

/**
 * Get MCP connections for the authenticated user
 * GET /api/connections
 *
 * Fetches connections from Supabase mcp_connections table
 */
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all API keys for this user
    const apiKeys = await getApiKeysByUser(userId);

    if (apiKeys.length === 0) {
      return NextResponse.json({
        connections: [],
        totalCount: 0,
      });
    }

    // Get connections for all user's API keys
    const apiKeyIds = apiKeys.map(k => k.id);

    const { data, error } = await supabase
      .from('mcp_connections')
      .select('*')
      .in('api_key_id', apiKeyIds)
      .order('last_used_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching connections:', error);
      return NextResponse.json(
        { error: 'Failed to fetch connections' },
        { status: 500 }
      );
    }

    // Transform to expected format
    const connections = (data || []).map((conn: {
      id: string;
      api_key_id: string;
      server_name: string;
      agent: string;
      auth_method: string;
      ips: string[] | null;
      last_used_at: string;
      request_count: number | null;
      created_at: string;
    }) => ({
      id: conn.id,
      apiKeyId: conn.api_key_id,
      serverName: conn.server_name,
      agent: conn.agent,
      method: conn.auth_method,
      ips: conn.ips || [],
      lastUsed: conn.last_used_at,
      requestCount: conn.request_count || 0,
      createdAt: conn.created_at,
    }));

    return NextResponse.json({
      connections,
      totalCount: connections.length,
    });
  } catch (error) {
    console.error('Error fetching connections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connections' },
      { status: 500 }
    );
  }
}

