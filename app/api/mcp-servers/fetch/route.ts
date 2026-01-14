/**
 * POST /api/mcp-servers/fetch
 * 
 * Fetch tools from an external MCP server.
 * Calls initialize and tools/list to get available tools.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createMCPClient, detectWidgetSupport, type MCPServerInfo } from '@/src/lib/mcp-client';
import type { MCPServerAuthType } from '@/src/types/supabase';

interface FetchRequest {
  url: string;
  authType?: MCPServerAuthType;
  authConfig?: Record<string, unknown>;
  headers?: Record<string, string>;
  serverId?: string; // For OAuth token lookup
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: FetchRequest = await request.json();
    const { url, authType = 'none', authConfig, headers, serverId } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // For OAuth, use serverId if provided, otherwise generate a temporary ID
    const effectiveServerId = serverId || (authType === 'oauth2' ? `temp_${Buffer.from(url).toString('base64').slice(0, 32)}` : undefined);

    // Create MCP client with userId and serverId for OAuth support
    const client = createMCPClient(url, authType, authConfig, headers, userId, effectiveServerId);

    // Initialize connection
    let serverInfo: MCPServerInfo;
    try {
      const initResult = await client.initialize();

      // Check if OAuth is needed (shouldn't happen during fetch, but handle it)
      if ('needsOAuth' in initResult && initResult.needsOAuth) {
        return NextResponse.json({
          error: 'OAuth authentication required for this MCP server',
          needsOAuth: true,
        }, { status: 401 });
      }

      serverInfo = initResult as MCPServerInfo;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize MCP server';
      console.error('MCP server initialization failed:', { url, error: message });
      return NextResponse.json({
        error: `Failed to connect to MCP server: ${message}`,
        details: 'Make sure the URL is correct and the server supports HTTP transport (JSON-RPC over HTTP POST).'
      }, { status: 400 });
    }

    // List tools
    let tools;
    try {
      tools = await client.listTools();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list tools';
      return NextResponse.json({ 
        error: `Failed to list tools: ${message}`,
        serverInfo,
      }, { status: 400 });
    }

    // Check for resources support
    let resources = [];
    let hasResources = false;
    try {
      if (serverInfo.capabilities?.resources) {
        resources = await client.listResources();
        hasResources = resources.length > 0;
      }
    } catch {
      // Resources not supported or failed - that's okay
    }

    // Process tools to detect widget support
    const processedTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object' },
      outputSchema: tool.outputSchema,
      hasWidget: detectWidgetSupport(tool),
      annotations: tool.annotations,
      _meta: tool._meta,
    }));

    return NextResponse.json({
      success: true,
      serverInfo: {
        name: serverInfo.name || 'Unknown MCP Server',
        version: serverInfo.version,
        description: serverInfo.description,
        protocolVersion: serverInfo.protocolVersion,
        capabilities: serverInfo.capabilities,
      },
      tools: processedTools,
      toolCount: processedTools.length,
      hasResources,
      resourceCount: resources.length,
    });
  } catch (error) {
    console.error('Error fetching MCP server:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch MCP server' 
    }, { status: 500 });
  }
}

