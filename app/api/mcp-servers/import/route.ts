/**
 * POST /api/mcp-servers/import
 * 
 * Import tools from an external MCP server into the database.
 * Creates mcp_servers record and tools for each imported tool.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import type { MCPServerInsert, MCPServerToolInsert, ToolInsert, MCPServerAuthType, ToolCategory } from '@/src/types/supabase';

interface ImportedTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  hasWidget: boolean;
  // MCP annotations from source server
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  // Custom overrides
  customName?: string;
  customDescription?: string;
  isEnabled?: boolean;
}

interface ImportRequest {
  serverName: string;
  displayName: string;
  sourceUrl: string;
  environmentName?: string;
  authType?: MCPServerAuthType;
  authConfig?: Record<string, unknown>;
  defaultHeaders?: Record<string, string>;
  category?: string;
  serverInfo?: Record<string, unknown>;
  tools: ImportedTool[];
}

// Normalize name for tool naming
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Generate tool name: env-server-originalName
function generateMCPToolName(envName: string, serverName: string, originalName: string): string {
  const normalizedEnv = normalizeName(envName);
  const normalizedServer = normalizeName(serverName);
  const normalizedTool = normalizeName(originalName);
  return `${normalizedEnv}-${normalizedServer}-${normalizedTool}`;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ImportRequest = await request.json();
    const {
      serverName,
      displayName,
      sourceUrl,
      environmentName = 'default',
      authType = 'none',
      authConfig = {},
      defaultHeaders = {},
      category = 'Utilities',
      serverInfo = {},
      tools,
    } = body;

    // Validation
    if (!serverName?.trim()) {
      return NextResponse.json({ error: 'Server name is required' }, { status: 400 });
    }
    if (!sourceUrl?.trim()) {
      return NextResponse.json({ error: 'Source URL is required' }, { status: 400 });
    }
    if (!tools || tools.length === 0) {
      return NextResponse.json({ error: 'At least one tool is required' }, { status: 400 });
    }

    const normalizedServerName = normalizeName(serverName);

    // Check if server already exists for this user
    const { data: existingServer } = await supabase
      .from('mcp_servers')
      .select('id')
      .eq('user_id', userId)
      .eq('server_name', normalizedServerName)
      .single();

    if (existingServer) {
      return NextResponse.json({ 
        error: 'A server with this name already exists. Please choose a different name or edit the existing server.' 
      }, { status: 400 });
    }

    // Create MCP server record
    const serverInsert: MCPServerInsert = {
      user_id: userId,
      server_name: normalizedServerName,
      display_name: displayName.trim() || serverName.trim(),
      source_url: sourceUrl.trim(),
      environment_name: environmentName.trim() || 'default',
      auth_type: authType,
      auth_config: authConfig,
      default_headers: defaultHeaders,
      category,
      server_info: serverInfo,
    };

    const { data: mcpServer, error: serverError } = await supabase
      .from('mcp_servers')
      .insert(serverInsert as never)
      .select()
      .single();

    if (serverError || !mcpServer) {
      console.error('Error creating MCP server:', serverError);
      return NextResponse.json({ error: 'Failed to create MCP server' }, { status: 500 });
    }

    // Create tools and link them
    let importedCount = 0;
    const errors: string[] = [];

    for (const tool of tools) {
      try {
        const toolName = generateMCPToolName(environmentName, normalizedServerName, tool.customName || tool.name);
        
        // Create tool definition
        // Default to 'Utilities' if category is not a valid ToolCategory
        const validCategory = (['Health & Fitness', 'Finance', 'Date & Time', 'Fun & Games', 'Utilities', 'Astronomy'].includes(category)
          ? category
          : 'Utilities') as ToolCategory;

        const toolInsert: ToolInsert = {
          name: toolName,
          description: tool.customDescription || tool.description || `MCP tool: ${tool.name}`,
          category: validCategory,
          categories: [category],
          tool_type: 'MCP',
          input_schema: tool.inputSchema || { type: 'object' },
          output_schema: tool.outputSchema || { type: 'object' },
          has_widget: tool.hasWidget,
          invoking_message: `Calling ${tool.name}...`,
          invoked_message: 'MCP tool call complete',
          // Preserve annotations from source MCP server
          annotations: tool.annotations,
          user_id: userId,
        };

        const { data: toolData, error: toolError } = await supabase
          .from('tools')
          .upsert(toolInsert as never, { onConflict: 'name' })
          .select()
          .single();

        if (toolError || !toolData) {
          errors.push(`Failed to create tool ${tool.name}: ${toolError?.message}`);
          continue;
        }

        // Link tool to MCP server
        const serverToolInsert: MCPServerToolInsert = {
          mcp_server_id: (mcpServer as { id: string }).id,
          tool_id: (toolData as { id: string }).id,
          original_name: tool.name,
          original_description: tool.description,
          has_widget: tool.hasWidget,
          is_enabled: tool.isEnabled !== false,
        };

        const { error: linkError } = await supabase
          .from('mcp_server_tools')
          .insert(serverToolInsert as never);

        if (linkError) {
          errors.push(`Failed to link tool ${tool.name}: ${linkError.message}`);
          continue;
        }

        importedCount++;
      } catch (err) {
        errors.push(`Error processing tool ${tool.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      serverId: (mcpServer as { id: string }).id,
      serverName: normalizedServerName,
      importedCount,
      totalTools: tools.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error importing MCP server:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to import MCP server'
    }, { status: 500 });
  }
}

