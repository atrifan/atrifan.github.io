/**
 * POST /api/agents/import
 *
 * Import an A2A agent into the database.
 * Creates a2a_agents record and a tool for the agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import type { A2AAgentInsert, A2AAgentAuthType, ToolInsert, ToolCategory } from '@/src/types/supabase';

interface ImportRequest {
  agentName: string;
  displayName: string;
  agentUrl: string;
  environmentName?: string;
  agentCard?: Record<string, unknown>;
  version?: string;
  protocolVersion?: string;
  description?: string;
  iconUrl?: string;
  tags?: string[];
  category?: string;
  authType?: A2AAgentAuthType;
  authConfig?: Record<string, unknown>;
  defaultHeaders?: Record<string, string>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

// Normalize name for tool naming
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Generate tool name: a2a_env-agentName (consistent with other tool types)
function generateAgentToolName(envName: string, agentName: string): string {
  const normalizedEnv = normalizeName(envName);
  const normalizedAgent = normalizeName(agentName);
  return `a2a_${normalizedEnv}-${normalizedAgent}`;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ImportRequest = await request.json();
    const {
      agentName,
      displayName,
      agentUrl,
      environmentName = 'default',
      agentCard = {},
      version,
      protocolVersion,
      description,
      iconUrl,
      tags = [],
      category = 'Utilities',
      authType = 'none',
      authConfig = {},
      defaultHeaders = {},
      inputSchema,
      outputSchema,
    } = body;

    // Validation
    if (!agentName?.trim()) {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });
    }
    if (!agentUrl?.trim()) {
      return NextResponse.json({ error: 'Agent URL is required' }, { status: 400 });
    }

    const normalizedAgentName = normalizeName(agentName);

    // Check if agent already exists for this user
    const { data: existingAgent } = await supabase
      .from('a2a_agents')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_name', normalizedAgentName)
      .single();

    if (existingAgent) {
      return NextResponse.json({
        error: 'An agent with this name already exists. Please choose a different name or edit the existing agent.'
      }, { status: 400 });
    }

    // Default input/output schemas for A2A
    const defaultInputSchema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The query or message to send to the agent'
        }
      },
      required: ['query']
    };

    const defaultOutputSchema = {
      type: 'object',
      description: 'A2A protocol response object'
    };

    // Create tool for the agent
    const toolName = generateAgentToolName(environmentName, normalizedAgentName);
    const validCategory = (['Health & Fitness', 'Finance', 'Date & Time', 'Fun & Games', 'Utilities', 'Astronomy'].includes(category)
      ? category
      : 'Utilities') as ToolCategory;

    const toolInsert: ToolInsert = {
      name: toolName,
      description: description || `A2A Agent: ${displayName || agentName}`,
      category: validCategory,
      categories: tags.length > 0 ? tags : [category],
      tool_type: 'A2A',
      input_schema: inputSchema || defaultInputSchema,
      output_schema: outputSchema || defaultOutputSchema,
      has_widget: false,
      invoking_message: `Calling agent ${displayName || agentName}...`,
      invoked_message: 'Agent response received',
      user_id: userId,
    };

    const { data: toolData, error: toolError } = await supabase
      .from('tools')
      .upsert(toolInsert as never, { onConflict: 'name' })
      .select()
      .single();

    if (toolError || !toolData) {
      console.error('Error creating tool:', toolError);
      return NextResponse.json({ error: 'Failed to create tool for agent' }, { status: 500 });
    }

    // Create A2A agent record
    const agentInsert: A2AAgentInsert = {
      user_id: userId,
      agent_name: normalizedAgentName,
      display_name: displayName?.trim() || agentName.trim(),
      agent_url: agentUrl.trim(),
      environment_name: environmentName.trim() || 'default',
      agent_card: agentCard,
      version: version || undefined,
      protocol_version: protocolVersion || undefined,
      description: description || undefined,
      icon_url: iconUrl || undefined,
      tags: tags,
      category,
      auth_type: authType,
      auth_config: authConfig,
      default_headers: defaultHeaders,
      input_schema: inputSchema || defaultInputSchema,
      output_schema: outputSchema || defaultOutputSchema,
      has_widget: false,
    };

    const { data: agentData, error: agentError } = await supabase
      .from('a2a_agents')
      .insert(agentInsert as never)
      .select()
      .single();

    if (agentError || !agentData) {
      console.error('Error creating A2A agent:', agentError);
      // Clean up the tool we created
      await supabase.from('tools').delete().eq('id', (toolData as { id: string }).id);
      return NextResponse.json({ error: 'Failed to create A2A agent' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      agentId: (agentData as { id: string }).id,
      agentName: normalizedAgentName,
      toolId: (toolData as { id: string }).id,
      toolName,
    });
  } catch (error) {
    console.error('Error importing A2A agent:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to import A2A agent'
    }, { status: 500 });
  }
}
