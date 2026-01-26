/**
 * MCP Tool Aggregator
 * 
 * Uses @ai-sdk/mcp to connect to multiple MCP servers and aggregate their tools
 * for use with the AI SDK's generateText agentic loop.
 */

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
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

export interface AggregatedToolsResult {
  tools: Record<string, unknown>;
  clients: MCPClient[];
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
  const clients: MCPClient[] = [];
  const allTools: Record<string, unknown> = {};
  const errors: AggregatedToolsResult['errors'] = [];

  // Filter to only MCP connectors
  const mcpConnectors = connectors.filter(
    c => c.connector_type === 'internal_mcp' || c.connector_type === 'external_mcp'
  );

  for (const connector of mcpConnectors) {
    try {
      let url: string;
      let headers: Record<string, string> = {};

      if (connector.connector_type === 'internal_mcp') {
        // Internal MCP: Use path-based auth
        const serverName = connector.server_name || 'default';
        url = `${baseUrl}/api/mcp/${userApiKey}/${encodeURIComponent(serverName)}`;
      } else {
        // External MCP: Use external URL with custom headers/auth
        if (!connector.external_url) {
          errors.push({ connectorId: connector.id, error: 'Missing external URL' });
          continue;
        }
        url = connector.external_url;

        // Handle OAuth2 for external MCP
        if (connector.external_auth_type === 'oauth2' && connector.mcp_server_id) {
          const oauthConfig = connector.external_auth_config as unknown as OAuth2AuthConfig;
          const server: ServerReference = { type: 'mcp', id: connector.mcp_server_id };
          const tokenResult = await getValidOAuthToken(userId, server, oauthConfig);

          if (!tokenResult.success) {
            errors.push({
              connectorId: connector.id,
              error: tokenResult.error || 'OAuth authentication required',
              needsOAuth: true,
              oauthServerId: connector.mcp_server_id,
            });
            continue;
          }

          headers = buildHeaders('oauth2', undefined, connector.external_headers, tokenResult.accessToken);
        } else {
          headers = buildHeaders(
            connector.external_auth_type as MCPServerAuthType,
            connector.external_auth_config,
            connector.external_headers
          );
        }
      }

      // Create MCP client using @ai-sdk/mcp
      const client = await createMCPClient({
        transport: {
          type: 'http',
          url,
          headers,
        },
      });

      clients.push(client);

      // Get tools from this client
      const tools = await client.tools();
      
      // Merge tools into aggregated object (prefix with connector name to avoid conflicts)
      for (const [toolName, toolDef] of Object.entries(tools)) {
        const prefixedName = `${connector.display_name.replace(/\s+/g, '_')}_${toolName}`;
        allTools[prefixedName] = toolDef;
      }
    } catch (error) {
      errors.push({
        connectorId: connector.id,
        error: error instanceof Error ? error.message : 'Failed to connect to MCP server',
      });
    }
  }

  // Cleanup function to close all clients
  const cleanup = async () => {
    await Promise.all(clients.map(client => client.close().catch(() => {})));
  };

  return { tools: allTools, clients, errors, cleanup };
}

