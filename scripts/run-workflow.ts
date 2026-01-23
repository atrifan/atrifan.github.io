/**
 * Workflow Runner CLI
 *
 * Executes YAML workflow files locally for testing.
 *
 * Usage:
 *   npx tsx scripts/run-workflow.ts <workflow.yaml> [options]
 *   npx tsx scripts/run-workflow.ts rules/baby-blood-type-calculator.yaml
 *   npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --inputs '{"query": "test"}'
 *   npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --user-id user_xxx --live
 *
 * Options:
 *   --inputs '{"key": "value"}'   Provide inputs as JSON
 *   --user-id <id>                User ID to load connectors for (required for --live)
 *   --live                        Use real MCP servers instead of mocks
 *   --dry-run                     Parse and validate only, don't execute
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

dotenv.config({ path: '.env.local' });

// Polyfill crypto for Node.js
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as unknown as { crypto: typeof crypto }).crypto = crypto;
}

// Import executor types (these don't have problematic dependencies)
import { executeWorkflow, ToolExecutor, LLMExecutor, ExecutorOptions } from '../src/lib/automation/executor';
import { WorkflowDefinition } from '../src/lib/automation/types';

// Supabase client for loading connectors
const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
const supabaseKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;

type MCPServerAuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';

interface Connector {
  id: string;
  connector_type: string;
  server_name: string;
  display_name: string;
  external_url?: string;
  external_auth_type?: string;
  external_auth_config?: Record<string, unknown>;
  external_headers?: Record<string, string>;
  mcp_server_id?: string;
}

interface MCPServer {
  id: string;
  server_name: string;
  source_url: string;
  auth_type: MCPServerAuthType;
  auth_config?: Record<string, unknown>;
  default_headers?: Record<string, string>;
}

// Simple MCP client wrapper for CLI use
interface SimpleMCPClient {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

// Cache for MCP clients
const mcpClients: Map<string, SimpleMCPClient> = new Map();

// Create a simple MCP client (without OAuth complexity)
async function createSimpleMCPClient(
  url: string,
  authType: MCPServerAuthType,
  authConfig?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<SimpleMCPClient> {
  const requestHeaders: Record<string, string> = { ...headers };

  // Add auth headers
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
    client = new Client({ name: 'Workflow Runner', version: '1.0.0' });
    await client.connect(transport);
  } catch {
    // Fall back to SSE
    transport = new SSEClientTransport(urlObj, {
      requestInit: { headers: requestHeaders },
    });
    client = new Client({ name: 'Workflow Runner', version: '1.0.0' });
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

// Load user's connectors from Supabase
async function loadUserConnectors(userId: string): Promise<Connector[]> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured. Set STORAGE_SUPABASE_URL and STORAGE_SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('chat_connectors')
    .select('id, connector_type, server_name, display_name, external_url, external_auth_type, external_auth_config, external_headers, mcp_server_id')
    .eq('user_id', userId)
    .eq('is_enabled', true);

  if (error) {
    throw new Error(`Failed to load connectors: ${error.message}`);
  }

  return (data || []) as Connector[];
}

// Load MCP server details
async function loadMCPServer(serverId: string): Promise<MCPServer | null> {
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('mcp_servers')
    .select('id, server_name, source_url, auth_type, auth_config, default_headers')
    .eq('id', serverId)
    .single();

  if (error) return null;
  return data as MCPServer;
}

// Create internal MCP client (calls /api/mcp with X-User-Id header)
function createInternalMCPClient(baseUrl: string, userId: string, serverName?: string): SimpleMCPClient {
  return {
    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      const url = `${baseUrl}/api/mcp`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userId,
          'X-Auth-Method': 'internal',
          'X-Server-Name': serverName || 'default',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      });

      if (!response.ok) {
        throw new Error(`Internal MCP call failed: ${response.status} ${response.statusText}`);
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

// Create live tool executor that uses real MCP servers
function createLiveToolExecutor(connectors: Connector[], userId: string, baseUrl: string): ToolExecutor {
  return {
    async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
      console.log(`\n🔧 Tool Call: ${toolName}`);
      console.log('   Params:', JSON.stringify(params, null, 2));

      // Parse tool name: "connector-name.tool_name" or just "tool_name"
      const parts = toolName.split('.');
      let connectorName: string;
      let actualToolName: string;

      if (parts.length >= 2) {
        connectorName = parts[0];
        actualToolName = parts.slice(1).join('.');
      } else {
        // Default connector
        connectorName = 'default';
        actualToolName = toolName;
      }

      // Find the connector
      const connector = connectors.find(c =>
        c.server_name === connectorName ||
        c.display_name.toLowerCase().replace(/\s+/g, '-') === connectorName.toLowerCase()
      );

      if (!connector) {
        throw new Error(`Connector not found: ${connectorName}. Available: ${connectors.map(c => c.server_name || c.display_name).join(', ')}`);
      }

      console.log(`   Connector: ${connector.display_name} (${connector.connector_type})`);

      // Get or create MCP client
      let client = mcpClients.get(connector.id);

      if (!client) {
        if (connector.connector_type === 'internal_mcp') {
          // For internal MCP, use HTTP calls to /api/mcp with X-User-Id header
          console.log(`   Using internal MCP endpoint: ${baseUrl}/api/mcp`);
          client = createInternalMCPClient(baseUrl, userId, connector.server_name);
          mcpClients.set(connector.id, client);
          console.log(`   ✓ Ready (internal)`);
        } else if (connector.connector_type === 'external_mcp' && connector.external_url) {
          // For external MCP, connect directly
          const url = connector.external_url;
          const authType = (connector.external_auth_type as MCPServerAuthType) || 'none';
          const authConfig = connector.external_auth_config;
          const headers = connector.external_headers;

          console.log(`   Connecting to: ${url}`);
          client = await createSimpleMCPClient(url, authType, authConfig, headers);
          mcpClients.set(connector.id, client);
          console.log(`   ✓ Connected (external)`);
        } else if (connector.mcp_server_id) {
          // Load MCP server details from database
          const server = await loadMCPServer(connector.mcp_server_id);
          if (!server) {
            throw new Error(`MCP server not found: ${connector.mcp_server_id}`);
          }
          console.log(`   Connecting to: ${server.source_url}`);
          client = await createSimpleMCPClient(
            server.source_url,
            server.auth_type,
            server.auth_config,
            server.default_headers
          );
          mcpClients.set(connector.id, client);
          console.log(`   ✓ Connected (mcp_server)`);
        } else {
          throw new Error(`Invalid connector configuration: ${connector.display_name}`);
        }
      }

      // Call the tool
      console.log(`   Calling: ${actualToolName}`);
      const result = await client.callTool(actualToolName, params);
      return result;
    },

    async getToolSchema(toolName: string) {
      console.log(`   Getting schema for: ${toolName}`);
      return null;
    },
  };
}

// Mock tool executor for local testing (no real MCP calls)
const mockToolExecutor: ToolExecutor = {
  async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    console.log(`\n🔧 [MOCK] Tool Call: ${toolName}`);
    console.log('   Params:', JSON.stringify(params, null, 2));

    // Simulate some common tools
    if (toolName.includes('blood_calculator')) {
      const { fatherBloodType, fatherRh, motherBloodType, motherRh, calculatorMode } = params;
      console.log(`   Mode: ${calculatorMode}`);
      console.log(`   Father: ${fatherBloodType}${fatherRh}`);
      console.log(`   Mother: ${motherBloodType}${motherRh}`);

      const possibleTypes = ['A', 'O'];
      const rhIncompatibilityRisk = motherRh === '-' && fatherRh === '+';

      return {
        possibleTypes,
        rhIncompatibilityRisk,
        rhWarning: rhIncompatibilityRisk
          ? 'Rh incompatibility possible. Mother is Rh- and father is Rh+. Baby may be Rh+.'
          : 'No Rh incompatibility risk.',
      };
    }

    if (toolName.includes('web_search') || toolName.includes('search')) {
      return {
        results: [
          { title: 'Mock Result 1', url: 'https://example.com/1', snippet: 'This is a mock search result' },
          { title: 'Mock Result 2', url: 'https://example.com/2', snippet: 'Another mock result' },
        ],
      };
    }

    return { success: true, message: `Mock response for ${toolName}` };
  },

  async getToolSchema(toolName: string) {
    console.log(`   Getting schema for: ${toolName}`);
    return null;
  },
};

// Mock LLM executor for local testing
const mockLLMExecutor: LLMExecutor = {
  async callLLM(options): Promise<string> {
    console.log(`\n🤖 LLM Call`);
    console.log('   Model:', options.model || 'default');
    console.log('   Prompt:', options.prompt.substring(0, 100) + '...');
    
    if (options.format === 'json') {
      return JSON.stringify({ summary: 'Mock LLM response', items: [] });
    }
    return 'This is a mock LLM response for testing purposes.';
  },
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Workflow Runner CLI

Usage:
  npx tsx scripts/run-workflow.ts <workflow.yaml> [options]

Options:
  --inputs '{"key": "value"}'   Provide inputs as JSON
  --user-id <id>                User ID to load connectors for (required for --live)
  --live                        Use real MCP servers instead of mocks
  --dry-run                     Parse and validate only, don't execute
  --help, -h                    Show this help

Examples:
  # Mock mode (default) - simulates tool calls
  npx tsx scripts/run-workflow.ts rules/baby-blood-type-calculator.yaml

  # With inputs
  npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --inputs '{"query": "test"}'

  # Live mode - uses real MCP servers with user's connectors
  npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --user-id user_xxx --live

  # Dry run - just validate the YAML
  npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --dry-run
`);
    return;
  }

  const yamlPath = args[0];
  const inputsIndex = args.indexOf('--inputs');
  const userIdIndex = args.indexOf('--user-id');
  const dryRun = args.includes('--dry-run');
  const liveMode = args.includes('--live');

  let inputs: Record<string, unknown> = {};
  if (inputsIndex !== -1 && args[inputsIndex + 1]) {
    try {
      inputs = JSON.parse(args[inputsIndex + 1]);
    } catch {
      console.error('❌ Invalid JSON for --inputs');
      process.exit(1);
    }
  }

  let userId: string | undefined;
  if (userIdIndex !== -1 && args[userIdIndex + 1]) {
    userId = args[userIdIndex + 1];
  }

  // Validate live mode requirements
  if (liveMode && !userId) {
    console.error('❌ --live mode requires --user-id <id>');
    console.error('   Example: --user-id user_2abc123xyz --live');
    process.exit(1);
  }

  // Resolve path
  const fullPath = path.resolve(process.cwd(), yamlPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  console.log(`\n📄 Loading workflow: ${yamlPath}`);

  // Read and parse YAML
  const yamlContent = fs.readFileSync(fullPath, 'utf-8');
  const workflow = yaml.parse(yamlContent) as WorkflowDefinition;

  console.log(`   Name: ${workflow.name}`);
  console.log(`   Description: ${workflow.description || 'N/A'}`);
  console.log(`   Steps: ${workflow.steps?.length || 0}`);
  console.log(`   Trigger: ${workflow.trigger?.type || 'manual'}`);
  console.log(`   Mode: ${liveMode ? '🔴 LIVE (real MCP calls)' : '🟡 MOCK (simulated)'}`);

  if (dryRun) {
    console.log('\n✅ Dry run complete - workflow is valid');
    console.log('\nWorkflow structure:');
    console.log(JSON.stringify(workflow, null, 2));
    return;
  }

  // Load connectors for live mode
  let toolExecutor: ToolExecutor = mockToolExecutor;

  if (liveMode && userId) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    console.log(`\n🔌 Loading connectors for user: ${userId}`);
    console.log(`   Base URL: ${baseUrl}`);
    const connectors = await loadUserConnectors(userId);
    console.log(`   Found ${connectors.length} connectors:`);
    for (const c of connectors) {
      console.log(`   - ${c.display_name} (${c.server_name || c.connector_type})`);
    }
    toolExecutor = createLiveToolExecutor(connectors, userId, baseUrl);
  }
  
  console.log('\n🚀 Executing workflow...\n');
  console.log('─'.repeat(50));

  const options: ExecutorOptions = {
    toolExecutor,
    llmExecutor: mockLLMExecutor,
    collectedInputs: inputs,
    onStepStart: (stepId, stepType) => {
      console.log(`\n▶️  Step: ${stepId} (${stepType})`);
    },
    onStepComplete: (stepId, result) => {
      console.log(`✅ Completed: ${stepId}`);
      console.log('   Result:', JSON.stringify(result, null, 2));
    },
    onStepError: (stepId, error) => {
      console.log(`❌ Error in ${stepId}: ${error.message}`);
    },
  };

  try {
    const result = await executeWorkflow(workflow, inputs, options);

    console.log('\n' + '─'.repeat(50));
    console.log('\n📊 Execution Result:');
    console.log(`   Status: ${result.status}`);
    if (result.output) {
      console.log('   Output:', JSON.stringify(result.output, null, 2));
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  } finally {
    // Clean up MCP clients
    for (const [id, client] of mcpClients) {
      try {
        await client.close();
        console.log(`   Closed connection: ${id}`);
      } catch {
        // Ignore close errors
      }
    }
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

