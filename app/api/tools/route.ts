import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAllTools } from '@/src/lib/supabase-services';
import { supabase } from '@/src/lib/supabase';
import { TOOL_DEFINITIONS, getAllCategories } from '@/src/config/tools-definitions';

/**
 * Get all MCP tools documentation
 * GET /api/tools
 *
 * Returns a list of all available tools with their schemas and metadata.
 *
 * Fetches from Supabase tools table. Falls back to static definitions if Supabase fails.
 */

export async function GET() {
  try {
    // Get user ID if authenticated (for user-created tools)
    const { userId } = await auth();

    // Fetch tools from Supabase
    const tools = await getAllTools(userId || undefined);

    // Build source URL maps for imported tools
    const sourceUrlMap: Record<string, string> = {};
    const iconUrlMap: Record<string, string> = {};

    if (userId) {
      // Fetch REST API specs for source URLs
      const { data: restSpecs } = await supabase
        .from('rest_api_specs')
        .select('id, source_url')
        .eq('user_id', userId);

      const typedRestSpecs = restSpecs as Array<{ id: string; source_url: string }> | null;
      if (typedRestSpecs && typedRestSpecs.length > 0) {
        // Get endpoints to map tool_id to spec
        const { data: endpoints } = await supabase
          .from('rest_api_endpoints')
          .select('tool_id, spec_id')
          .in('spec_id', typedRestSpecs.map(s => s.id));

        const typedEndpoints = endpoints as Array<{ tool_id: string; spec_id: string }> | null;
        if (typedEndpoints) {
          const specUrlMap = Object.fromEntries(typedRestSpecs.map(s => [s.id, s.source_url]));
          typedEndpoints.forEach(ep => {
            if (specUrlMap[ep.spec_id]) {
              sourceUrlMap[ep.tool_id] = specUrlMap[ep.spec_id];
            }
          });
        }
      }

      // Fetch GraphQL specs for source URLs
      const { data: gqlSpecs } = await supabase
        .from('graphql_specs')
        .select('id, source_url')
        .eq('user_id', userId);

      const typedGqlSpecs = gqlSpecs as Array<{ id: string; source_url: string }> | null;
      if (typedGqlSpecs && typedGqlSpecs.length > 0) {
        const { data: gqlOps } = await supabase
          .from('graphql_operations')
          .select('tool_id, spec_id')
          .in('spec_id', typedGqlSpecs.map(s => s.id));

        const typedGqlOps = gqlOps as Array<{ tool_id: string; spec_id: string }> | null;
        if (typedGqlOps) {
          const specUrlMap = Object.fromEntries(typedGqlSpecs.map(s => [s.id, s.source_url]));
          typedGqlOps.forEach(op => {
            if (specUrlMap[op.spec_id]) {
              sourceUrlMap[op.tool_id] = specUrlMap[op.spec_id];
            }
          });
        }
      }

      // Fetch MCP servers for source URLs
      const { data: mcpServers } = await supabase
        .from('mcp_servers')
        .select('id, source_url')
        .eq('user_id', userId);

      const typedMcpServers = mcpServers as Array<{ id: string; source_url: string }> | null;
      if (typedMcpServers && typedMcpServers.length > 0) {
        const { data: mcpTools } = await supabase
          .from('mcp_server_tools')
          .select('tool_id, mcp_server_id')
          .in('mcp_server_id', typedMcpServers.map(s => s.id));

        const typedMcpTools = mcpTools as Array<{ tool_id: string; mcp_server_id: string }> | null;
        if (typedMcpTools) {
          const serverUrlMap = Object.fromEntries(typedMcpServers.map(s => [s.id, s.source_url]));
          typedMcpTools.forEach(t => {
            if (serverUrlMap[t.mcp_server_id]) {
              sourceUrlMap[t.tool_id] = serverUrlMap[t.mcp_server_id];
            }
          });
        }
      }

      // Fetch A2A agents for source URLs and icon URLs
      // A2A agents don't have tool_id, so we need to match by tool name
      const { data: agents } = await supabase
        .from('a2a_agents')
        .select('id, agent_name, environment_name, agent_url, icon_url')
        .eq('user_id', userId);

      if (agents) {
        // Build a map of tool names to agent info
        const agentToolMap: Record<string, { agentUrl: string; iconUrl: string | null }> = {};
        agents.forEach((agent: { agent_name: string; environment_name: string; agent_url: string; icon_url: string | null }) => {
          // Generate the expected tool name with a2a_ prefix
          const envName = agent.environment_name || 'default';
          const normalizedEnv = envName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          const normalizedAgent = agent.agent_name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          const toolName = `a2a_${normalizedEnv}-${normalizedAgent}`;
          agentToolMap[toolName] = { agentUrl: agent.agent_url, iconUrl: agent.icon_url };
        });

        // Find matching tools by name
        const a2aTools = tools.filter(t => t.tool_type === 'A2A');
        a2aTools.forEach(tool => {
          const agentInfo = agentToolMap[tool.name];
          if (agentInfo) {
            sourceUrlMap[tool.id] = agentInfo.agentUrl;
            if (agentInfo.iconUrl) {
              iconUrlMap[tool.id] = agentInfo.iconUrl;
            }
          }
        });
      }
    }

    // Extract unique categories
    const categories = [...new Set(tools.map(t => t.category))];

    // Transform to match expected format
    const formattedTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      toolType: tool.tool_type,
      hasWidget: tool.has_widget,
      invokingMessage: tool.invoking_message,
      invokedMessage: tool.invoked_message,
      inputSchema: tool.input_schema,
      outputSchema: tool.output_schema,
      sourceUrl: sourceUrlMap[tool.id] || undefined,
      iconUrl: iconUrlMap[tool.id] || undefined,
    }));

    return NextResponse.json({
      tools: formattedTools,
      totalCount: formattedTools.length,
      categories,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 min cache
      },
    });
  } catch (error) {
    console.error('Error fetching tools from Supabase, falling back to static:', error);

    // Fallback to static definitions
    return NextResponse.json({
      tools: TOOL_DEFINITIONS,
      totalCount: TOOL_DEFINITIONS.length,
      categories: getAllCategories(),
    }, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
}

