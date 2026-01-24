/**
 * Workflow Runner CLI
 *
 * Executes YAML workflow files locally for testing.
 *
 * Usage:
 *   npx tsx scripts/run-workflow.ts <workflow.yaml> [options]
 *   npx tsx scripts/run-workflow.ts rules/baby-blood-type-calculator.yaml
 *   npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --inputs '{"query": "test"}'
 *   npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --live
 *
 * Options:
 *   --inputs '{"key": "value"}'   Provide inputs as JSON
 *   --user-id <id>                User ID (or set TEST_USER_ID in .env.local)
 *   --live                        Use real MCP servers instead of mocks
 *   --dry-run                     Parse and validate only, don't execute
 *
 * Environment:
 *   TEST_USER_ID                  Default user ID for --live mode
 *   NEXT_PUBLIC_APP_URL           Base URL for internal MCP calls (default: http://localhost:3000)
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

// Load user's API key from Supabase
async function loadUserApiKey(userId: string, serverName: string = 'default'): Promise<string | null> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured. Set STORAGE_SUPABASE_URL and STORAGE_SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .eq('server_name', serverName)
    .eq('is_active', true)
    .single();

  if (error) {
    console.warn(`No API key found for user ${userId}, server ${serverName}`);
    return null;
  }

  return data?.api_key || null;
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

// MCP response structure:
// {
//   result: {
//     content: [{ type: "text", text: "Plain text answer" }, ...],
//     structuredContent: { query, result, display: { type: "html", content: "..." } }
//   }
// }
interface MCPExtractedResult {
  text: string | null;      // content[0].text - plain text answer for display
  data: unknown;            // structuredContent.result - structured data for workflow
}

// Extract text and structured result from MCP response
function extractMCPResult(mcpResponse: unknown): MCPExtractedResult {
  const extracted: MCPExtractedResult = { text: null, data: null };

  if (!mcpResponse || typeof mcpResponse !== 'object') {
    extracted.data = mcpResponse;
    return extracted;
  }

  const response = mcpResponse as Record<string, unknown>;

  // Navigate to result (may be wrapped in JSON-RPC)
  let resultObj = response;
  if (response.result && typeof response.result === 'object') {
    resultObj = response.result as Record<string, unknown>;
  }

  // Extract text from content[0].text
  if (Array.isArray(resultObj.content) && resultObj.content.length > 0) {
    const firstContent = resultObj.content[0] as Record<string, unknown>;
    if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
      extracted.text = firstContent.text;
    }
  }

  // Extract structured data from structuredContent.result
  if (resultObj.structuredContent && typeof resultObj.structuredContent === 'object') {
    const structured = resultObj.structuredContent as Record<string, unknown>;
    if ('result' in structured) {
      extracted.data = structured.result;
    }
  }

  // Fallback: if no structuredContent, try to parse text as JSON
  if (extracted.data === null && extracted.text) {
    try {
      extracted.data = JSON.parse(extracted.text);
    } catch {
      extracted.data = extracted.text;
    }
  }

  return extracted;
}

// Create internal MCP client
// If apiKey is provided, uses path-based auth: /api/mcp/{apiKey}/{serverName}
// Otherwise falls back to header-based auth with X-User-Id
function createInternalMCPClient(baseUrl: string, userId: string, serverName?: string, apiKey?: string | null): SimpleMCPClient {
  return {
    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      let url: string;
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (apiKey) {
        // Use path-based auth with API key (proper auth flow)
        url = `${baseUrl}/api/mcp/${encodeURIComponent(apiKey)}/${encodeURIComponent(serverName || 'default')}`;
      } else {
        // Fallback to header-based internal auth
        url = `${baseUrl}/api/mcp`;
        headers = {
          ...headers,
          'X-User-Id': userId,
          'X-Auth-Method': 'internal',
          'X-Server-Name': serverName || 'default',
        };
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
        throw new Error(`Internal MCP call failed: ${response.status} ${response.statusText}`);
      }

      const jsonRpcResponse = await response.json();
      if (jsonRpcResponse.error) {
        throw new Error(jsonRpcResponse.error.message || 'MCP call failed');
      }

      // Return raw response - extraction happens in the tool executor
      return jsonRpcResponse;
    },

    async close(): Promise<void> {
      // No persistent connection to close for HTTP client
    },
  };
}

// Cache for API keys per server
const apiKeyCache: Map<string, string | null> = new Map();

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
          // For internal MCP, get API key and use path-based auth
          const serverName = connector.server_name || 'default';

          // Check cache first
          let apiKey = apiKeyCache.get(serverName);
          if (apiKey === undefined) {
            apiKey = await loadUserApiKey(userId, serverName);
            apiKeyCache.set(serverName, apiKey);
            if (apiKey) {
              console.log(`   ✓ Loaded API key for server: ${serverName}`);
            } else {
              console.log(`   ⚠ No API key found, using header auth`);
            }
          }

          const endpoint = apiKey
            ? `${baseUrl}/api/mcp/{key}/${serverName}`
            : `${baseUrl}/api/mcp`;
          console.log(`   Using internal MCP endpoint: ${endpoint}`);
          client = createInternalMCPClient(baseUrl, userId, serverName, apiKey);
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
      const rawResult = await client.callTool(actualToolName, params);

      // Extract text (for display) and data (for workflow)
      const { text, data } = extractMCPResult(rawResult);

      // Display the text answer
      if (text) {
        console.log(`\n   📝 Answer:\n   ${text.split('\n').join('\n   ')}`);
      }

      // Log the structured data (for debugging)
      console.log(`\n   📊 Data:`, JSON.stringify(data, null, 2));

      // Return structured data for workflow variable binding
      return data;
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
  --user-id <id>                User ID (or set TEST_USER_ID in .env.local)
  --live                        Use real MCP servers instead of mocks
  --db                          Create execution record in database (requires --user-id)
  --automation-id <id>          Automation UUID to link execution to (for --db mode)
  --dry-run                     Parse and validate only, don't execute
  --help, -h                    Show this help

Environment:
  TEST_USER_ID                  Default user ID for --live mode
  NEXT_PUBLIC_APP_URL           Base URL for internal MCP (default: http://localhost:3000)

Examples:
  # Mock mode (default) - simulates tool calls
  npx tsx scripts/run-workflow.ts rules/baby-blood-type-calculator.yaml

  # With inputs
  npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --inputs '{"query": "test"}'

  # Live mode - uses real MCP servers (requires TEST_USER_ID in .env.local)
  npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --live

  # With database logging (creates execution record you can see in UI)
  npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --live --db

  # Dry run - just validate the YAML
  npx tsx scripts/run-workflow.ts rules/my-workflow.yaml --dry-run
`);
    return;
  }

  const yamlPath = args[0];
  const inputsIndex = args.indexOf('--inputs');
  const userIdIndex = args.indexOf('--user-id');
  const automationIdIndex = args.indexOf('--automation-id');
  const dryRun = args.includes('--dry-run');
  const liveMode = args.includes('--live');
  const dbMode = args.includes('--db');

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
  } else if (process.env.TEST_USER_ID) {
    userId = process.env.TEST_USER_ID;
  }

  let automationId: string | undefined;
  if (automationIdIndex !== -1 && args[automationIdIndex + 1]) {
    automationId = args[automationIdIndex + 1];
  }

  // Validate live mode requirements
  if (liveMode && !userId) {
    console.error('❌ --live mode requires --user-id <id> or TEST_USER_ID in .env.local');
    console.error('   Example: --user-id user_2abc123xyz --live');
    console.error('   Or set TEST_USER_ID=user_xxx in .env.local');
    process.exit(1);
  }

  // Validate db mode requirements
  if (dbMode && !userId) {
    console.error('❌ --db mode requires --user-id <id> or TEST_USER_ID in .env.local');
    process.exit(1);
  }

  if (dbMode && (!supabaseUrl || !supabaseKey)) {
    console.error('❌ --db mode requires STORAGE_SUPABASE_URL and STORAGE_SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  // Fetch user email from Clerk if userId is available
  let userEmail: string | undefined;
  if (userId) {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (clerkSecretKey) {
      try {
        const response = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
          headers: { Authorization: `Bearer ${clerkSecretKey}` }
        });
        if (response.ok) {
          const userData = await response.json();
          userEmail = userData.email_addresses?.find((e: { id: string }) => e.id === userData.primary_email_address_id)?.email_address
            || userData.email_addresses?.[0]?.email_address;
          if (userEmail) {
            console.log(`   User email: ${userEmail}`);
          }
        }
      } catch (e) {
        console.warn('   ⚠️ Could not fetch user email from Clerk');
      }
    }
  }

  // Inject user data into inputs so workflows can access {{user.id}} and {{user.email}}
  if (userId || userEmail) {
    inputs.user = {
      id: userId,
      email: userEmail,
    };
    console.log(`   User injected into inputs: { id: ${userId}, email: ${userEmail} }`);
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

  // Create Supabase client for DB mode
  const supabase = dbMode && supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

  // Create execution record in DB if --db flag is set
  let executionId: string | undefined;
  let dbAutomationId: string | undefined = automationId;

  if (dbMode && supabase && userId) {
    console.log('\n💾 Creating execution record in database...');

    // If no automation ID provided, try to find or create one based on workflow id
    if (!dbAutomationId && workflow.id) {
      const { data: existingAuto } = await supabase
        .from('automations')
        .select('id')
        .eq('user_id', userId)
        .eq('name', workflow.id)
        .single();

      if (existingAuto) {
        dbAutomationId = existingAuto.id;
        console.log(`   Found existing automation: ${dbAutomationId}`);
      } else {
        // Create a new automation record
        const { data: newAuto, error: autoError } = await supabase
          .from('automations')
          .insert({
            user_id: userId,
            name: workflow.id,
            display_name: workflow.name,
            description: workflow.description || '',
            category: 'general',
            yaml_definition: yamlContent,
            schedule_type: workflow.trigger?.type || 'manual',
            status: 'active',
          })
          .select('id')
          .single();

        if (autoError) {
          console.error('   ❌ Failed to create automation:', autoError.message);
        } else if (newAuto) {
          dbAutomationId = newAuto.id;
          console.log(`   Created new automation: ${dbAutomationId}`);
        }
      }
    }

    if (dbAutomationId) {
      // Create execution record
      const { data: execution, error: execError } = await supabase
        .from('automation_executions')
        .insert({
          automation_id: dbAutomationId,
          user_id: userId,
          status: 'running',
          trigger_type: 'cli',
          current_step: 'starting',
          collected_inputs: inputs,
        })
        .select('id')
        .single();

      if (execError) {
        console.error('   ❌ Failed to create execution:', execError.message);
      } else if (execution) {
        executionId = execution.id;
        console.log(`   Execution ID: ${executionId}`);
      }
    }
  }

  // Helper to log to DB
  const logToDb = async (level: string, stepName: string, message: string, status: string, durationMs?: number) => {
    if (!supabase || !executionId || !dbAutomationId) return;
    try {
      await supabase.from('automation_logs').insert({
        execution_id: executionId,
        automation_id: dbAutomationId,
        level,
        step_name: stepName,
        message,
        status,
        duration_ms: durationMs,
      });
    } catch (err) {
      console.error('   Failed to log to DB:', err);
    }
  };

  // Helper to update execution status
  const updateExecutionStatus = async (status: string, error?: string, currentStep?: string) => {
    if (!supabase || !executionId) return;
    try {
      const update: Record<string, unknown> = { status, current_step: currentStep };
      if (status === 'completed' || status === 'failed') {
        update.completed_at = new Date().toISOString();
      }
      if (error) {
        update.error = error;
      }
      await supabase
        .from('automation_executions')
        .update(update)
        .eq('id', executionId);
    } catch (err) {
      console.error('   Failed to update execution status:', err);
    }
  };

  console.log('\n🚀 Executing workflow...\n');
  console.log('─'.repeat(50));

  const stepStartTimes: Record<string, number> = {};

  const options: ExecutorOptions = {
    toolExecutor,
    llmExecutor: mockLLMExecutor,
    collectedInputs: inputs,
    onStepStart: (stepId, stepType) => {
      console.log(`\n▶️  Step: ${stepId} (${stepType})`);
      stepStartTimes[stepId] = Date.now();
      if (dbMode) {
        updateExecutionStatus('running', undefined, stepId);
        logToDb('info', stepId, `Starting step: ${stepType}`, 'started');
      }
    },
    onStepComplete: (stepId, result) => {
      const duration = stepStartTimes[stepId] ? Date.now() - stepStartTimes[stepId] : undefined;
      console.log(`✅ Completed: ${stepId}`);
      console.log('   Result:', JSON.stringify(result, null, 2));
      if (dbMode) {
        logToDb('info', stepId, JSON.stringify(result).slice(0, 1000), 'completed', duration);
      }
    },
    onStepError: (stepId, error) => {
      const duration = stepStartTimes[stepId] ? Date.now() - stepStartTimes[stepId] : undefined;
      console.log(`❌ Error in ${stepId}: ${error.message}`);
      if (dbMode) {
        logToDb('error', stepId, error.message, 'failed', duration);
      }
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

    // Update final status in DB
    if (dbMode) {
      await updateExecutionStatus(result.status, result.error, 'finished');
      await logToDb('info', 'workflow', `Workflow ${result.status}`, result.status);
      console.log(`\n💾 Execution record updated: ${executionId}`);
    }
  } catch (err) {
    if (dbMode) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await updateExecutionStatus('failed', errorMsg, 'error');
      await logToDb('error', 'workflow', errorMsg, 'failed');
    }
    throw err;
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

