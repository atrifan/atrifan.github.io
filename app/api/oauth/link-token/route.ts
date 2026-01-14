/**
 * POST /api/oauth/link-token
 *
 * Links an OAuth token from a temporary server ID to a real agent ID.
 * This is used during A2A agent import when OAuth is performed before
 * the agent is created in the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import type { OAuthServerType } from '@/src/types/supabase';

interface LinkTokenRequest {
  tempServerId: string;
  realAgentId: string;
  serverType: OAuthServerType;
}

// Map server type to column name
function getServerColumn(serverType: OAuthServerType): string {
  switch (serverType) {
    case 'rest_api': return 'rest_api_spec_id';
    case 'graphql': return 'graphql_spec_id';
    case 'mcp': return 'mcp_server_id';
    case 'a2a': return 'a2a_agent_id';
    case 'rag': return 'rag_id';
    default: return 'a2a_agent_id';
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: LinkTokenRequest = await request.json();
    const { tempServerId, realAgentId, serverType } = body;

    if (!tempServerId || !realAgentId || !serverType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const column = getServerColumn(serverType);

    // Find the token with the temp server ID
    const { data: existingToken, error: fetchError } = await supabase
      .from('oauth_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq(column, tempServerId)
      .single();

    if (fetchError || !existingToken) {
      console.log('[OAuth Link] No token found with temp ID:', tempServerId);
      // Not an error - token might have been stored with provider hash instead
      return NextResponse.json({ success: true, linked: false });
    }

    // Update the token to use the real agent ID
    const { error: updateError } = await supabase
      .from('oauth_tokens' as 'rest_api_specs')
      .update({ [column]: realAgentId } as never)
      .eq('id', (existingToken as { id: string }).id);

    if (updateError) {
      console.error('[OAuth Link] Failed to update token:', updateError);
      return NextResponse.json({ error: 'Failed to link token' }, { status: 500 });
    }

    console.log(`[OAuth Link] Linked token from ${tempServerId} to ${realAgentId}`);

    return NextResponse.json({ success: true, linked: true });
  } catch (error) {
    console.error('Error linking OAuth token:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

