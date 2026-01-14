/**
 * POST /api/agents/[id]/update-oauth-client
 *
 * Updates an A2A agent's auth_config with the DCR-obtained client_id.
 * This is called after successful OAuth authentication with DCR to ensure
 * future token lookups can find the token via provider hash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

interface UpdateRequest {
  clientId: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: agentId } = await params;
    const body: UpdateRequest = await request.json();
    const { clientId } = body;

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    // Get the current agent to verify ownership and get current auth_config
    const { data: agent, error: fetchError } = await supabase
      .from('a2a_agents')
      .select('id, user_id, auth_config')
      .eq('id', agentId)
      .single();

    if (fetchError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Verify ownership
    if ((agent as { user_id: string }).user_id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Update auth_config with the DCR client_id
    const currentConfig = (agent as { auth_config: Record<string, unknown> }).auth_config || {};
    const updatedConfig = {
      ...currentConfig,
      client_id: clientId,
    };

    const { error: updateError } = await supabase
      .from('a2a_agents' as never)
      .update({ auth_config: updatedConfig } as never)
      .eq('id', agentId);

    if (updateError) {
      console.error('Error updating agent auth_config:', updateError);
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
    }

    console.log(`[OAuth] Updated agent ${agentId} auth_config with client_id: ${clientId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating agent OAuth client:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

