/**
 * GET /api/mcp/oauth-source
 *
 * Fetches the OAuth source information for a tool in a user's MCP server composition.
 * Used by the MCP OAuth Login page to get OAuth config for external surface authentication.
 *
 * Query params:
 * - serverName: The user's server name (from api_keys)
 * - toolId: Optional specific tool ID to authenticate
 *
 * Returns:
 * - sourceType: 'mcp' | 'rest_api' | 'graphql' | 'a2a' | 'rag'
 * - sourceId: The ID of the source server
 * - sourceName: Display name of the source
 * - oauthConfig: OAuth2 configuration
 * - toolName: Name of the tool (if toolId provided)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import type { OAuth2AuthConfig, OAuthServerType } from '@/src/types/supabase';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const serverName = searchParams.get('serverName');
    const toolId = searchParams.get('toolId');

    if (!serverName) {
      return NextResponse.json({ error: 'serverName is required' }, { status: 400 });
    }

    // 1. Verify the server belongs to this user
    const { data: apiKey, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('id, server_name, user_id')
      .eq('user_id', userId)
      .eq('server_name', serverName)
      .eq('is_active', true)
      .single();

    if (apiKeyError || !apiKey) {
      return NextResponse.json({ error: 'Server not found or access denied' }, { status: 404 });
    }

    // 2. If toolId is provided, find the source server for that specific tool
    if (toolId) {
      const result = await findToolSource(toolId, userId);
      if (!result) {
        return NextResponse.json({ error: 'Tool not found or has no OAuth config' }, { status: 404 });
      }
      return NextResponse.json(result);
    }

    // 3. If no toolId, find the first tool in the server that requires OAuth
    const result = await findFirstOAuthToolInServer(userId, serverName);
    if (!result) {
      return NextResponse.json({ error: 'No OAuth-enabled tools found in this server' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching OAuth source:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

interface OAuthSourceResult {
  sourceType: OAuthServerType;
  sourceId: string;
  sourceName: string;
  oauthConfig: OAuth2AuthConfig;
  toolName?: string;
}

async function findToolSource(toolId: string, userId: string): Promise<OAuthSourceResult | null> {
  // Check MCP server tools
  const mcpResult = await checkMCPServerTool(toolId, userId);
  if (mcpResult) return mcpResult;

  // Check REST API endpoints
  const restResult = await checkRestApiEndpoint(toolId, userId);
  if (restResult) return restResult;

  // Check GraphQL operations
  const gqlResult = await checkGraphQLOperation(toolId, userId);
  if (gqlResult) return gqlResult;

  // Check A2A agents
  const a2aResult = await checkA2AAgent(toolId, userId);
  if (a2aResult) return a2aResult;

  return null;
}

async function checkMCPServerTool(toolId: string, userId: string): Promise<OAuthSourceResult | null> {
  const { data: serverTool } = await supabase
    .from('mcp_server_tools')
    .select(`
      tool_id,
      original_name,
      mcp_server:mcp_servers (
        id, display_name, auth_type, auth_config, user_id
      )
    `)
    .eq('tool_id', toolId)
    .single();

  if (!serverTool) return null;

  const server = (serverTool as { mcp_server: { id: string; display_name: string; auth_type: string; auth_config: Record<string, unknown>; user_id: string } }).mcp_server;
  if (!server || server.user_id !== userId) return null;
  if (server.auth_type !== 'oauth2') return null;

  const oauthConfig = server.auth_config as unknown as OAuth2AuthConfig;
  if (!oauthConfig?.authorization_endpoint || !oauthConfig?.token_endpoint) return null;

  return {
    sourceType: 'mcp',
    sourceId: server.id,
    sourceName: server.display_name,
    oauthConfig,
    toolName: (serverTool as { original_name: string }).original_name,
  };
}

async function checkRestApiEndpoint(toolId: string, userId: string): Promise<OAuthSourceResult | null> {
  const { data: endpoint } = await supabase
    .from('rest_api_endpoints')
    .select(`
      tool_id,
      operation_id,
      spec:rest_api_specs (
        id, server_name, auth_type, auth_config, user_id
      )
    `)
    .eq('tool_id', toolId)
    .single();

  if (!endpoint) return null;

  const spec = (endpoint as { spec: { id: string; server_name: string; auth_type: string; auth_config: Record<string, unknown>; user_id: string } }).spec;
  if (!spec || spec.user_id !== userId) return null;
  if (spec.auth_type !== 'oauth2') return null;

  const oauthConfig = spec.auth_config as unknown as OAuth2AuthConfig;
  if (!oauthConfig?.authorization_endpoint || !oauthConfig?.token_endpoint) return null;

  return {
    sourceType: 'rest_api',
    sourceId: spec.id,
    sourceName: spec.server_name,
    oauthConfig,
    toolName: (endpoint as { operation_id: string }).operation_id,
  };
}

async function checkGraphQLOperation(toolId: string, userId: string): Promise<OAuthSourceResult | null> {
  const { data: operation } = await supabase
    .from('graphql_operations')
    .select(`
      tool_id,
      operation_name,
      spec:graphql_specs (
        id, server_name, auth_type, auth_config, user_id
      )
    `)
    .eq('tool_id', toolId)
    .single();

  if (!operation) return null;

  const spec = (operation as { spec: { id: string; server_name: string; auth_type: string; auth_config: Record<string, unknown>; user_id: string } }).spec;
  if (!spec || spec.user_id !== userId) return null;
  if (spec.auth_type !== 'oauth2') return null;

  const oauthConfig = spec.auth_config as unknown as OAuth2AuthConfig;
  if (!oauthConfig?.authorization_endpoint || !oauthConfig?.token_endpoint) return null;

  return {
    sourceType: 'graphql',
    sourceId: spec.id,
    sourceName: spec.server_name,
    oauthConfig,
    toolName: (operation as { operation_name: string }).operation_name,
  };
}

async function checkA2AAgent(toolId: string, userId: string): Promise<OAuthSourceResult | null> {
  // First find the tool in the tools table
  const { data: tool } = await supabase
    .from('tools')
    .select('id, name, tool_type')
    .eq('id', toolId)
    .eq('tool_type', 'A2A')
    .single();

  if (!tool) return null;

  // Extract agent name from tool name (format: "agent_name.tool_name" or just the agent name)
  const agentName = tool.name.split('.')[0];

  // Find the A2A agent
  const { data: agent } = await supabase
    .from('a2a_agents')
    .select('id, display_name, auth_type, auth_config, user_id')
    .eq('user_id', userId)
    .ilike('display_name', agentName)
    .single();

  if (!agent) return null;
  if (agent.auth_type !== 'oauth2') return null;

  const oauthConfig = agent.auth_config as unknown as OAuth2AuthConfig;
  if (!oauthConfig?.authorization_endpoint || !oauthConfig?.token_endpoint) return null;

  return {
    sourceType: 'a2a',
    sourceId: agent.id,
    sourceName: agent.display_name,
    oauthConfig,
    toolName: tool.name,
  };
}

async function findFirstOAuthToolInServer(userId: string, serverName: string): Promise<OAuthSourceResult | null> {
  // Get the api_key for this server to get the api_key_id
  const { data: apiKey } = await supabase
    .from('api_keys')
    .select('id')
    .eq('user_id', userId)
    .eq('server_name', serverName)
    .eq('is_active', true)
    .single();

  if (!apiKey) return null;

  // Get all tools linked to this server
  const { data: serverTools } = await supabase
    .from('server_tools')
    .select('tool_id')
    .eq('api_key_id', apiKey.id)
    .eq('is_enabled', true);

  if (!serverTools || serverTools.length === 0) return null;

  // Check each tool for OAuth configuration
  for (const serverTool of serverTools) {
    const toolId = serverTool.tool_id;

    // Check MCP server tools
    const mcpResult = await checkMCPServerTool(toolId, userId);
    if (mcpResult) return mcpResult;

    // Check REST API endpoints
    const restResult = await checkRestApiEndpoint(toolId, userId);
    if (restResult) return restResult;

    // Check GraphQL operations
    const gqlResult = await checkGraphQLOperation(toolId, userId);
    if (gqlResult) return gqlResult;
  }

  return null;
}

