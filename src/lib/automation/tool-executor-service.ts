/**
 * Tool Executor Service
 *
 * Unified tool execution for automation workflows.
 * Works the same way whether triggered from:
 * - CLI (local testing)
 * - API (manual trigger)
 * - Webhook (external trigger)
 * - Cron (scheduled trigger)
 *
 * Flow:
 * 1. user_id → Load connectors from chat_connectors table
 * 2. Parse tool name: "connector-name.tool_name"
 * 3. Find connector → Get MCP server config
 * 4. For internal_mcp:
 *    - If Clerk provider: Retrieve API key from Clerk and call /api/mcp/{key}
 *    - If custom provider: Call /api/mcp with X-User-Id header (internal auth)
 * 5. For external_mcp: Connect to external URL with stored auth
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { ToolExecutor } from './executor';

// Types
type MCPServerAuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';

interface Connector {
  id: string;
  connector_type: 'internal_mcp' | 'external_mcp';
  server_name: string;
  display_name: string;
  external_url?: string;
  external_auth_type?: MCPServerAuthType;
  external_auth_config?: Record<string, unknown>;
  external_headers?: Record<string, string>;
  mcp_server_id?: string;
  api_key_id?: string;
}

interface MCPServer {
  id: string;
  server_name: string;
  source_url: string;
  auth_type: MCPServerAuthType;
  auth_config?: Record<string, unknown>;
  default_headers?: Record<string, string>;
}

interface MCPClientWrapper {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

// Cache for MCP clients (keyed by connector ID)
const mcpClientCache: Map<string, MCPClientWrapper> = new Map();

/**
 * Create a tool executor for a specific user
 */
export async function createToolExecutorForUser(
  userId: string,
  options?: {
    supabaseUrl?: string;
    supabaseKey?: string;
    baseUrl?: string; // Base URL for internal MCP calls (e.g., http://localhost:3000)
    context?: 'chat' | 'automation';
    onToolCall?: (toolName: string, params: Record<string, unknown>) => void;
    onToolResult?: (toolName: string, result: unknown) => void;
    onToolError?: (toolName: string, error: Error) => void;
  }
): Promise<ToolExecutor> {
  const supabaseUrl = options?.supabaseUrl || process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const supabaseKey = options?.supabaseKey || process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  const baseUrl = options?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const context = options?.context || 'automation';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Load user's connectors
  const connectors = await loadUserConnectors(supabase, userId, context);
  console.log(`[ToolExecutor] Loaded ${connectors.length} connectors for user ${userId}`);

  return {
    async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
      options?.onToolCall?.(toolName, params);

      try {
        // Parse tool name: "connector-name.tool_name" or "tool_name"
        const { connectorName, actualToolName } = parseToolName(toolName);

        // Find the connector
        const connector = findConnector(connectors, connectorName);
        if (!connector) {
          throw new Error(`Connector not found: ${connectorName}. Available: ${connectors.map(c => c.server_name || c.display_name).join(', ')}`);
        }

        // Get or create MCP client
        const client = await getOrCreateMCPClient(connector, supabase, baseUrl, userId);

        // Call the tool
        const result = await client.callTool(actualToolName, params);
        options?.onToolResult?.(toolName, result);
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options?.onToolError?.(toolName, err);
        throw err;
      }
    },

    async getToolSchema(toolName: string) {
      // TODO: Implement schema lookup from connector
      return null;
    },
  };
}

/**
 * Load user's enabled connectors
 */
async function loadUserConnectors(
  supabase: SupabaseClient,
  userId: string,
  context: string
): Promise<Connector[]> {
  const { data, error } = await supabase
    .from('chat_connectors')
    .select(`
      id, connector_type, server_name, display_name,
      external_url, external_auth_type, external_auth_config, external_headers,
      mcp_server_id, api_key_id
    `)
    .eq('user_id', userId)
    .eq('is_enabled', true)
    .in('context', [context, 'chat']); // Include chat connectors for automation

  if (error) {
    throw new Error(`Failed to load connectors: ${error.message}`);
  }

  return (data || []) as Connector[];
}

/**
 * Parse tool name into connector name and actual tool name
 */
function parseToolName(toolName: string): { connectorName: string; actualToolName: string } {
  const parts = toolName.split('.');
  if (parts.length >= 2) {
    return {
      connectorName: parts[0],
      actualToolName: parts.slice(1).join('.'),
    };
  }
  return {
    connectorName: 'default',
    actualToolName: toolName,
  };
}

/**
 * Find connector by name (server_name or display_name)
 */
function findConnector(connectors: Connector[], name: string): Connector | undefined {
  const normalized = name.toLowerCase().replace(/[-_\s]+/g, '');
  return connectors.find(c => {
    const serverMatch = c.server_name?.toLowerCase().replace(/[-_\s]+/g, '') === normalized;
    const displayMatch = c.display_name?.toLowerCase().replace(/[-_\s]+/g, '') === normalized;
    return serverMatch || displayMatch;
  });
}

/**
 * Get or create MCP client for a connector
 */
