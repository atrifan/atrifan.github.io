/**
 * MCP Tool Aggregator
 *
 * Fetches tools from MCP servers and creates AI SDK compatible tools
 * with explicit execute handlers that call the MCP server's tools/call endpoint.
 */

import { jsonSchema, dynamicTool } from 'ai';
import type { MCPServerAuthType, OAuth2AuthConfig } from '../types/supabase';
import { getValidOAuthToken, type ServerReference } from './oauth-token-manager';

// Connector interface matching ChatConnector from ChatPage
export interface MCPConnectorConfig {
  id: string;
  connector_type: 'internal_mcp' | 'external_mcp';
  mcp_server_id?: string;
  server_name?: string; // For internal_mcp
  external_url?: string;
  external_auth_type?: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  external_auth_config?: Record<string, string>;
  external_headers?: Record<string, string>;
  display_name: string;
}

// MCP tool definition from tools/list response
interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

// AI SDK compatible tool type - using dynamicTool return type
type AISDKTool = ReturnType<typeof dynamicTool>;

export interface AggregatedToolsResult {
  tools: Record<string, AISDKTool>;
  errors: Array<{ connectorId: string; error: string; needsOAuth?: boolean; oauthServerId?: string }>;
  cleanup: () => Promise<void>;
}

/**
 * Build headers for MCP connection based on auth type
 */
function buildHeaders(
  authType: MCPServerAuthType | undefined,
  authConfig: Record<string, string> | undefined,
  customHeaders: Record<string, string> | undefined,
  oauthToken?: string
): Record<string, string> {
  const headers: Record<string, string> = { ...customHeaders };

  switch (authType) {
    case 'api_key':
      if (authConfig?.apiKey) {
        headers['x-api-key'] = authConfig.apiKey;
      }
      break;
    case 'bearer':
      if (authConfig?.token) {
        headers['Authorization'] = `Bearer ${authConfig.token}`;
      }
      break;
    case 'basic':
      if (authConfig?.credentials) {
        headers['Authorization'] = `Basic ${authConfig.credentials}`;
      }
      break;
    case 'oauth2':
      if (oauthToken) {
        headers['Authorization'] = `Bearer ${oauthToken}`;
      }
      break;
  }

  return headers;
}

/**
 * Convert MCP inputSchema to AI SDK jsonSchema format
 */
function toAISDKSchema(schema: MCPToolDefinition['inputSchema']) {
  if (!schema) {
    return jsonSchema({ type: 'object', properties: {} });
  }
  return jsonSchema(schema as Parameters<typeof jsonSchema>[0]);
}

/**
 * Fetch tools from MCP server via JSON-RPC
 */
async function fetchMCPTools(
  url: string,
  headers: Record<string, string>
): Promise<MCPToolDefinition[]> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {},
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP server returned ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(result.error.message || 'MCP server error');
  }

  return result.result?.tools || [];
}

/**
 * Call MCP tool via JSON-RPC
 */
async function callMCPTool(
  url: string,
  headers: Record<string, string>,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const requestBody = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  };

  const allHeaders = { 'Content-Type': 'application/json', ...headers };

  console.log('[MCP Aggregator] ===== CALLING TOOL =====');
  console.log('[MCP Aggregator] URL:', url);
  console.log('[MCP Aggregator] Headers:', JSON.stringify(allHeaders, null, 2));
  console.log('[MCP Aggregator] Tool Name:', toolName);
  console.log('[MCP Aggregator] Arguments:', JSON.stringify(args, null, 2));
  console.log('[MCP Aggregator] Request Body:', JSON.stringify(requestBody, null, 2));

  const response = await fetch(url, {
    method: 'POST',
    headers: allHeaders,
    body: JSON.stringify(requestBody),
  });

  console.log('[MCP Aggregator] Response Status:', response.status, response.statusText);

  const result = await response.json();
  console.log('[MCP Aggregator] Response Body:', JSON.stringify(result, null, 2));
  console.log('[MCP Aggregator] ===== END TOOL CALL =====');

  if (result.error) {
    console.error('[MCP Aggregator] Tool error:', result.error);
    throw new Error(result.error.message || 'Tool execution failed');
  }

  // Extract text content from MCP response format
  const content = result.result?.content;
  if (Array.isArray(content) && content.length > 0) {
    // Return text content if available
    const textContent = content.find((c: { type: string }) => c.type === 'text');
    if (textContent?.text) {
      return textContent.text;
    }
  }

  return result.result;
}

/**
 * Aggregate tools from multiple MCP connectors
 *
 * @param connectors - Array of MCP connector configurations
 * @param userApiKey - User's API key for internal MCP servers
 * @param userId - User ID for OAuth token lookup
 * @param baseUrl - Base URL for internal MCP servers (e.g., 'http://localhost:3000')
 */
