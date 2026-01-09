/**
 * POST /api/mcp-servers/[id]/refresh
 * 
 * Refresh tools from an external MCP server.
 * Re-fetches tools from the source URL and updates/adds new tools.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { createMCPClient, detectWidgetSupport } from '@/src/lib/mcp-client';
import type { MCPServerAuthType, ToolInsert, MCPServerToolInsert, ToolCategory } from '@/src/types/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Normalize name for tool naming
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Valid tool categories - matches ToolCategory type
const VALID_CATEGORIES: ToolCategory[] = [
  'Health & Fitness', 'Finance', 'Date & Time', 'Fun & Games', 'Utilities', 'Astronomy'
];

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get the MCP server
    const { data: server, error: serverError } = await supabase
      .from('mcp_servers')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (serverError || !server) {
      return NextResponse.json({ error: 'MCP server not found' }, { status: 404 });
    }

    const mcpServer = server as {
      id: string;
      server_name: string;
      source_url: string;
      auth_type: MCPServerAuthType;
      auth_config: Record<string, unknown>;
      default_headers: Record<string, string>;
      category: string;
    };

    // Create MCP client and fetch tools
    const client = createMCPClient(
      mcpServer.source_url,
      mcpServer.auth_type,
      mcpServer.auth_config,
      mcpServer.default_headers
    );

    // Initialize connection
    let serverInfo;
    try {
      serverInfo = await client.initialize();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize';
      return NextResponse.json({ error: `Failed to connect: ${message}` }, { status: 400 });
    }

    // Get tools
    let tools;
    try {
      tools = await client.listTools();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list tools';
      return NextResponse.json({ error: `Failed to fetch tools: ${message}` }, { status: 400 });
    }

    // Get existing tools for this server
    const { data: existingServerTools } = await supabase
      .from('mcp_server_tools')
      .select('id, original_name, tool_id')
      .eq('mcp_server_id', id);

    const existingToolMap = new Map(
      (existingServerTools as Array<{ id: string; original_name: string; tool_id: string }> || [])
        .map(t => [t.original_name, t])
    );

    let addedCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];
    const category = mcpServer.category || 'Utilities';
    const validCategory = VALID_CATEGORIES.includes(category as ToolCategory) ? category as ToolCategory : 'Utilities';

    for (const tool of tools) {
      const hasWidget = detectWidgetSupport(tool);
      const existing = existingToolMap.get(tool.name);

      if (existing) {
        // Update existing tool
        const { error: updateError } = await supabase
          .from('tools')
          .update({
            description: tool.description || `MCP tool: ${tool.name}`,
            input_schema: tool.inputSchema || { type: 'object' },
            output_schema: tool.outputSchema || { type: 'object' },
            has_widget: hasWidget,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', existing.tool_id);

        if (!updateError) updatedCount++;
        else errors.push(`Failed to update ${tool.name}`);
      } else {
        // Create new tool
        const toolName = `${mcpServer.server_name}-${normalizeName(tool.name)}`;
        const toolInsert: ToolInsert = {
          name: toolName,
          description: tool.description || `MCP tool: ${tool.name}`,
          category: validCategory,
          categories: [category],
          tool_type: 'MCP',
          input_schema: tool.inputSchema || { type: 'object' },
          output_schema: tool.outputSchema || { type: 'object' },
          has_widget: hasWidget,
          invoking_message: `Calling ${tool.name}...`,
          invoked_message: 'MCP tool call complete',
          user_id: userId,
        };

        const { data: toolData, error: toolError } = await supabase
          .from('tools')
          .upsert(toolInsert as never, { onConflict: 'name' })
          .select()
          .single();

        if (toolError || !toolData) {
          errors.push(`Failed to create ${tool.name}`);
          continue;
        }

        // Link tool to server
        const serverToolInsert: MCPServerToolInsert = {
          mcp_server_id: id,
          tool_id: (toolData as { id: string }).id,
          original_name: tool.name,
          original_description: tool.description || undefined,
          has_widget: hasWidget,
          is_enabled: true,
        };

        await supabase.from('mcp_server_tools').insert(serverToolInsert as never);
        addedCount++;
      }
    }

    // Update server info
    await supabase
      .from('mcp_servers')
      .update({
        server_info: { name: serverInfo.name, version: serverInfo.version },
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', id);

    return NextResponse.json({
      success: true,
      addedCount,
      updatedCount,
      totalTools: tools.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('MCP refresh error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

