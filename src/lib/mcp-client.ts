/**
 * MCP Client Library
 *
 * Uses the official @modelcontextprotocol/sdk for proper protocol support.
 * Supports both Streamable HTTP transport (2025-03-26) and legacy SSE transport (2024-11-05).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { MCPServerAuthType } from '../types/supabase';

// Re-export types for compatibility
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
}

export interface MCPServerInfo {
  name?: string;
  version?: string;
  description?: string;
  protocolVersion?: string;
  capabilities?: {
    tools?: boolean | Record<string, unknown>;
    resources?: boolean | Record<string, unknown>;
    prompts?: boolean | Record<string, unknown>;
  };
}

export interface MCPClientConfig {
  url: string;
  authType: MCPServerAuthType;
  authConfig?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * MCP Client wrapper using official SDK
 */
export class MCPClient {
  private config: MCPClientConfig;
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | SSEClientTransport | null = null;
  private transportType: 'streamable-http' | 'sse' | null = null;

  constructor(config: MCPClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Build headers for the request including auth
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.config.headers,
    };

    // Add authentication
    switch (this.config.authType) {
      case 'api_key':
        if (this.config.authConfig?.apiKey) {
          headers['x-api-key'] = this.config.authConfig.apiKey as string;
        }
        break;
      case 'bearer':
        if (this.config.authConfig?.token) {
          headers['Authorization'] = `Bearer ${this.config.authConfig.token}`;
        }
        break;
      case 'basic':
        if (this.config.authConfig?.credentials) {
          headers['Authorization'] = `Basic ${this.config.authConfig.credentials}`;
        }
        break;
    }

    return headers;
  }

  /**
   * Initialize connection to the MCP server with backwards compatibility.
   * Tries Streamable HTTP transport first (2025-03-26), then falls back to SSE (2024-11-05).
   */
  async initialize(): Promise<MCPServerInfo> {
    const url = new URL(this.config.url);
    const headers = this.buildHeaders();

    // Try Streamable HTTP transport first (modern protocol)
    try {
      this.transport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers },
      });

      this.client = new Client({
        name: 'Tulzo MCP Proxy',
        version: '1.0.0',
      });

      await this.client.connect(this.transport);
      this.transportType = 'streamable-http';
    } catch (streamableError) {
      // Fall back to legacy SSE transport (older protocol)
      console.log(`Streamable HTTP failed, trying SSE transport: ${streamableError}`);

      try {
        // Close any partial connection
        if (this.transport) {
          await this.transport.close().catch(() => {});
          this.transport = null;
        }
        if (this.client) {
          await this.client.close().catch(() => {});
          this.client = null;
        }

        // Try SSE transport
        this.transport = new SSEClientTransport(url, {
          requestInit: { headers },
        });

        this.client = new Client({
          name: 'Tulzo MCP Proxy',
          version: '1.0.0',
        });

        await this.client.connect(this.transport);
        this.transportType = 'sse';
      } catch (sseError) {
        throw new Error(
          `Failed to connect with both transports. ` +
          `Streamable HTTP: ${streamableError instanceof Error ? streamableError.message : streamableError}. ` +
          `SSE: ${sseError instanceof Error ? sseError.message : sseError}`
        );
      }
    }

    // Get server info from the client
    const serverInfo = this.client.getServerVersion();
    const capabilities = this.client.getServerCapabilities();

    return {
      name: serverInfo?.name,
      version: serverInfo?.version,
      description: serverInfo?.description,
      protocolVersion: this.transportType === 'sse' ? '2024-11-05' : '2025-03-26',
      capabilities: capabilities ? {
        tools: capabilities.tools,
        resources: capabilities.resources,
        prompts: capabilities.prompts,
      } : undefined,
    };
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    if (!this.client) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    const result = await this.client.listTools();
    return (result.tools || []).map(tool => {
      // Cast to access potential outputSchema (not in standard MCP but some servers include it)
      const toolWithOutput = tool as typeof tool & { outputSchema?: Record<string, unknown> };
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        outputSchema: toolWithOutput.outputSchema,
        annotations: tool.annotations as Record<string, unknown>,
        _meta: (tool as typeof tool & { _meta?: Record<string, unknown> })._meta,
      };
    });
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.client) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    const result = await this.client.callTool({ name, arguments: args });
    return result;
  }

  /**
   * List available resources from the MCP server
   */
  async listResources(): Promise<MCPResourceDefinition[]> {
    if (!this.client) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    const result = await this.client.listResources();
    return (result.resources || []).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
    }));
  }

  /**
   * Read a resource from the MCP server
   */
  async readResource(uri: string): Promise<unknown> {
    if (!this.client) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    const result = await this.client.readResource({ uri });
    return result;
  }

  /**
   * Close the connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}

/**
 * Create an MCP client from server configuration
 */
export function createMCPClient(
  url: string,
  authType: MCPServerAuthType = 'none',
  authConfig?: Record<string, unknown>,
  headers?: Record<string, string>
): MCPClient {
  return new MCPClient({
    url,
    authType,
    authConfig,
    headers,
  });
}

/**
 * Detect if a tool has widget support based on its metadata
 */
export function detectWidgetSupport(tool: MCPToolDefinition): boolean {
  // Check for OpenAI widget metadata
  if (tool._meta) {
    if (tool._meta['openai/resultCanProduceWidget'] === true) return true;
    if (tool._meta['openai/widgetAccessible'] === true) return true;
    if (tool._meta['openai/outputTemplate']) return true;
  }

  // Check annotations
  if (tool.annotations) {
    if (tool.annotations['widget'] === true) return true;
    if (tool.annotations['hasWidget'] === true) return true;
  }

  return false;
}

