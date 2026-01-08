/**
 * MCP Client Library
 * 
 * HTTP-based MCP client for proxying requests to external MCP servers.
 * Supports initialize, tools/list, tools/call, resources/list, resources/read.
 */

import type { MCPServerAuthType } from '../types/supabase';

// MCP Protocol Types
export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

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
 * MCP Client for HTTP-based MCP servers
 */
export class MCPClient {
  private config: MCPClientConfig;
  private requestId = 0;

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
      'Content-Type': 'application/json',
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
   * Send an MCP request to the server
   */
  async sendRequest(method: string, params?: Record<string, unknown>): Promise<MCPResponse> {
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const data = await response.json();
      return data as MCPResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Initialize connection to the MCP server
   */
  async initialize(): Promise<MCPServerInfo> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'Tulzo MCP Proxy', version: '1.0.0' },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.result as { serverInfo?: MCPServerInfo })?.serverInfo || {};
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<MCPToolDefinition[]> {
    const response = await this.sendRequest('tools/list');

    if (response.error) {
      throw new Error(response.error.message);
    }

    const result = response.result as { tools?: MCPToolDefinition[] };
    return result?.tools || [];
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result;
  }

  /**
   * List available resources from the MCP server
   */
  async listResources(): Promise<MCPResourceDefinition[]> {
    const response = await this.sendRequest('resources/list');

    if (response.error) {
      throw new Error(response.error.message);
    }

    const result = response.result as { resources?: MCPResourceDefinition[] };
    return result?.resources || [];
  }

  /**
   * Read a resource from the MCP server
   */
  async readResource(uri: string): Promise<unknown> {
    const response = await this.sendRequest('resources/read', { uri });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result;
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

