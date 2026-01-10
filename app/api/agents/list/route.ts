/**
 * GET /api/agents/list
 * 
 * List all A2A agents for the current user.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';

export const dynamic = 'force-dynamic';

interface A2AAgent {
  id: string;
  agent_name: string;
  display_name: string;
  agent_url: string;
  environment_name: string;
  agent_card: Record<string, unknown>;
  version: string | null;
  protocol_version: string | null;
  description: string | null;
  icon_url: string | null;
  tags: string[];
  category: string;
  auth_type: string;
  has_widget: boolean;
  created_at: string;
  updated_at: string;
  tool?: {
    id: string;
    name: string;
    description: string;
  };
}

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all agents for this user
    const { data: agents, error } = await supabase
      .from('a2a_agents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching A2A agents:', error);
      return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
    }

    // Get tool info for each agent
    const agentsWithTools: A2AAgent[] = [];
    
    for (const agent of (agents || []) as A2AAgent[]) {
      // Generate the expected tool name (must match import format: a2a_env-agent)
      const envName = agent.environment_name || 'default';
      const normalizedEnv = envName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const normalizedAgent = agent.agent_name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const toolName = `a2a_${normalizedEnv}-${normalizedAgent}`;

      // Find the tool
      const { data: tool } = await supabase
        .from('tools')
        .select('id, name, description')
        .eq('name', toolName)
        .single();
      
      agentsWithTools.push({
        ...agent,
        tool: tool ? (tool as A2AAgent['tool']) : undefined,
      });
    }

    return NextResponse.json({
      agents: agentsWithTools,
      total: agentsWithTools.length,
    });
  } catch (error) {
    console.error('Error in agents list:', error);
    return NextResponse.json(
      { error: `Failed to list agents: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