export async function aggregateMCPTools(
  connectors: MCPConnectorConfig[],
  userApiKey: string,
  userId: string,
  baseUrl: string
): Promise<AggregatedToolsResult> {
  console.log('[MCP Aggregator] Starting aggregation with:', {
    connectorCount: connectors.length,
    connectors: connectors.map(c => ({
      id: c.id,
      type: c.connector_type,
      displayName: c.display_name,
      serverName: c.server_name,
      externalUrl: c.external_url,
    })),
    userApiKey: userApiKey ? `${userApiKey.substring(0, 8)}...` : 'MISSING',
    userId: userId ? `${userId.substring(0, 8)}...` : 'MISSING',
    baseUrl,
  });

  const allTools: Record<string, AISDKTool> = {};
  const errors: AggregatedToolsResult['errors'] = [];

  // Filter to only MCP connectors
  const mcpConnectors = connectors.filter(
    c => c.connector_type === 'internal_mcp' || c.connector_type === 'external_mcp'
  );

  console.log('[MCP Aggregator] Filtered MCP connectors:', mcpConnectors.length);

  for (const connector of mcpConnectors) {
    console.log('[MCP Aggregator] Processing connector:', {
      id: connector.id,
      displayName: connector.display_name,
      type: connector.connector_type,
    });

    try {
      let url: string;
      let headers: Record<string, string> = {};

      if (connector.connector_type === 'internal_mcp') {
        // Internal MCP: Use path-based auth
        const serverName = connector.server_name || 'default';
        url = `${baseUrl}/api/mcp/${userApiKey}/${encodeURIComponent(serverName)}`;
        console.log('[MCP Aggregator] Internal MCP URL:', url);
      } else {
        // External MCP: Use external URL with custom headers/auth
        if (!connector.external_url) {
          console.log('[MCP Aggregator] Missing external URL for connector:', connector.id);
          errors.push({ connectorId: connector.id, error: 'Missing external URL' });
          continue;
        }
        url = connector.external_url;
        console.log('[MCP Aggregator] External MCP URL:', url);

        // Handle OAuth2 for external MCP
        if (connector.external_auth_type === 'oauth2' && connector.mcp_server_id) {
          console.log('[MCP Aggregator] OAuth2 auth required for:', connector.display_name);
          const oauthConfig = connector.external_auth_config as unknown as OAuth2AuthConfig;
          const server: ServerReference = { type: 'mcp', id: connector.mcp_server_id };
          const tokenResult = await getValidOAuthToken(userId, server, oauthConfig);

          if (!tokenResult.success) {
            console.log('[MCP Aggregator] OAuth token failed:', tokenResult.error);
            errors.push({
              connectorId: connector.id,
              error: tokenResult.error || 'OAuth authentication required',
              needsOAuth: true,
              oauthServerId: connector.mcp_server_id,
            });
            continue;
          }
          console.log('[MCP Aggregator] OAuth token obtained successfully');

          headers = buildHeaders('oauth2', undefined, connector.external_headers, tokenResult.accessToken);
        } else {
          headers = buildHeaders(
            connector.external_auth_type as MCPServerAuthType,
            connector.external_auth_config,
            connector.external_headers
          );
        }
      }

      // Fetch tools via JSON-RPC
      console.log('[MCP Aggregator] Fetching tools from:', url);
      const mcpTools = await fetchMCPTools(url, headers);
      console.log('[MCP Aggregator] Got', mcpTools.length, 'tools from', connector.display_name);

      // Create AI SDK tools with explicit execute handlers using dynamicTool
      for (const mcpTool of mcpTools) {
        const prefixedName = `${connector.display_name.replace(/\s+/g, '_')}_${mcpTool.name}`;
        const inputSchema = toAISDKSchema(mcpTool.inputSchema);

        // Capture url and headers in closure for execute handler
        const toolUrl = url;
        const toolHeaders = { ...headers };
        const originalToolName = mcpTool.name;

        allTools[prefixedName] = dynamicTool({
          description: mcpTool.description || `Tool: ${mcpTool.name}`,
          inputSchema,
          execute: async (args) => {
            return callMCPTool(toolUrl, toolHeaders, originalToolName, args as Record<string, unknown>);
          },
        });

        console.log('[MCP Aggregator] Registered tool:', prefixedName);
      }
    } catch (error) {
      console.error('[MCP Aggregator] Error processing connector:', connector.id, error);
      errors.push({
        connectorId: connector.id,
        error: error instanceof Error ? error.message : 'Failed to connect to MCP server',
      });
    }
  }

  // No cleanup needed - we're using direct fetch, not persistent clients
  const cleanup = async () => {};

  const allToolNames = Object.keys(allTools);
  console.log('[MCP Aggregator] Aggregation complete:', {
    totalTools: allToolNames.length,
    toolNames: allToolNames,
    errorCount: errors.length,
    errors: errors,
  });

  return { tools: allTools, errors, cleanup };
}

