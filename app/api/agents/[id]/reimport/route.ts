/**
 * POST /api/agents/[id]/reimport
 *
 * Reimport an A2A agent from its source URL.
 * Refreshes agent card data and updates the tool.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import type { ToolCategory } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Well-known paths to try for agent card discovery
const AGENT_CARD_PATHS = [
  '/.well-known/agent.json',
  '/.well-known/agent.yaml',
  '/.well-known/agent-card.json',
  '/.well-known/agent-card.yaml',
];

interface AgentCard {
  name?: string;
  version?: string;
  protocolVersion?: string;
  url?: string;
  description?: string;
  tags?: string[];
  iconUrl?: string;
  [key: string]: unknown;
}

async function tryFetchAgentCard(baseUrl: string): Promise<{ card: AgentCard | null; path: string | null }> {
  for (const path of AGENT_CARD_PATHS) {
    try {
      const url = new URL(path, baseUrl).toString();
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json, text/yaml, */*' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();
        
        let card: AgentCard;
        if (contentType.includes('yaml') || path.endsWith('.yaml')) {
          const yaml = await import('js-yaml');
          card = yaml.load(text) as AgentCard;
        } else {
          card = JSON.parse(text);
        }
        
        return { card, path };
      }
    } catch {
      // Continue to next path
    }
  }
  return { card: null, path: null };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: agentId } = await params;

    // Get the existing agent
    const { data: agentData, error: agentError } = await supabase
      .from('a2a_agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', userId)
      .single();

    if (agentError || !agentData) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const agent = agentData as {
      id: string;
      agent_url: string;
      agent_name: string;
      display_name: string;
      environment_name: string;
      category: string;
      tags: string[];
    };

    // Fetch agent card from source URL
    const baseUrl = new URL(agent.agent_url).origin;
    const { card } = await tryFetchAgentCard(baseUrl);

    if (!card) {
      return NextResponse.json({ 
        error: 'Could not fetch agent card from source URL. The agent may not have a discoverable agent card.' 
      }, { status: 400 });
    }

    // Update agent record with new data from card
    const updateData: Record<string, unknown> = {
      agent_card: card,
      updated_at: new Date().toISOString(),
    };

    if (card.name) updateData.display_name = card.name;
    if (card.version) updateData.version = card.version;
    if (card.protocolVersion) updateData.protocol_version = card.protocolVersion;
    if (card.description) updateData.description = card.description;
    if (card.iconUrl) updateData.icon_url = card.iconUrl;
    if (card.tags && Array.isArray(card.tags)) updateData.tags = card.tags;

    await supabase
      .from('a2a_agents')
      .update(updateData as never)
      .eq('id', agentId);

    // Update the associated tool if it exists
    const validCategory = (['Health & Fitness', 'Finance', 'Date & Time', 'Fun & Games', 'Utilities', 'Astronomy'].includes(agent.category)
      ? agent.category
      : 'Utilities') as ToolCategory;

    const toolName = `a2a_${agent.environment_name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${agent.agent_name}`;
    
    await supabase
      .from('tools')
      .update({
        description: card.description || `A2A Agent: ${card.name || agent.display_name}`,
        category: validCategory,
        categories: card.tags && card.tags.length > 0 ? card.tags : [agent.category],
        updated_at: new Date().toISOString(),
      } as never)
      .eq('name', toolName)
      .eq('user_id', userId);

    return NextResponse.json({
      success: true,
      message: 'Agent refreshed from source URL',
      updatedFields: Object.keys(updateData).filter(k => k !== 'updated_at' && k !== 'agent_card'),
    });
  } catch (error) {
    console.error('Error reimporting agent:', error);
    return NextResponse.json({ error: 'Failed to reimport agent' }, { status: 500 });
  }
}