async function getOrCreateMCPClient(
  connector: Connector,
  supabase: SupabaseClient,
  baseUrl: string,
  userId: string
): Promise<MCPClientWrapper> {
  // Check cache
  const cached = mcpClientCache.get(connector.id);
  if (cached) {
    return cached;
  }

  let client: MCPClientWrapper;

  if (connector.connector_type === 'internal_mcp') {
    // For internal MCP, get user's API key and call /api/mcp/{key}/{server}
    const serverName = connector.server_name || 'default';
    const apiKey = await getUserApiKey(supabase, userId, serverName);
    client = createInternalMCPClient(baseUrl, userId, serverName, apiKey);
  } else if (connector.connector_type === 'external_mcp' && connector.external_url) {
    // For external MCP, connect directly with stored auth
    client = await createExternalMCPClient(
      connector.external_url,
      connector.external_auth_type || 'none',
      connector.external_auth_config,
      connector.external_headers
    );
  } else if (connector.mcp_server_id) {
    // Load MCP server details from database
    const server = await loadMCPServer(supabase, connector.mcp_server_id);
    if (!server) {
      throw new Error(`MCP server not found: ${connector.mcp_server_id}`);
    }
    client = await createExternalMCPClient(
      server.source_url,
      server.auth_type,
      server.auth_config,
      server.default_headers
    );
  } else {
    throw new Error(`Invalid connector configuration: ${connector.display_name}`);
  }

  mcpClientCache.set(connector.id, client);
  return client;
}

/**
 * Load MCP server details from database
 */
async function loadMCPServer(supabase: SupabaseClient, serverId: string): Promise<MCPServer | null> {
  const { data, error } = await supabase
    .from('mcp_servers')
    .select('id, server_name, source_url, auth_type, auth_config, default_headers')
    .eq('id', serverId)
    .single();

  if (error) return null;
  return data as MCPServer;
}

/**
 * Get user's API key for internal MCP calls
 *
 * Simply retrieves the stored plaintext API key from the database.
 */
async function getUserApiKey(
  supabase: SupabaseClient,
  userId: string,
  serverName: string = 'default'
): Promise<string | null> {
  // Get the API key record from Supabase (including plaintext key)
  const { data: apiKeyRecord, error } = await supabase
    .from('api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('server_name', serverName)
    .eq('is_active', true)
    .single();

  if (error || !apiKeyRecord) {
    console.warn(`[ToolExecutor] No API key found for user ${userId}, server ${serverName}`);
    return null;
  }

  return apiKeyRecord.api_key || null;
}

/**
 * Create internal MCP client
 *
 * If we have an API key: Call /api/mcp/{key}/{serverName}
 * If no API key: Call /api/mcp with X-User-Id header (internal auth)
 */
function createInternalMCPClient(
  baseUrl: string,
  userId: string,
  serverName: string,
  apiKey: string | null
): MCPClientWrapper {
  return {
    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      let url: string;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey) {
        // Use API key in URL path (standard MCP endpoint)
        url = `${baseUrl}/api/mcp/${encodeURIComponent(apiKey)}/${encodeURIComponent(serverName)}`;
      } else {
        // Use internal auth with X-User-Id header
        url = `${baseUrl}/api/mcp`;
        headers['X-User-Id'] = userId;
        headers['X-Auth-Method'] = 'internal';
        headers['X-Server-Name'] = serverName;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Internal MCP call failed: ${response.status} ${response.statusText} - ${text}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error.message || 'MCP call failed');
      }

      return result.result;
    },

    async close(): Promise<void> {
      // No persistent connection to close for HTTP client
    },
  };
}

/**
 * Create external MCP client (connects directly to external server)
 */
async function createExternalMCPClient(
  url: string,
  authType: MCPServerAuthType,
  authConfig?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<MCPClientWrapper> {
  const requestHeaders: Record<string, string> = { ...headers };

  // Add auth headers based on auth type
  if (authType === 'api_key' && authConfig?.apiKey) {
    const headerName = (authConfig.headerName as string) || 'X-API-Key';
    requestHeaders[headerName] = authConfig.apiKey as string;
  } else if (authType === 'bearer' && authConfig?.token) {
    requestHeaders['Authorization'] = `Bearer ${authConfig.token}`;
  } else if (authType === 'basic' && authConfig?.username && authConfig?.password) {
    const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
    requestHeaders['Authorization'] = `Basic ${credentials}`;
  }

  const urlObj = new URL(url);
  let client: Client;
  let transport: StreamableHTTPClientTransport | SSEClientTransport;

  // Try Streamable HTTP first, fall back to SSE
  try {
    transport = new StreamableHTTPClientTransport(urlObj, {
      requestInit: { headers: requestHeaders },
    });
    client = new Client({ name: 'Workflow Executor', version: '1.0.0' });
    await client.connect(transport);
  } catch {
    // Fall back to SSE
    transport = new SSEClientTransport(urlObj, {
      requestInit: { headers: requestHeaders },
    });
    client = new Client({ name: 'Workflow Executor', version: '1.0.0' });
    await client.connect(transport);
  }

  return {
    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      const result = await client.callTool({ name, arguments: args });
      return result;
    },

    async close(): Promise<void> {
      await client.close();
      await transport.close();
    },
  };
}

/**
 * Close all cached MCP clients
 */
export async function closeAllMCPClients(): Promise<void> {
  for (const [id, client] of mcpClientCache) {
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
  }
  mcpClientCache.clear();
}

