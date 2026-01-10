/**
 * /api/agents/[id]
 * 
 * GET - Get agent details
 * PATCH - Update agent
 * DELETE - Delete agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import type { A2AAgentUpdate, A2AAgentAuthType } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET - Get agent details
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const { data: agent, error } = await supabase
      .from('a2a_agents')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}

// PUT - Update agent (alias for PATCH)
export async function PUT(request: NextRequest, context: RouteContext) {
  return PATCH(request, context);
}

// PATCH - Update agent
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();

    // Verify ownership
    const { data: existing } = await supabase
      .from('a2a_agents')
      .select('id, agent_name, environment_name')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Build update object
    const update: A2AAgentUpdate = {};
    if (body.displayName !== undefined) update.display_name = body.displayName;
    if (body.agentUrl !== undefined) update.agent_url = body.agentUrl;
    if (body.environmentName !== undefined) update.environment_name = body.environmentName;
    if (body.description !== undefined) update.description = body.description;
    if (body.iconUrl !== undefined) update.icon_url = body.iconUrl;
    if (body.tags !== undefined) update.tags = body.tags;
    if (body.category !== undefined) update.category = body.category;
    if (body.authType !== undefined) update.auth_type = body.authType as A2AAgentAuthType;
    if (body.authConfig !== undefined) update.auth_config = body.authConfig;
    if (body.defaultHeaders !== undefined) update.default_headers = body.defaultHeaders;
    if (body.inputSchema !== undefined) update.input_schema = body.inputSchema;
    if (body.outputSchema !== undefined) update.output_schema = body.outputSchema;

    const { data: updated, error } = await supabase
      .from('a2a_agents')
      .update(update as never)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating agent:', error);
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
    }

    // Also update the tool if description changed
    if (body.description !== undefined) {
      const existingAgent = existing as { agent_name: string; environment_name: string };
      const envName = existingAgent.environment_name || 'default';
      const normalizedEnv = envName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const normalizedAgent = existingAgent.agent_name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const toolName = `a2a_${normalizedEnv}-${normalizedAgent}`;

      await supabase
        .from('tools')
        .update({ description: body.description } as never)
        .eq('name', toolName);
    }

    return NextResponse.json({ success: true, agent: updated });
  } catch (error) {
    console.error('Error updating agent:', error);
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}

// DELETE - Delete agent
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Get agent to find tool name
    const { data: agent } = await supabase
      .from('a2a_agents')
      .select('agent_name, environment_name')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Delete the agent (tool will be orphaned but that's ok)
    const { error } = await supabase
      .from('a2a_agents')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting agent:', error);
      return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 });
    }

    // Also delete the associated tool
    const agentData = agent as { agent_name: string; environment_name: string };
    const envName = agentData.environment_name || 'default';
    const normalizedEnv = envName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const normalizedAgent = agentData.agent_name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const toolName = `a2a_${normalizedEnv}-${normalizedAgent}`;

    await supabase.from('tools').delete().eq('name', toolName);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 });
  }
}

