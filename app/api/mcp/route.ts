import { NextRequest, NextResponse } from 'next/server';
import { clerkClient, verifyToken } from '@clerk/nextjs/server';
import { decryptApiKey, isApiKeyExpired, useClerkApiKeys } from '@/src/utils/apiKeyEncryption';
import { isHigherOrEqualTo } from '@/src/config/billing.config';
// Wheel colors needed for widget rendering
import { WHEEL_COLORS } from '@/src/utils/SpinCalculator';
// Zodiac signs needed for widget rendering
import { ZODIAC_SIGNS } from '@/src/data/zodiac';
// Supabase services for API key validation and connection logging
import {
  getApiKeyByHash,
  getApiKeyByUserAndServer,
  hashApiKey,
  logMcpConnection,
  getEnabledServerTools,
  getRestEndpointWithDetails,
  getGraphQLOperationWithDetails,
  getToolByName,
  getMCPServerToolDetails,
  getA2AAgentByToolName,
  getRAGByToolName,
  validateToolForServer,
} from '@/src/lib/supabase-services';
import { sendA2AMessage } from '@/src/lib/a2a-client';
import { executeRestApiCall } from '@/src/lib/rest-api-handler';
import { executeGraphQLCall } from '@/src/lib/graphql-handler';
import { createMCPClient, type MCPCallResult } from '@/src/lib/mcp-client';
import type { EnvironmentRow, MCPServerAuthType } from '@/src/types/supabase';

// Auth types
type AuthMethod = 'oauth' | 'header' | 'path' | 'internal' | 'none';

interface AuthResult {
  authenticated: boolean;
  userId?: string;
  apiKeyId?: string;
  serverName?: string;
  plan?: string;
  isSubscribed?: boolean;
  authMethod: AuthMethod;
  error?: string;
}

// Simple in-memory cache for OAuth token validation
// Cache entries expire after 5 minutes
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const authCache = new Map<string, { result: AuthResult; expiresAt: number }>();

function getCachedAuth(token: string): AuthResult | null {
  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }
  if (cached) {
    authCache.delete(token); // Clean up expired entry
  }
  return null;
}

function setCachedAuth(token: string, result: AuthResult): void {
  // Limit cache size to prevent memory issues
  if (authCache.size > 1000) {
    // Clear oldest entries (first 100)
    const keys = Array.from(authCache.keys()).slice(0, 100);
    keys.forEach(k => authCache.delete(k));
  }
  authCache.set(token, { result, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
}

/**
 * Check if user has Pro or higher subscription
 * Checks user metadata which is updated by billing webhooks
 */
async function checkProSubscription(client: Awaited<ReturnType<typeof clerkClient>>, userId: string): Promise<{ isPro: boolean; plan: string }> {
  try {
    const user = await client.users.getUser(userId);

    // Check publicMetadata first (set by billing webhooks)
    if (user.publicMetadata?.plan) {
      const plan = user.publicMetadata.plan as string;
      return { isPro: isHigherOrEqualTo(plan, 'pro'), plan };
    }

    // Check for active subscription
    if (user.publicMetadata?.subscription === 'active') {
      return { isPro: true, plan: 'pro' };
    }

    return { isPro: false, plan: 'free' };
  } catch (error) {
    console.error('Error checking subscription:', error);
    return { isPro: false, plan: 'free' };
  }
}

/**
 * Validate API key against Supabase first, then Clerk if provider is clerk
 *
 * Flow:
 * 1. Hash the key and look it up in Supabase api_keys table
 * 2. If found and active, get plan from DB
 * 3. If provider is 'clerk', also verify with Clerk API
 * 4. If not in Supabase, try legacy validation (Clerk or custom encryption)
 */
async function validateApiKey(key: string, serverName: string = 'default'): Promise<AuthResult> {
  // First, check Supabase by hash
  try {
    const keyHash = hashApiKey(key);
    const supabaseKey = await getApiKeyByHash(keyHash);

    if (supabaseKey) {
      // Key found in Supabase
      if (!supabaseKey.is_active) {
        return { authenticated: false, authMethod: 'none', error: 'API key has been revoked' };
      }

      // Check plan - free users cannot use MCP
      if (supabaseKey.plan === 'free') {
        return {
          authenticated: true,
          userId: supabaseKey.user_id,
          apiKeyId: supabaseKey.id,
          serverName: supabaseKey.server_name,
          plan: 'free',
          isSubscribed: false,
          authMethod: 'header',
        };
      }

      // If Clerk provider, also verify with Clerk
      if (supabaseKey.provider === 'clerk' && useClerkApiKeys()) {
        try {
          const client = await clerkClient();
          const clerkKey = await client.apiKeys.verify(key);
          if (!clerkKey || clerkKey.revoked || clerkKey.expired) {
            return { authenticated: false, authMethod: 'none', error: 'API key has been revoked or expired' };
          }
        } catch (e) {
          console.error('Clerk verification failed:', e);
          return { authenticated: false, authMethod: 'none', error: 'API key verification failed' };
        }
      }

      // Valid key with pro/plus plan
      return {
        authenticated: true,
        userId: supabaseKey.user_id,
        apiKeyId: supabaseKey.id,
        serverName: supabaseKey.server_name,
        plan: supabaseKey.plan,
        isSubscribed: true,
        authMethod: 'header',
      };
    }
  } catch (error) {
    console.error('Error checking Supabase for API key:', error);
    // Continue to legacy validation
  }

  // Legacy validation for keys not in Supabase
  const client = await clerkClient();

  // Try Clerk API Keys if enabled
  if (useClerkApiKeys()) {
    try {
      const apiKey = await client.apiKeys.verify(key);

      if (!apiKey) {
        return { authenticated: false, authMethod: 'none', error: 'Invalid API key' };
      }

      if (apiKey.revoked) {
        return { authenticated: false, authMethod: 'none', error: 'API key has been revoked' };
      }

      if (apiKey.expired) {
        return { authenticated: false, authMethod: 'none', error: 'API key has expired' };
      }

      const userId = apiKey.subject;

      // Legacy Clerk key - assume Pro (only Pro+ could generate)
      return {
        authenticated: true,
        userId,
        plan: 'pro',
        isSubscribed: true,
        authMethod: 'header',
      };
    } catch (error) {
      console.error('Error validating API key with Clerk:', error);
    }
  }

  // Try custom encryption (legacy)
  const payload = decryptApiKey(key);
  if (!payload) {
    return { authenticated: false, authMethod: 'none', error: 'Invalid API key' };
  }
  if (isApiKeyExpired(payload)) {
    return { authenticated: false, authMethod: 'none', error: 'API key expired' };
  }

  // Legacy custom key - assume Pro
  return {
    authenticated: true,
    userId: payload.userId,
    plan: 'pro',
    isSubscribed: true,
    authMethod: 'header',
  };
}

/**
 * Get Clerk frontend API URL from publishable key
 */
function getClerkFrontendApi(): string {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  if (publishableKey) {
    try {
      const base64Part = publishableKey.replace(/^pk_(test|live)_/, '');
      let decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      // Remove trailing $ that Clerk adds to the encoded domain
      decoded = decoded.replace(/\$+$/, '');
      if (decoded && decoded.includes('.clerk.')) {
        return `https://${decoded}`;
      }
    } catch {
      // Use default
    }
  }
  return 'https://gentle-aardvark-60.clerk.accounts.dev';
}

/**
 * Validate OAuth bearer token
 *
 * For bearer tokens: First try as Clerk session JWT, then as OAuth access token.
 * After validating identity, check Supabase for API key and plan.
 * If no API key in Supabase, user cannot use MCP (even if Pro).
 *
 * Results are cached for 5 minutes to avoid repeated API calls.
 */
async function validateBearerToken(token: string, serverName: string = 'default'): Promise<AuthResult> {
  // Check cache first
  const cached = getCachedAuth(token);
  if (cached) {
    return cached;
  }

  let userId: string | null = null;

  // First, try to verify as a Clerk session JWT
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    if (payload && payload.sub) {
      userId = payload.sub;
    }
  } catch (jwtError) {
    // Not a valid JWT, try as OAuth access token
    console.log('Token is not a JWT, trying as OAuth access token...');
  }

  // If not a JWT, try OAuth access token via userinfo endpoint
  if (!userId) {
    try {
      const clerkApi = getClerkFrontendApi();
      const userinfoResponse = await fetch(`${clerkApi}/oauth/userinfo`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!userinfoResponse.ok) {
        return { authenticated: false, authMethod: 'none', error: 'Invalid OAuth access token' };
      }

      const userinfo = await userinfoResponse.json();

      if (!userinfo.sub) {
        return { authenticated: false, authMethod: 'none', error: 'Invalid userinfo response' };
      }

      userId = userinfo.sub;
    } catch (error) {
      console.error('Error validating OAuth access token:', error);
      return { authenticated: false, authMethod: 'none', error: 'Invalid or expired bearer token' };
    }
  }

  if (!userId) {
    return { authenticated: false, authMethod: 'none', error: 'Could not determine user identity' };
  }

  // Now check Supabase for user's API key
  try {
    const apiKey = await getApiKeyByUserAndServer(userId, serverName);

    if (!apiKey) {
      // No API key in Supabase - user needs to generate one
      return {
        authenticated: true,
        userId,
        plan: 'unknown',
        isSubscribed: false,
        authMethod: 'oauth',
        error: 'No API key found. Please generate an API key from your dashboard.',
      };
    }

    if (!apiKey.is_active) {
      return { authenticated: false, authMethod: 'none', error: 'API key has been revoked' };
    }

    // Check plan - free users cannot use MCP
    const isSubscribed = apiKey.plan !== 'free';

    const result: AuthResult = {
      authenticated: true,
      userId,
      apiKeyId: apiKey.id,
      serverName: apiKey.server_name,
      plan: apiKey.plan,
      isSubscribed,
      authMethod: 'oauth',
    };

    setCachedAuth(token, result);
    return result;
  } catch (error) {
    console.error('Error checking Supabase for API key:', error);

    // Fallback to Clerk metadata check
    const client = await clerkClient();
    const subscription = await checkProSubscription(client, userId);

    const result: AuthResult = {
      authenticated: true,
      userId,
      plan: subscription.plan,
      isSubscribed: subscription.isPro,
      authMethod: 'oauth',
    };
    setCachedAuth(token, result);
    return result;
  }
}

/**
 * Log MCP connection to Supabase mcp_connections table and Google Analytics
 *
 * Data structure uses (api_key_id, server_name, agent, auth_method) as composite key.
 * Each entry stores up to 5 unique IPs and a request count.
 */
async function logConnection(
  apiKeyId: string | undefined,
  serverName: string,
  authMethod: AuthMethod,
  clientIp: string,
  userAgent: string
) {
  // Log to Google Analytics (fire and forget)
  trackMCPEvent('mcp_connection', {
    event_category: 'mcp',
    event_label: 'connection',
    auth_method: authMethod,
    user_agent: userAgent.slice(0, 100), // Truncate for GA
  }, apiKeyId ? `key_${apiKeyId.slice(0, 20)}` : 'unknown');

  // Log to Supabase if we have an API key ID and valid auth method
  if (apiKeyId && authMethod !== 'none') {
    try {
      await logMcpConnection(apiKeyId, serverName, userAgent, authMethod, clientIp);
    } catch (error) {
      console.error('Error logging connection to Supabase:', error);
    }
  }
}

// GA4 Measurement Protocol configuration
const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || 'G-QSNTL3PGRJ';
const GA4_API_SECRET = process.env.GA4_API_SECRET; // Server-side secret for Measurement Protocol

/**
 * Track MCP events to Google Analytics using Measurement Protocol
 * This allows server-side tracking of API calls
 */
async function trackMCPEvent(
  eventName: string,
  params: Record<string, string | number | boolean>,
  clientId?: string
) {
  // Only track if API secret is configured
  if (!GA4_API_SECRET) {
    return;
  }

  try {
    const payload = {
      client_id: clientId || `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      events: [{
        name: eventName,
        params: {
          ...params,
          engagement_time_msec: 100,
          session_id: Date.now().toString(),
        },
      }],
    };

    // Fire and forget - don't await
    fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silently ignore errors
    });
  } catch {
    // Silently ignore errors
  }
}

/**
 * Extract auth from request headers
 */
function extractAuth(request: NextRequest): { apiKey?: string; authMethod: AuthMethod } {
  // Check for internal forwarded headers (from path-based route)
  const internalUserId = request.headers.get('X-User-Id');
  if (internalUserId) {
    return { authMethod: 'internal' };
  }

  // Check x-api-key header
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey) {
    return { apiKey: xApiKey, authMethod: 'header' };
  }

  // Check Authorization: Bearer header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // If it's a tlz_ key, treat as API key
    if (token.startsWith('tlz_')) {
      return { apiKey: token, authMethod: 'header' };
    }
    // Otherwise it might be an OAuth token (future support)
    return { apiKey: token, authMethod: 'oauth' };
  }

  return { authMethod: 'none' };
}

// MCP Protocol Types
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// Standard annotations for read-only tools (all our calculators are read-only)
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

// OpenAI widget metadata for tool definitions
const OPENAI_WIDGET_META = {
  'openai/toolInvocation/invoking': 'Calculating...',
  'openai/toolInvocation/invoked': 'Calculation complete',
  'openai/widgetAccessible': true,
  'openai/resultCanProduceWidget': true,
  'openai/widgetPrefersBorder': true,
};

// Import shared tool definitions with invocation messages
import { TOOL_DEFINITIONS, TOTAL_TOOL_COUNT, getInvocationMessages } from '@/src/config/tools-definitions';

// Helper to generate _meta for a tool
function generateToolMeta(toolName: string) {
  const messages = getInvocationMessages(toolName);
  return {
    'openai/outputTemplate': `ui://widget/${toolName}.html`,
    'openai/mimeType': 'text/html+skybridge',
    'openai/toolInvocation/invoking': messages.invoking,
    'openai/toolInvocation/invoked': messages.invoked,
    'openai/widgetAccessible': true,
    'openai/resultCanProduceWidget': true,
    'openai/widgetPrefersBorder': true,
  };
}

// Transform shared definitions into MCP tools with annotations and _meta
const TOOLS = TOOL_DEFINITIONS.map(tool => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  annotations: READ_ONLY_ANNOTATIONS,
  _meta: generateToolMeta(tool.name),
}));

// Pre-compute resources list for resources/list (avoid recomputing on each request)
const RESOURCES_LIST = TOOLS.map(tool => {
  const title = tool.name.split('_').filter(w => w.length > 0).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  const messages = getInvocationMessages(tool.name);
  return {
    uri: `ui://widget/${tool.name}.html`,
    name: title,
    title: title,
    description: tool.description,
    mimeType: 'text/html',
    _meta: {
      'openai/outputTemplate': `ui://widget/${tool.name}.html`,
      'openai/mimeType': 'text/html+skybridge',
      'openai/toolInvocation/invoking': messages.invoking,
      'openai/toolInvocation/invoked': messages.invoked,
      'openai/widgetAccessible': true,
      'openai/resultCanProduceWidget': true,
      'openai/widgetPrefersBorder': true,
    },
  };
});

// TOTAL_TOOL_COUNT is available from '@/src/config/tools-definitions'
// Do not re-export from route files as Next.js only allows route handlers

// Legacy TOOLS array removed - now using shared TOOL_DEFINITIONS
// The following comment marks where the old array was for reference:
// Old TOOLS array with 42 tools was here (lines 413-1349)

// Continue with tool execution handlers below...
// Note: The executeTool function and other handlers remain unchanged
// They reference tool names which are still the same

// --- End of TOOLS transformation ---

// Import tool definitions for dynamic lookup
import { getToolDefinition, TOOL_TYPES, ToolExecutionContext } from '@/src/config/tools-definitions';
import { executeHandlers, widgetRenderers, widgetRenderersOpenAI, textFormatters, templateData as handlerTemplateData } from '@/src/config/tool-handlers';

// Extended context for tool execution including auth info
interface ExtendedToolContext extends ToolExecutionContext {
  apiKey?: string;
  authToken?: string;
  environmentId?: string;
  mcpSessionId?: string; // MCP session ID for A2A context continuity
  userId?: string; // User ID for OAuth token lookup
  serverName?: string; // Server name for OAuth login URL
}

// Tool execution - looks up handler in registry (sync for NATIVE tools)
function executeTool(name: string, args: Record<string, unknown>, context?: ToolExecutionContext): unknown {
  // Get tool definition to check type
  const toolDef = getToolDefinition(name);

  // For NATIVE tools, use the handler registry
  if (!toolDef || toolDef.type === TOOL_TYPES.NATIVE) {
    const handler = executeHandlers[name];
    if (handler) {
      return handler(args, context);
    }
    throw new Error(`Unknown tool: ${name}`);
  }

  // For non-NATIVE tools, throw - they should use executeToolAsync
  throw new Error(`Tool ${name} requires async execution`);
}

// Async tool execution - handles REST, MCP, GQL, A2A tools
async function executeToolAsync(
  name: string,
  args: Record<string, unknown>,
  context?: ExtendedToolContext
): Promise<{ result: unknown; isRestTool: boolean; toolInfo?: { hasWidget: boolean; invokingMessage?: string; invokedMessage?: string } }> {
  // First try to get from static definitions (NATIVE tools)
  const toolDef = getToolDefinition(name);

  if (toolDef && toolDef.type === TOOL_TYPES.NATIVE) {
    const handler = executeHandlers[name];
    if (handler) {
      return { result: handler(args, context), isRestTool: false };
    }
  }

  // Check if it's a REST tool from the database
  const dbTool = await getToolByName(name);
  if (!dbTool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  if (dbTool.tool_type === 'REST') {
    // Execute REST API call
    const endpointDetails = await getRestEndpointWithDetails(dbTool.id, context?.environmentId);
    if (!endpointDetails) {
      throw new Error(`REST endpoint not found for tool: ${name}`);
    }

    const { endpoint, spec, environment } = endpointDetails;

    // Execute the REST call
    const restResult = await executeRestApiCall({
      endpoint,
      spec,
      environment: environment as EnvironmentRow,
      arguments: args,
      userId: context?.userId,
    });

    // Check if OAuth is needed
    if (!restResult.success && restResult.needsOAuth) {
      return {
        result: {
          error: restResult.error || 'OAuth authentication required',
          needsOAuth: true,
          oauthServerId: restResult.oauthServerId,
          oauthServerType: 'rest',
          loginUrl: `/mcp/${context?.serverName || 'default'}/login?tool_id=${encodeURIComponent(name)}`,
        },
        isRestTool: true,
        toolInfo: {
          hasWidget: false,
          invokingMessage: dbTool.invoking_message,
          invokedMessage: 'Authentication required',
        },
      };
    }

    if (!restResult.success) {
      throw new Error(restResult.error || 'REST API call failed');
    }

    return {
      result: restResult.data,
      isRestTool: true,
      toolInfo: {
        hasWidget: dbTool.has_widget,
        invokingMessage: dbTool.invoking_message,
        invokedMessage: dbTool.invoked_message,
      },
    };
  }

  // Handle GraphQL tools
  if (dbTool.tool_type === 'GQL') {
    const gqlDetails = await getGraphQLOperationWithDetails(dbTool.id, context?.environmentId);
    if (!gqlDetails) {
      throw new Error(`GraphQL operation not found for tool: ${name}`);
    }

    const { operation, spec, environment } = gqlDetails;

    // Execute the GraphQL call
    const gqlResult = await executeGraphQLCall({
      operation: operation as Parameters<typeof executeGraphQLCall>[0]['operation'],
      spec: spec as Parameters<typeof executeGraphQLCall>[0]['spec'],
      environment: environment as EnvironmentRow,
      variables: args,
      userId: context?.userId,
    });

    // Check if OAuth is needed
    if (!gqlResult.success && gqlResult.needsOAuth) {
      return {
        result: {
          error: gqlResult.error || 'OAuth authentication required',
          needsOAuth: true,
          oauthServerId: gqlResult.oauthServerId,
          oauthServerType: 'graphql',
          loginUrl: `/mcp/${context?.serverName || 'default'}/login?tool_id=${encodeURIComponent(name)}`,
        },
        isRestTool: true,
        toolInfo: {
          hasWidget: false,
          invokingMessage: dbTool.invoking_message,
          invokedMessage: 'Authentication required',
        },
      };
    }

    if (!gqlResult.success) {
      throw new Error(gqlResult.error || 'GraphQL call failed');
    }

    return {
      result: gqlResult.data,
      isRestTool: true, // Use same formatting as REST
      toolInfo: {
        hasWidget: dbTool.has_widget,
        invokingMessage: dbTool.invoking_message,
        invokedMessage: dbTool.invoked_message,
      },
    };
  }

  // Handle MCP tools (proxy to external MCP server)
  if (dbTool.tool_type === 'MCP') {
    const mcpDetails = await getMCPServerToolDetails(dbTool.id);
    if (!mcpDetails) {
      throw new Error(`MCP server details not found for tool: ${name}`);
    }

    const { serverTool, server } = mcpDetails;

    if (!serverTool.is_enabled) {
      throw new Error(`MCP tool is disabled: ${name}`);
    }

    // Create MCP client for the external server
    const mcpClient = createMCPClient(
      server.source_url,
      server.auth_type as MCPServerAuthType,
      server.auth_config,
      server.default_headers,
      context?.userId,
      server.id
    );

    try {
      // Initialize connection first (required by official SDK)
      const initResult = await mcpClient.initialize();

      // Check if OAuth is needed
      if ('needsOAuth' in initResult && initResult.needsOAuth) {
        const oauthResult = initResult as MCPCallResult;
        return {
          result: {
            error: oauthResult.error || 'OAuth authentication required',
            needsOAuth: true,
            oauthServerId: oauthResult.oauthServerId,
            oauthServerType: 'mcp',
            loginUrl: `/mcp/${context?.serverName || 'default'}/login?tool_id=${encodeURIComponent(name)}`,
          },
          isRestTool: false,
          toolInfo: {
            hasWidget: false,
            invokingMessage: dbTool.invoking_message || `Calling ${serverTool.original_name}...`,
            invokedMessage: 'Authentication required',
          },
        };
      }

      // Proxy the tool call to the external MCP server
      const result = await mcpClient.callTool(serverTool.original_name, args);

      // Close connection after use
      await mcpClient.close();

      return {
        result,
        isRestTool: false,
        toolInfo: {
          hasWidget: serverTool.has_widget || dbTool.has_widget,
          invokingMessage: dbTool.invoking_message || `Calling ${serverTool.original_name}...`,
          invokedMessage: dbTool.invoked_message || 'MCP tool call complete',
        },
      };
    } catch (error) {
      // Ensure connection is closed on error
      await mcpClient.close().catch(() => {});
      throw error;
    }
  }

  // Handle A2A agent tools
  if (dbTool.tool_type === 'A2A') {
    const agent = await getA2AAgentByToolName(name);
    if (!agent) {
      throw new Error(`A2A agent not found for tool: ${name}`);
    }

    try {
      // Extract query from args (A2A tools expect a 'query' parameter)
      const query = (args.query as string) || JSON.stringify(args);

      // Use MCP session ID as contextId for A2A conversation continuity
      // Falls back to contextId from args if provided
      const contextId = context?.mcpSessionId || (args.contextId as string | undefined);

      // Build auth config from agent settings
      const authConfig: Record<string, string> = {};
      if (agent.auth_config && typeof agent.auth_config === 'object') {
        Object.assign(authConfig, agent.auth_config);
      }

      // Build headers from agent default headers
      const headers: Record<string, string> = {};
      if (agent.default_headers && typeof agent.default_headers === 'object') {
        Object.assign(headers, agent.default_headers);
      }

      // Use our simple A2A client which directly calls the agent_url
      const response = await sendA2AMessage(
        {
          agentUrl: agent.agent_url,
          agentId: agent.id, // Pass agent ID for OAuth token lookup
          authType: agent.auth_type as 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2',
          authConfig,
          headers,
          contextId, // Pass contextId for conversation continuity
        },
        query
      );

      // Check if OAuth is needed
      if (!response.success && response.needsOAuth) {
        return {
          result: {
            error: response.error || 'OAuth authentication required',
            needsOAuth: true,
            oauthServerId: response.oauthServerId || agent.id,
            oauthServerType: 'a2a',
            loginUrl: `/mcp/${context?.serverName || 'default'}/login?tool_id=${encodeURIComponent(name)}`,
          },
          isRestTool: false,
          toolInfo: {
            hasWidget: false,
            invokingMessage: dbTool.invoking_message || `Calling ${agent.display_name}...`,
            invokedMessage: dbTool.invoked_message || 'Agent response received',
          },
        };
      }

      if (!response.success) {
        throw new Error(response.error || 'Agent returned an error');
      }

      // Return result with contextId for conversation continuity
      return {
        result: {
          content: response.content || 'Agent returned no response',
          contextId: response.contextId, // Include contextId in result
          taskState: response.taskState,
        },
        isRestTool: false,
        toolInfo: {
          hasWidget: false,
          invokingMessage: dbTool.invoking_message || `Calling ${agent.display_name}...`,
          invokedMessage: dbTool.invoked_message || 'Agent response received',
        },
      };
    } catch (error) {
      console.error('A2A agent call failed:', error);
      throw new Error(`A2A agent call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Handle RAG tools
  if (dbTool.tool_type === 'RAG') {
    const rag = await getRAGByToolName(name);
    if (!rag) {
      throw new Error(`RAG not found for tool: ${name}`);
    }

    try {
      const query = (args.query as string) || '';
      const topN = (args.top_n as number) || rag.top_n || 5;

      if (rag.source_type === 'csv') {
        // For CSV RAGs, call our collection API directly
        // We need the user's API key to call the collection endpoint
        const apiKey = context?.apiKey;
        if (!apiKey) {
          throw new Error('API key required for RAG search');
        }

        const response = await fetch(`${process.env.NEXT_PUBLIC_URL || 'https://tulzo.com'}/api/collection/${apiKey}/${rag.rag_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, top_n: topN }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error || `RAG search failed: ${response.status}`);
        }

        const data = await response.json();
        return {
          result: data,
          isRestTool: false,
          toolInfo: {
            hasWidget: false,
            invokingMessage: dbTool.invoking_message || `Searching ${rag.name}...`,
            invokedMessage: dbTool.invoked_message || 'Search complete',
          },
        };
      } else {
        // For URL RAGs, use the RAG proxy which handles auth (including OAuth)
        const fieldMapping = rag.field_mapping || { query: 'query', top_n: 'top_n' };

        // Build auth config for proxy
        const authConfig: { apiKey?: string; bearerToken?: string; basicCredentials?: string } = {};
        if (rag.auth_type === 'api_key' && rag.auth_config) {
          authConfig.apiKey = (rag.auth_config as { api_key?: string }).api_key;
        } else if (rag.auth_type === 'bearer' && rag.auth_config) {
          authConfig.bearerToken = (rag.auth_config as { token?: string }).token;
        } else if (rag.auth_type === 'basic' && rag.auth_config) {
          const basicConfig = rag.auth_config as { username?: string; password?: string };
          authConfig.basicCredentials = `${basicConfig.username || ''}:${basicConfig.password || ''}`;
        }

        // Build OAuth2 config if needed
        const oauth2Config = rag.auth_type === 'oauth2' && rag.auth_config ? {
          tokenEndpoint: (rag.auth_config as { token_endpoint?: string }).token_endpoint,
          clientId: (rag.auth_config as { client_id?: string }).client_id,
          clientSecret: (rag.auth_config as { client_secret?: string }).client_secret,
        } : undefined;

        // Call the RAG proxy with internal auth headers for server-to-server call
        const proxyResponse = await fetch(`${process.env.NEXT_PUBLIC_URL || 'https://tulzo.com'}/api/ai/rags/proxy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
            'x-internal-user-id': userId,
          },
          body: JSON.stringify({
            url: rag.remote_url,
            method: rag.http_method || 'POST',
            paramsLocation: rag.params_location || 'body',
            contentType: rag.request_content_type || 'application/json',
            authType: rag.auth_type || 'none',
            authConfig,
            oauth2Config,
            customHeaders: rag.custom_headers || {},
            fieldMapping: {
              query: fieldMapping.query || 'query',
              embedding: fieldMapping.embedding || 'embedding',
              top_n: fieldMapping.top_n || 'top_n',
              dimensions: fieldMapping.dimensions || 'dimensions',
              model: fieldMapping.model || 'model',
            },
            query,
            topN,
            generateEmbedding: !!rag.embedding_model,
            embeddingModel: rag.embedding_model,
            dimensions: rag.embedding_dimensions,
            ragId: rag.id,
          }),
        });

        const proxyData = await proxyResponse.json();

        // Check if OAuth is needed
        if (proxyData.needsOAuth) {
          return {
            result: {
              error: proxyData.error || 'OAuth authentication required',
              needsOAuth: true,
              oauthServerId: proxyData.oauthServerId || rag.id,
              oauthServerType: 'rag',
              loginUrl: `/mcp/${context?.serverName || 'default'}/login?tool_id=${encodeURIComponent(name)}`,
            },
            isRestTool: false,
            toolInfo: {
              hasWidget: false,
              invokingMessage: dbTool.invoking_message || `Searching ${rag.name}...`,
              invokedMessage: dbTool.invoked_message || 'Search complete',
            },
          };
        }

        // Check for proxy errors
        if (!proxyResponse.ok || proxyData.error) {
          throw new Error(proxyData.error || `Remote RAG search failed: ${proxyData.status}`);
        }

        return {
          result: proxyData.data,
          isRestTool: false,
          toolInfo: {
            hasWidget: false,
            invokingMessage: dbTool.invoking_message || `Searching ${rag.name}...`,
            invokedMessage: dbTool.invoked_message || 'Search complete',
          },
        };
      }
    } catch (error) {
      console.error('RAG search failed:', error);
      throw new Error(`RAG search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Handle other tool types
  throw new Error(`Unknown tool type for: ${name}`);
}

// Format REST API result as text
function formatRestResultText(toolName: string, result: unknown): string {
  const title = toolName.split('_').filter(w => w.length > 0).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  if (result === null || result === undefined) {
    return `${title}: No data returned`;
  }

  if (typeof result === 'string') {
    return `${title}:\n${result}`;
  }

  if (typeof result === 'object') {
    try {
      return `${title}:\n${JSON.stringify(result, null, 2)}`;
    } catch {
      return `${title}: [Complex object]`;
    }
  }

  return `${title}: ${String(result)}`;
}

// Generate a generic widget for REST API results
function generateRestWidgetHtml(toolName: string, data: unknown, hasWidget: boolean): string {
  const title = toolName.split('_').filter(w => w.length > 0).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  // If widget is disabled, return minimal HTML
  if (!hasWidget) {
    return `<!DOCTYPE html><html><body><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
  }

  // Generate a nice generic widget for REST API data
  const dataJson = JSON.stringify(data, null, 2);
  const escapedData = dataJson.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 1.5rem;
      max-width: 500px;
      width: 100%;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      font-size: 1.1rem;
      color: #fff;
      font-weight: 600;
    }
    .icon { font-size: 1.5rem; }
    .content {
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
    }
    pre {
      color: #e2e8f0;
      font-size: 0.85rem;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .success-badge {
      display: inline-block;
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      margin-bottom: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="icon">🔌</span>
      <span>${title}</span>
    </div>
    <div class="success-badge">✓ API Response</div>
    <div class="content">
      <pre>${escapedData}</pre>
    </div>
  </div>
</body>
</html>`;
}

// Map tool names to widget types - all tools get widgets
function getWidgetType(toolName: string): string {
  const widgetMap: Record<string, string> = {
    'calculate_ideal_weight': 'ideal_weight',
    'generate_weight_loss_plan': 'weight_loss_plan',
    'calculate_savings_plan': 'savings_plan',
    'calculate_tip': 'tip',
    'calculate_percentage': 'percentage',
    'calculate_age': 'age',
    'convert_units': 'convert_units',
    'calculate_cycle': 'cycle',
    'calculate_countdown': 'countdown',
    'make_decision': 'decision',
    'zodiac_compatibility': 'zodiac',
    'generate_names': 'names',
    'calculate_position_size': 'position_size',
    'spin_wheel': 'spin_wheel',
    'zone_calculator': 'zone',
    'lucky_number': 'lucky_number',
    'flip_tool': 'flip',
    'vibe_quiz': 'vibe_quiz',
    'sleep_calculator': 'sleep_calculator',
    'calculate_iq_score': 'iq_score',
    'calculate_uniqueness': 'uniqueness',
    'when_date_info': 'when_date',
    'blood_calculator': 'blood',
    'find_next_eclipse': 'next_eclipse',
    'list_upcoming_eclipses': 'eclipse_list',
  };
  return widgetMap[toolName] || 'generic';
}

// Common CSS styles for widgets
const WIDGET_STYLES = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  min-height: 100vh;
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.card {
  background: rgba(255,255,255,0.1);
  backdrop-filter: blur(10px);
  border-radius: 16px;
  padding: 1.5rem;
  max-width: 320px;
  width: 100%;
  border: 1px solid rgba(255,255,255,0.2);
}
.header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 1.1rem;
  color: #fff;
  font-weight: 600;
}
.big-number {
  font-size: 3.5rem;
  font-weight: 700;
  text-align: center;
  margin: 0.5rem 0;
}
.label {
  text-align: center;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  margin-bottom: 1rem;
  font-weight: 600;
}
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.stat-box {
  background: rgba(255,255,255,0.1);
  padding: 0.75rem;
  border-radius: 8px;
  text-align: center;
}
.stat-label { color: rgba(255,255,255,0.7); font-size: 0.75rem; }
.stat-value { color: #fff; font-weight: 600; font-size: 1rem; }
.footer {
  margin-top: 1rem;
  text-align: center;
  color: rgba(255,255,255,0.5);
  font-size: 0.7rem;
}
`;

// Widget rendering mode: 'inline' (default) or 'iframe'
const WIDGET_MODE: 'inline' | 'iframe' = 'inline';

// Base URL for iframe mode
const WIDGET_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://tulzo.com';

// Generate iframe-based widget HTML (uses /embed page with React components)
function generateIframeWidgetHtml(toolName: string, data: Record<string, unknown>): string {
  const encodedData = encodeURIComponent(JSON.stringify(data));
  const embedUrl = `${WIDGET_BASE_URL}/embed?tool=${toolName}&data=${encodedData}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    iframe {
      width: 100%;
      height: 100vh;
      min-height: 400px;
      border: none;
      background: transparent;
    }
  </style>
</head>
<body>
  <iframe id="widget-frame" src="${embedUrl}" allow="clipboard-write"></iframe>
  <script>
    // Embedded data for reference
    const embeddedData = ${JSON.stringify({ tool: toolName, data })};

    // OpenAI SDK integration - forward data to iframe
    window.addEventListener("openai:set_globals", function(ev) {
      console.log("🎯 openai:set_globals event fired");
      const toolOutput = window.openai?.toolOutput?.result;
      if (toolOutput) {
        console.log("📦 Got OpenAI tool output:", toolOutput);
        // Post message to iframe with updated data
        const iframe = document.getElementById('widget-frame');
        iframe.contentWindow.postMessage({ type: 'widget-data', tool: embeddedData.tool, data: toolOutput }, '*');
      }
    });

    // Check if OpenAI data is already available
    if (window.openai?.toolOutput?.result) {
      console.log("📦 OpenAI data already available");
      setTimeout(() => {
        const iframe = document.getElementById('widget-frame');
        iframe.contentWindow.postMessage({ type: 'widget-data', tool: embeddedData.tool, data: window.openai.toolOutput.result }, '*');
      }, 100);
    }
  </script>
</body>
</html>`;
}

// Generate self-contained widget HTML (inline mode)
function generateInlineWidgetHtml(toolName: string, data: Record<string, unknown>): string {
  const widgetType = getWidgetType(toolName);

  // Get content from registry or use generic fallback
  let content = '';
  const renderer = widgetRenderers[toolName];
  if (renderer) {
    content = renderer(data);
  } else {
    // Generic fallback for tools not in registry
    const entries = Object.entries(data).filter(([k]) => k !== 'message');
    const hasData = entries.length > 0 && !data.message;
    if (hasData) {
      content = `
        <div class="header">🔧 Result</div>
        <div class="stats" style="grid-template-columns:1fr">
          ${entries.slice(0, 6).map(([k, v]) => `<div class="stat-box"><div class="stat-label">${k.replace(/([A-Z])/g, ' $1').trim()}</div><div class="stat-value">${typeof v === 'object' ? JSON.stringify(v) : v}</div></div>`).join('')}
        </div>`;
    } else {
      content = `
        <div class="header">⏳ Awaiting Data</div>
        <div style="text-align:center;padding:2rem 1rem;color:rgba(255,255,255,0.6)">
          <div style="font-size:2.5rem;margin-bottom:0.5rem">🔄</div>
          <div>Waiting for tool execution...</div>
        </div>`;
    }
  }

  // Generate HTML with OpenAI SDK support and Claude fallback
  // Start with LOADING state, then:
  // - OpenAI: wait for openai:set_globals to get real data
  // - Claude: render embedded data after short timeout (no OpenAI env)
  const loadingContent = `
    <div class="header">⏳ Loading...</div>
    <div style="text-align:center;padding:2rem 1rem;color:rgba(255,255,255,0.6)">
      <div style="font-size:2.5rem;margin-bottom:0.5rem;animation:pulse 1.5s ease-in-out infinite">🔄</div>
      <div>Awaiting results...</div>
    </div>
    <style>@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }</style>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${WIDGET_STYLES}</style>
</head>
<body>
  <div class="card" id="widget-container">${loadingContent}<div class="footer">tulzo.vercel.app</div></div>
  <script>
    // Embedded data for Claude (fallback)
    const embeddedData = ${JSON.stringify({ tool: toolName, data })};
    const widgetType = "${widgetType}";
    let dataReceived = false;

    // OpenAI SDK integration - listen for set_globals event
    window.addEventListener("openai:set_globals", function(ev) {
      console.log("🎯 openai:set_globals event fired");
      const toolOutput = window.openai?.toolOutput?.result;
      if (toolOutput) {
        console.log("📦 Got OpenAI tool output:", toolOutput);
        dataReceived = true;
        updateWidget({ tool: embeddedData.tool, data: toolOutput });
      }
    });

    // Check if OpenAI data is already available
    if (window.openai?.toolOutput?.result) {
      console.log("📦 OpenAI data already available");
      dataReceived = true;
      updateWidget({ tool: embeddedData.tool, data: window.openai.toolOutput.result });
    } else {
      // Fallback for Claude: if no OpenAI data after 100ms, use embedded data
      setTimeout(function() {
        if (!dataReceived) {
          console.log("📦 Using embedded data (Claude fallback)");
          updateWidget(embeddedData);
        }
      }, 100);
    }

    function updateWidget(wd) {
      console.log("🔄 Widget data:", wd);
      const container = document.getElementById('widget-container');
      if (!container) return;

      const data = wd.data;
      let html = renderWidgetContent(widgetType, data);
      container.innerHTML = html + '<div class="footer">tulzo.vercel.app</div>';
    }

    function renderWidgetContent(type, data) {
      switch(type) {
        case 'bmi': {
          const bmi = Number(data.bmi).toFixed(1);
          const category = data.category || '';
          const colorMap = { underweight: '#60a5fa', normal: '#10b981', overweight: '#f59e0b', obese: '#ef4444' };
          const color = colorMap[category.toLowerCase()] || '#fff';
          return '<div class="header">📏 BMI Calculator</div>' +
            '<div class="big-number" style="color:' + color + '">' + bmi + '</div>' +
            '<div class="label" style="background:' + color + '33;color:' + color + '">' + category + '</div>' +
            (data.weight || data.height ? '<div class="stats">' +
              (data.weight ? '<div class="stat-box"><div class="stat-label">Weight</div><div class="stat-value">' + data.weight + ' kg</div></div>' : '') +
              (data.height ? '<div class="stat-box"><div class="stat-label">Height</div><div class="stat-value">' + data.height + ' cm</div></div>' : '') +
            '</div>' : '');
        }
        case 'age': {
          return '<div class="header">🎂 Age Calculator</div>' +
            '<div class="big-number" style="color:#f472b6">' + data.years + '</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">years old</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">' + data.months + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Days</div><div class="stat-value">' + data.days + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Total Days</div><div class="stat-value">' + Number(data.totalDays).toLocaleString() + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Next Birthday</div><div class="stat-value">' + data.daysUntilNextBirthday + ' days</div></div>' +
            '</div>';
        }
        case 'flip': {
          // Unified flip widget - renders based on flipMode
          if (data.flipMode === 'dice') {
            var rolls = data.rolls || [];
            return '<div class="header">🎲 Dice Roll</div>' +
              '<div class="big-number" style="color:#60a5fa">' + data.total + '</div>' +
              '<div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">Total</div>' +
              '<div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin-top:0.5rem">' +
                rolls.map(function(r) { return '<span style="background:rgba(96,165,250,0.3);padding:0.5rem 1rem;border-radius:8px;font-weight:700;color:#fff">' + r + '</span>'; }).join('') +
              '</div>';
          } else {
            var result = data.result || 'heads';
            var isHeads = result === 'heads';
            var coinColor = isHeads ? '#fbbf24' : '#9ca3af';
            var coinBg = isHeads ? 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 50%, #d97706 100%)' : 'linear-gradient(135deg, #f3f4f6 0%, #9ca3af 50%, #6b7280 100%)';
            var borderColor = isHeads ? '#b45309' : '#4b5563';
            var textColor = isHeads ? '#92400e' : '#374151';
            var count = data.count || 1;
            return '<div class="header">🪙 Coin Flip</div>' +
              '<div style="text-align:center;margin:1rem 0">' +
                '<div style="width:80px;height:80px;border-radius:50%;background:' + coinBg + ';display:inline-flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);border:3px solid ' + borderColor + '">' +
                  '<span style="font-size:2rem;font-weight:800;color:' + textColor + '">' + (isHeads ? 'H' : 'T') + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="big-number" style="color:' + coinColor + ';font-size:2rem">' + result.toUpperCase() + '</div>' +
              (count > 1 ? '<div class="stats">' +
                '<div class="stat-box"><div class="stat-label">Heads</div><div class="stat-value" style="color:#fbbf24">' + data.headsCount + '</div></div>' +
                '<div class="stat-box"><div class="stat-label">Tails</div><div class="stat-value" style="color:#9ca3af">' + data.tailsCount + '</div></div>' +
              '</div>' : '');
          }
        }
        case 'tip': {
          return '<div class="header">💵 Tip Calculator</div>' +
            '<div class="big-number" style="color:#10b981">$' + Number(data.total).toFixed(2) + '</div>' +
            '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Total with ' + data.tipPercent + '% tip</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Bill</div><div class="stat-value">$' + data.billAmount + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Tip</div><div class="stat-value">$' + Number(data.tipAmount).toFixed(2) + '</div></div>' +
              (Number(data.splitWays) > 1 ? '<div class="stat-box" style="grid-column:span 2"><div class="stat-label">Per Person (' + data.splitWays + ' ways)</div><div class="stat-value">$' + Number(data.perPerson).toFixed(2) + '</div></div>' : '') +
            '</div>';
        }
        case 'ideal_weight': {
          return '<div class="header">⚖️ Ideal Weight</div>' +
            '<div class="big-number" style="color:#10b981">' + Number(data.idealWeight).toFixed(1) + '</div>' +
            '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">kg (' + (data.formula || 'Devine') + ')</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Height</div><div class="stat-value">' + data.height + ' cm</div></div>' +
              '<div class="stat-box"><div class="stat-label">Gender</div><div class="stat-value">' + data.gender + '</div></div>' +
            '</div>';
        }
        case 'bmr': {
          return '<div class="header">🔥 BMR Calculator</div>' +
            '<div class="big-number" style="color:#f59e0b">' + Math.round(data.bmr) + '</div>' +
            '<div class="label" style="background:rgba(245,158,11,0.2);color:#f59e0b">calories/day</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">TDEE</div><div class="stat-value">' + Math.round(data.tdee) + ' cal</div></div>' +
              '<div class="stat-box"><div class="stat-label">Activity</div><div class="stat-value">' + (data.activityLevel || 'moderate') + '</div></div>' +
            '</div>';
        }
        case 'weight_loss_plan': {
          return '<div class="header">📉 Weight Loss Plan</div>' +
            '<div class="big-number" style="color:#10b981;font-size:2rem">' + data.targetWeight + ' kg</div>' +
            '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">Target in ' + data.weeksToGoal + ' weeks</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Current</div><div class="stat-value">' + data.currentWeight + ' kg</div></div>' +
              '<div class="stat-box"><div class="stat-label">Daily Cal</div><div class="stat-value">' + data.dailyCalories + '</div></div>' +
            '</div>';
        }
        case 'savings_plan': {
          var currencySymbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', RON: 'lei ' };
          var sym = currencySymbols[data.currency] || '$';
          var finalBalance = Number(data.finalBalance || 0).toLocaleString();
          var monthlyTargetSavings = Number(data.monthlyTargetSavings || 0).toLocaleString();
          var monthsToGoal = data.monthsToGoal || 0;
          var savingsMode = data.savingsMode === 'duration' ? '⏱️ Duration' : '🎯 Goal';
          var interestEnabled = data.interestEnabled;
          var totalInterestEarned = Number(data.totalInterestEarned || 0).toLocaleString();
          var annualInterestRate = data.annualInterestRate || 0;
          var savingsRate = data.savingsRate || 0;

          return '<div class="header">💰 Savings Plan</div>' +
            '<div class="big-number" style="color:#10b981">' + sym + finalBalance + '</div>' +
            '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">' + savingsMode + ' • ' + monthsToGoal + ' months</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Monthly Savings</div><div class="stat-value">' + sym + monthlyTargetSavings + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Savings Rate</div><div class="stat-value">' + savingsRate + '%</div></div>' +
              (interestEnabled ?
                '<div class="stat-box"><div class="stat-label">Interest Rate</div><div class="stat-value">' + annualInterestRate + '%/yr</div></div>' +
                '<div class="stat-box"><div class="stat-label">Interest Earned</div><div class="stat-value" style="color:#34d399">' + sym + totalInterestEarned + '</div></div>'
              :
                '<div class="stat-box"><div class="stat-label">Target Date</div><div class="stat-value">' + (data.targetDate || 'N/A') + '</div></div>' +
                '<div class="stat-box"><div class="stat-label">Achievable</div><div class="stat-value">' + (data.isAchievable ? '✅ Yes' : '⚠️ Stretch') + '</div></div>'
              ) +
            '</div>';
        }
        case 'days_between': {
          return '<div class="header">📆 Days Between</div>' +
            '<div class="big-number" style="color:#a78bfa">' + Math.abs(data.days) + '</div>' +
            '<div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">days</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">' + data.weeks + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Months</div><div class="stat-value">' + data.months + '</div></div>' +
            '</div>';
        }
        case 'lucky_number': {
          var luckyNums = data.numbers || [data.luckyNumber];
          var luckyCount = data.count || 1;
          var luckyDisplay = luckyCount > 1 ? luckyNums.join(', ') : data.luckyNumber;
          var luckyRange = data.range || (data.min + ' - ' + data.max);
          return '<div class="header">🍀 Lucky Number' + (luckyCount > 1 ? 's' : '') + '</div>' +
            '<div class="big-number" style="color:#22c55e">' + luckyDisplay + '</div>' +
            '<div class="label" style="background:rgba(34,197,94,0.2);color:#22c55e">Range: ' + luckyRange + '</div>';
        }
        case 'spin_wheel': {
          var spinOptions = data.options || [];
          var wheelColors = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
          var winnerColor = wheelColors[data.index % wheelColors.length];
          return '<div class="header">🎡 Spin Wheel</div>' +
            '<div style="text-align:center;font-size:3rem;margin:0.5rem 0">🎡</div>' +
            '<div class="big-number" style="color:' + winnerColor + ';font-size:1.8rem">' + data.result + '</div>' +
            '<div class="label" style="background:rgba(139,92,246,0.2);color:#8b5cf6">Winner from ' + spinOptions.length + ' options</div>';
        }
        case 'percentage': {
          var pctSuffix = data.resultIsPercent ? '%' : '';
          var pctExplanation = data.explanation || (data.value1 + ' → ' + data.value2);
          return '<div class="header">📊 Percentage</div>' +
            '<div class="big-number" style="color:#f472b6">' + data.result + pctSuffix + '</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6;font-size:0.9rem;padding:0.75rem 1rem">' + pctExplanation + '</div>';
        }
        case 'convert_units': {
          return '<div class="header">🔄 Unit Converter</div>' +
            '<div class="big-number" style="color:#60a5fa;font-size:2rem">' + data.result + '</div>' +
            '<div class="label" style="background:rgba(96,165,250,0.2);color:#60a5fa">' + (data.to || data.toUnit) + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box" style="grid-column:span 2"><div class="stat-label">From</div><div class="stat-value">' + data.value + ' ' + (data.from || data.fromUnit) + '</div></div>' +
            '</div>';
        }
        case 'countdown': {
          var cdIsPast = data.isPast || data.days < 0;
          var cdIsToday = data.isToday || data.days === 0;
          var cdAbsDays = data.absoluteDays || Math.abs(data.days);
          if (cdIsToday) {
            return '<div class="header">⏳ Countdown</div>' +
              '<div class="big-number" style="color:#10b981">🎉</div>' +
              '<div class="label" style="background:rgba(16,185,129,0.2);color:#10b981">' + (data.eventName || 'Event') + ' is Today!</div>';
          }
          return '<div class="header">⏳ Countdown</div>' +
            '<div class="big-number" style="color:#06b6d4">' + cdAbsDays + '</div>' +
            '<div class="label" style="background:rgba(6,182,212,0.2);color:#06b6d4">days ' + (cdIsPast ? 'ago' : 'to go') + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Event</div><div class="stat-value">' + (data.eventName || 'Target') + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Weeks</div><div class="stat-value">' + data.weeks + '</div></div>' +
            '</div>';
        }
        case 'decision': {
          var decIcon = data.icon || '🎱';
          var decMode = data.mode || 'pickOne';
          var decModeLabel = decMode === 'yesNo' ? 'Yes/No Oracle' : decMode === 'weighted' ? 'Weighted Choice' : 'Random Pick';
          return '<div class="header">🎱 Decision Maker</div>' +
            '<div style="text-align:center;font-size:3rem;margin:0.5rem 0">' + decIcon + '</div>' +
            '<div class="big-number" style="color:#a78bfa;font-size:1.5rem">' + data.decision + '</div>' +
            '<div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">' + decModeLabel + '</div>';
        }
        case 'zodiac': {
          return '<div class="header">💕 Zodiac Compatibility</div>' +
            '<div class="big-number" style="color:#f472b6">' + data.compatibility + '%</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">' + data.level + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">' + (data.person1 && data.person1.symbol || '⭐') + '</div><div class="stat-value">' + (data.person1 && data.person1.name || data.sign1) + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">' + (data.person2 && data.person2.symbol || '⭐') + '</div><div class="stat-value">' + (data.person2 && data.person2.name || data.sign2) + '</div></div>' +
            '</div>';
        }
        case 'cycle': {
          var cycPhaseInfo = data.phaseInfo || {};
          var cycPhaseColor = cycPhaseInfo.color || '#f472b6';
          var cycPhaseEmoji = cycPhaseInfo.emoji || '🌸';
          return '<div class="header">🌸 Cycle Tracker</div>' +
            '<div class="big-number" style="color:#f472b6;font-size:1.5rem">' + data.nextPeriodStart + '</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">Next Period' + (data.daysUntilNextPeriod ? ' (in ' + data.daysUntilNextPeriod + ' days)' : '') + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Cycle Day</div><div class="stat-value">' + (data.currentDay || '—') + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">' + cycPhaseEmoji + ' Phase</div><div class="stat-value" style="color:' + cycPhaseColor + '">' + (cycPhaseInfo.name || data.phase || '—') + '</div></div>' +
            '</div>';
        }
        case 'names': {
          var names = data.names || [];
          return '<div class="header">👶 Name Generator</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:1rem 0">' +
              names.slice(0, 8).map(function(n) { return '<span style="background:rgba(244,114,182,0.2);color:#f472b6;padding:0.5rem 1rem;border-radius:20px;font-weight:600">' + n + '</span>'; }).join('') +
            '</div>' +
            '<div class="label" style="background:rgba(244,114,182,0.2);color:#f472b6">' + data.gender + ' names</div>';
        }
        case 'position_size': {
          var posRiskColor = data.riskColor || '#eab308';
          var posDir = data.direction === 'short' ? '🔴 SHORT' : '🟢 LONG';
          if (data.calculatedField === 'suggestions' && data.suggestions) {
            var suggRows = data.suggestions.slice(0, 3).map(function(s) {
              return '<div style="display:flex;justify-content:space-between;padding:0.5rem;background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:0.25rem"><span style="color:#ef4444">SL: $' + s.stopLoss + '</span><span style="color:#60a5fa">Qty: ' + s.quantity + '</span></div>';
            }).join('');
            return '<div class="header">📈 Position Suggestions</div>' +
              '<div class="big-number" style="color:' + posRiskColor + '">' + data.riskPercent + '% Risk</div>' +
              '<div class="label" style="background:rgba(234,179,8,0.2);color:#eab308">' + posDir + ' | $' + data.riskAmount + ' at risk</div>' +
              '<div style="margin-top:1rem">' + suggRows + '</div>';
          } else {
            return '<div class="header">📈 Position Size</div>' +
              '<div class="big-number" style="color:' + posRiskColor + '">' + data.riskPercent + '%</div>' +
              '<div class="label" style="background:' + posRiskColor + '33;color:' + posRiskColor + '">' + data.riskLabel + ' | ' + posDir + '</div>' +
              '<div class="stats">' +
                '<div class="stat-box"><div class="stat-label">🛑 Stop Loss</div><div class="stat-value" style="color:#ef4444">$' + data.stopLoss + '</div></div>' +
                '<div class="stat-box"><div class="stat-label">📦 Quantity</div><div class="stat-value" style="color:#60a5fa">' + data.quantity + '</div></div>' +
                '<div class="stat-box"><div class="stat-label">💰 Risk Amt</div><div class="stat-value">$' + data.riskAmount + '</div></div>' +
              '</div>';
          }
        }
        case 'sleep_times': {
          var times = data.sleepTimes || data.wakeTimes || [];
          return '<div class="header">😴 Sleep Calculator</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;margin:1rem 0">' +
              times.slice(0, 4).map(function(t) { return '<span style="background:rgba(139,92,246,0.2);color:#8b5cf6;padding:0.5rem 1rem;border-radius:20px;font-weight:600">' + t + '</span>'; }).join('') +
            '</div>' +
            '<div class="label" style="background:rgba(139,92,246,0.2);color:#8b5cf6">Optimal ' + (data.sleepTimes ? 'bedtimes' : 'wake times') + '</div>';
        }
        case 'zone': {
          var conversions = data.conversions || [];
          var conversionRows = conversions.slice(0, 4).map(function(c) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem;background:rgba(96,165,250,0.1);border-radius:8px;margin-bottom:0.25rem">' +
              '<span style="color:rgba(255,255,255,0.8)">' + c.city + '</span>' +
              '<span style="color:#60a5fa;font-weight:700">' + c.time + (c.dayChange ? ' <span style="font-size:0.75rem;color:#f59e0b">(' + c.dayChange + ')</span>' : '') + '</span>' +
            '</div>';
          }).join('');
          return '<div class="header">🌍 Timezone Converter</div>' +
            '<div class="big-number" style="color:#60a5fa;font-size:1.5rem">' + data.sourceTime + ' ' + (data.sourceCity || data.sourceTimezone) + '</div>' +
            '<div style="margin-top:1rem">' + conversionRows + '</div>';
        }
        case 'vibe_quiz': {
          var vibeType = data.type;
          var vibeColor = vibeType === 'cat' ? '#a78bfa' : '#f59e0b';
          return '<div class="header">' + data.emoji + ' ' + data.title + '</div>' +
            '<div class="big-number" style="color:' + vibeColor + '">' + data.percentage + '%</div>' +
            '<div class="label" style="background:' + vibeColor + '33;color:' + vibeColor + '">' + (vibeType === 'cat' ? 'Cat Person' : 'Dog Person') + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">🐱 Cat</div><div class="stat-value">' + data.catScore + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">🐕 Dog</div><div class="stat-value">' + data.dogScore + '</div></div>' +
            '</div>' +
            '<div style="margin-top:0.75rem;font-size:0.85rem;color:rgba(255,255,255,0.8);line-height:1.4">' + data.description + '</div>';
        }

        case 'sleep_calculator': {
          var sleepResults = data.results || [];
          var optimalResult = sleepResults.find(function(r) { return r.quality === 'optimal'; }) || sleepResults[0];
          var sleepRows = sleepResults.slice(0, 4).map(function(r) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.1)">' +
              '<span>' + r.emoji + ' ' + r.time + '</span>' +
              '<span style="color:' + r.color + '">' + r.cycles + ' cycles • ' + r.hours.toFixed(1) + 'h</span>' +
            '</div>';
          }).join('');
          return '<div class="header">😴 Sleep Calculator</div>' +
            '<div class="big-number" style="color:#a78bfa;font-size:1.8rem">' + (optimalResult ? optimalResult.time : 'N/A') + '</div>' +
            '<div class="label" style="background:rgba(167,139,250,0.2);color:#a78bfa">' + (data.mode === 'wakeAt' ? 'Go to sleep at' : 'Wake up at') + '</div>' +
            '<div style="margin-top:0.75rem">' + sleepRows + '</div>';
        }
        case 'iq_score': {
          var iq = Number(data.iqScore || data.iq);
          var iqColor = data.color || (iq >= 130 ? '#10b981' : iq >= 100 ? '#60a5fa' : '#f59e0b');
          return '<div class="header">🧠 IQ Score</div>' +
            '<div class="big-number" style="color:' + iqColor + '">' + iq + '</div>' +
            '<div class="label" style="background:' + iqColor + '33;color:' + iqColor + '">' + (data.emoji || '') + ' ' + data.category + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Percentile</div><div class="stat-value">Top ' + (100 - data.percentile) + '%</div></div>' +
              '<div class="stat-box"><div class="stat-label">Correct</div><div class="stat-value">' + data.correctAnswers + '/' + data.totalQuestions + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Accuracy</div><div class="stat-value">' + data.accuracy + '%</div></div>' +
            '</div>';
        }
        case 'uniqueness': {
          var score = Number(data.uniquenessScore);
          var uColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
          return '<div class="header">🦄 Uniqueness</div>' +
            '<div class="big-number" style="color:' + uColor + '">' + score + '%</div>' +
            '<div class="label" style="background:' + uColor + '33;color:' + uColor + '">' + data.category + '</div>';
        }
        case 'when_date': {
          var tenseColor = data.isPast ? '#ef4444' : data.isToday ? '#22c55e' : '#3b82f6';
          var tenseLabel = data.isPast ? 'Past' : data.isToday ? 'Today' : 'Future';
          var absDays = Math.abs(data.daysFromToday || 0);
          var zodiacSymbols = { 'Aries': '♈', 'Taurus': '♉', 'Gemini': '♊', 'Cancer': '♋', 'Leo': '♌', 'Virgo': '♍', 'Libra': '♎', 'Scorpio': '♏', 'Sagittarius': '♐', 'Capricorn': '♑', 'Aquarius': '♒', 'Pisces': '♓' };
          var zodiacSymbol = zodiacSymbols[data.zodiacSign] || '⭐';
          return '<div class="header">📅 Date Info</div>' +
            '<div class="big-number" style="color:#60a5fa;font-size:1.3rem">' + (data.formattedDate || data.date) + '</div>' +
            '<div class="label" style="background:' + tenseColor + '33;color:' + tenseColor + '">' + data.dayOfWeek + ' • ' + tenseLabel + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Zodiac</div><div class="stat-value">' + zodiacSymbol + ' ' + data.zodiacSign + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Days</div><div class="stat-value">' + absDays + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Week #</div><div class="stat-value">' + data.weekOfYear + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Day #</div><div class="stat-value">' + data.dayOfYear + '</div></div>' +
            '</div>' +
            '<div style="margin-top:0.5rem;font-size:0.75rem;color:rgba(255,255,255,0.6)">Q' + data.quarter + (data.isLeapYear ? ' • Leap Year' : '') + '</div>';
        }
        case 'blood_donation': {
          var eligibleColor = data.eligible ? '#22c55e' : '#ef4444';
          var eligibleIcon = data.eligible ? '✅' : '❌';
          var eligibleText = data.eligible ? 'Eligible to Donate' : 'Not Eligible';
          return '<div class="header">🩸 Blood Donation</div>' +
            '<div class="big-number" style="color:' + eligibleColor + '">' + eligibleIcon + '</div>' +
            '<div class="label" style="background:' + eligibleColor + '33;color:' + eligibleColor + '">' + eligibleText + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Blood Volume</div><div class="stat-value">' + data.bloodVolume + ' L</div></div>' +
              '<div class="stat-box"><div class="stat-label">' + (data.eligible ? 'Recommended' : 'Max Safe') + '</div><div class="stat-value">' + (data.amount || data.maxSafeAmount) + ' ml</div></div>' +
            '</div>';
        }
        case 'blood_compatibility': {
          var donateTo = data.canDonateTo || [];
          var receiveFrom = data.canReceiveFrom || [];
          return '<div class="header">🩸 Blood Compatibility</div>' +
            '<div class="big-number" style="color:#ef4444;font-size:2.5rem">' + (data.fullBloodType || '') + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box" style="background:rgba(34,197,94,0.1)"><div class="stat-label" style="color:#22c55e">Can Donate To</div><div class="stat-value" style="font-size:0.8rem">' + (donateTo.join(', ') || 'None') + '</div></div>' +
              '<div class="stat-box" style="background:rgba(59,130,246,0.1)"><div class="stat-label" style="color:#3b82f6">Can Receive From</div><div class="stat-value" style="font-size:0.8rem">' + (receiveFrom.join(', ') || 'None') + '</div></div>' +
            '</div>';
        }
        case 'baby_blood': {
          var topTypes = (data.possibleTypes || []).slice(0, 4);
          return '<div class="header">👶 Baby Blood Type</div>' +
            '<div class="stats" style="grid-template-columns:repeat(' + Math.min(topTypes.length, 2) + ', 1fr)">' +
              topTypes.map(function(t) { return '<div class="stat-box"><div class="stat-value" style="font-size:1.5rem;color:#a78bfa">' + t.type + '</div><div class="stat-label">' + t.percentage + '%</div></div>'; }).join('') +
            '</div>';
        }
        case 'next_eclipse': {
          var eclipseIcon = data.type === 'solar'
            ? (data.subtype === 'total' ? '🌑' : data.subtype === 'annular' ? '🔆' : '🌘')
            : (data.subtype === 'total' ? '🌕' : data.subtype === 'penumbral' ? '🌖' : '🌗');
          var visibleBadge = data.visibleFromLocation === true
            ? '<div class="label" style="margin-top:0.25rem;color:#22c55e">✓ ' + (data.visibilityScore || 'Visible') + '</div>'
            : data.visibleFromLocation === false
              ? '<div class="label" style="margin-top:0.25rem;color:#ef4444">✗ Not visible from your location</div>'
              : '';
          return '<div class="header">' + eclipseIcon + ' Next ' + (data.subtype || '') + ' ' + (data.type || '') + ' Eclipse</div>' +
            '<div class="big-number" style="color:#a78bfa;font-size:1.5rem">' + (data.date || 'Unknown') + '</div>' +
            '<div class="stats">' +
              '<div class="stat-box"><div class="stat-label">Days Until</div><div class="stat-value">' + (data.daysUntil || '?') + '</div></div>' +
              '<div class="stat-box"><div class="stat-label">Peak Time</div><div class="stat-value">' + (data.peakTimeUTC || '?') + ' UTC</div></div>' +
            '</div>' +
            '<div class="label" style="margin-top:0.5rem">🌍 Best visible from: ' + (data.bestVisibleFrom || 'Unknown') + '</div>' +
            visibleBadge;
        }
        case 'eclipse_list': {
          var eclipses = (data.eclipses || []).slice(0, 3);
          return '<div class="header">🌓 Upcoming Eclipses</div>' +
            '<div class="label">' + (data.totalCount || 0) + ' eclipses found</div>' +
            '<div style="margin-top:0.5rem">' +
              eclipses.map(function(e) {
                var icon = e.type === 'solar' ? '☀️' : '🌙';
                var visIcon = e.visibleFromLocation === true ? '✓' : e.visibleFromLocation === false ? '✗' : '';
                var visColor = e.visibleFromLocation === true ? '#22c55e' : e.visibleFromLocation === false ? '#ef4444' : '';
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0;border-bottom:1px solid rgba(255,255,255,0.1)">' +
                  '<span>' + icon + ' ' + e.subtype + '</span>' +
                  '<span style="display:flex;align-items:center;gap:0.5rem">' +
                    (visIcon ? '<span style="color:' + visColor + '">' + visIcon + '</span>' : '') +
                    '<span style="color:rgba(255,255,255,0.6)">' + e.date + ' (' + e.daysUntil + 'd)</span>' +
                  '</span>' +
                '</div>';
              }).join('') +
            '</div>';
        }
        default: {
          // Check if we have meaningful data
          var entries = Object.entries(data).filter(function(e) { return e[0] !== 'message'; });
          var hasData = entries.length > 0 && !data.message;

          if (hasData) {
            return '<div class="header">🔧 Result</div>' +
              '<div class="stats" style="grid-template-columns:1fr">' +
                entries.slice(0, 6).map(function(e) {
                  var k = e[0], v = e[1];
                  return '<div class="stat-box"><div class="stat-label">' + k.replace(/([A-Z])/g, ' $1').trim() + '</div><div class="stat-value">' + (typeof v === 'object' ? JSON.stringify(v) : v) + '</div></div>';
                }).join('') +
              '</div>';
          } else {
            return '<div class="header">⏳ Awaiting Data</div>' +
              '<div style="text-align:center;padding:2rem 1rem;color:rgba(255,255,255,0.6)">' +
                '<div style="font-size:2.5rem;margin-bottom:0.5rem">🔄</div>' +
                '<div>Waiting for tool execution...</div>' +
              '</div>';
          }
        }
      }
    }
  </script>
</body>
</html>`;
}

// Main widget HTML generator - uses WIDGET_MODE to choose approach
function generateWidgetHtml(toolName: string, data: Record<string, unknown>): string {
  if (WIDGET_MODE === 'iframe') {
    return generateIframeWidgetHtml(toolName, data);
  }
  return generateInlineWidgetHtml(toolName, data);
}

// Format result as human-readable text
function formatResultText(toolName: string, result: unknown): string {
  const r = result as Record<string, unknown>;

  // Check if we have a formatter in the registry
  const formatter = textFormatters[toolName];
  if (formatter) {
    return formatter(r);
  }

  // Default: return JSON representation
  return JSON.stringify(result, null, 2);
}

// Generate placeholder template data for resources/read (before tool is called)
function getTemplateData(toolName: string): Record<string, unknown> {
  // First, check if we have template data in the registry
  const registryData = handlerTemplateData[toolName];
  if (registryData) {
    return registryData;
  }

  // Fall back to legacy defaults
  const defaults: Record<string, Record<string, unknown>> = {
    calculate_bmi: { bmi: 22.5, category: 'Normal', weight: 70, height: 175 },
    calculate_ideal_weight: { idealWeight: 68, formula: 'Devine', height: 175, gender: 'male' },
    calculate_bmr: { bmr: 1650, tdee: 2275, activityLevel: 'moderate' },
    generate_weight_loss_plan: { currentWeight: 80, targetWeight: 70, weeksToGoal: 20, dailyCalories: 1800, weeklyWeightLoss: 0.5, bmr: 1700, tdee: 2300 },
    calculate_savings_plan: { savingsMode: 'goal', monthlyTargetSavings: 500, monthsToGoal: 24, finalBalance: 12000, monthlyDisposable: 2000, savingsRate: 25, currency: 'USD', interestEnabled: false, totalInterestEarned: 0, targetDate: '2028-01-01', isAchievable: true },
    days_between_dates: { days: 30, weeks: 4, months: 1, startDate: '2026-01-01', endDate: '2026-01-31' },
    random_number: { result: 42, min: 1, max: 100 },
    pick_random: { result: 'Option A', options: ['Option A', 'Option B', 'Option C'] },
    calculate_tip: { billAmount: 50, tipPercent: 18, tipAmount: 9, total: 59, perPerson: 59, splitWays: 1 },
    calculate_percentage: { result: 25, operation: 'whatIsXPercentOfY', value1: 25, value2: 100, explanation: '25% of 100 = 25.00', resultIsPercent: false },
    calculate_age: { years: 30, months: 6, days: 15, totalDays: 11138, daysUntilNextBirthday: 180 },
    convert_units: { result: 2.2, value: 1, from: 'kg', to: 'lbs' },
    calculate_cycle: { nextPeriodStart: '2026-01-28', nextPeriodEnd: '2026-02-02', fertileWindowStart: '2026-01-10', fertileWindowEnd: '2026-01-16', ovulationDate: '2026-01-14', currentDay: 10, phase: 'follicular', daysUntilNextPeriod: 18, cycleLength: 28, periodLength: 5, mode: 'simplified', periodStartDate: '2025-12-23', phaseInfo: { name: 'Follicular Phase', emoji: '🌱', color: '#22c55e', description: 'Egg develops in ovary' } },
    calculate_countdown: { eventName: 'Summer Vacation', eventDate: '2026-04-16', days: 100, absoluteDays: 100, weeks: 14, months: 3, isPast: false, isToday: false, direction: 'until', summary: '100 days until Summer Vacation' },
    make_decision: { decision: 'Go for it! 🚀', mode: 'yesNo', confidence: 85, icon: '🚀' },
    zodiac_compatibility: {
      person1: { sign: 'aries', name: 'Aries', symbol: '♈', element: 'Fire' },
      person2: { sign: 'leo', name: 'Leo', symbol: '♌', element: 'Fire' },
      compatibility: 85, level: 'Excellent'
    },
    generate_names: { mode: 'names', results: ['Alex', 'Jordan', 'Taylor'], count: 3, nameCategory: 'human', humanNameType: 'first', gender: 'any' },
    calculate_position_size: { mode: 'riskAndSL', direction: 'long', entryPrice: 100, capital: 10000, calculatedField: 'quantity', riskPercent: 2, riskAmount: 200, stopLoss: 95, slDistance: 5, slDistancePercent: 5, quantity: 40, positionValue: 4000, riskLabel: 'Moderate Risk', riskColor: '#eab308' },
    spin_wheel: { result: 'Pizza', index: 0, totalOptions: 4, options: ['Pizza', 'Burger', 'Sushi', 'Tacos'], finalRotation: 2520, segmentAngle: 90 },
    zone_calculator: { sourceTime: '10:00', sourceTimezone: 'America/New_York', sourceCity: 'New York', conversions: [{ timezone: 'Europe/London', city: 'London', time: '15:00', offset: 0, offsetDiff: 5, dayChange: '' }] },
    lucky_number: { luckyNumber: 7, numbers: [7], min: 1, max: 100, count: 1, range: '1 - 100' },
    flip_tool: { flipMode: 'coin', result: 'heads', results: ['heads'], headsCount: 1, tailsCount: 0, count: 1 },
    vibe_quiz: { type: 'cat', percentage: 70, catScore: 7, dogScore: 3, title: 'Mostly Cat Person', description: "You lean towards independence but can be social when you want. You're selective about your inner circle.", emoji: '😺', color: '#8b5cf6', totalQuestions: 10 },
    sleep_calculator: { mode: 'sleepNow', ageGroup: 'adult', recommendation: { min: 7, max: 9, optimal: 8, cycleLength: 90, fallAsleep: 14 }, results: [{ time: '06:30', cycles: 6, hours: 9, quality: 'optimal', label: 'Optimal', emoji: '🌟', color: '#10b981' }, { time: '05:00', cycles: 5, hours: 7.5, quality: 'good', label: 'Good', emoji: '✅', color: '#22c55e' }], inputTime: null },
    calculate_iq_score: { testMode: 'quick', testInfo: { name: 'Quick Test', questionCount: 15, estimatedMinutes: 5, emoji: '⚡' }, iqScore: 115, category: 'High Average', emoji: '👍', color: '#84cc16', percentile: 84, correctAnswers: 12, totalQuestions: 15, accuracy: 80 },
    calculate_uniqueness: { uniquenessScore: 0.001, rarity: '1 in 100,000', traits: { eyeColor: 'green', hairColor: 'red' } },
    when_date_info: { date: '2026-06-15', dayOfWeek: 'Monday', daysFromToday: 164, zodiacSign: 'Gemini' },
    find_next_eclipse: { date: '2025-03-14', type: 'lunar', subtype: 'total', peakTimeUTC: '06:58', duration: '1h 05m', magnitude: 1.178, daysUntil: 70, bestVisibleFrom: 'Americas', visibleRegions: ['Americas', 'Europe', 'Africa', 'Pacific'], visibleFromLocation: null, visibilityScore: null, coordinates: { lat: -3, lon: -95 } },
    list_upcoming_eclipses: { eclipses: [{ date: '2025-03-14', type: 'lunar', subtype: 'total', peakTimeUTC: '06:58', duration: '1h 05m', magnitude: 1.178, daysUntil: 70, bestVisibleFrom: 'Americas', visibleFromLocation: null, visibilityScore: null }, { date: '2025-03-29', type: 'solar', subtype: 'partial', peakTimeUTC: '10:47', magnitude: 0.938, daysUntil: 85, bestVisibleFrom: 'Europe', visibleFromLocation: null, visibilityScore: null }], totalCount: 2 },
  };
  return defaults[toolName] || { message: 'Widget ready' };
}

// Context for MCP request handling
interface MCPContext {
  userId?: string;
  apiKeyId?: string;
  serverName: string;
  isAuthenticated: boolean;
  apiKey?: string;      // API key for REST calls
  authToken?: string;   // Bearer token for REST calls
  mcpSessionId?: string; // MCP session ID for A2A context continuity
}

// Handle MCP requests
async function handleMCPRequest(mcpRequest: MCPRequest, context: MCPContext): Promise<MCPResponse> {
  const { id, method, params } = mcpRequest;

  try {
    switch (method) {
      case 'initialize':
        // Track MCP connection initialization
        trackMCPEvent('mcp_initialize', {
          event_category: 'mcp',
          event_label: 'connection',
          protocol_version: '2024-11-05',
        });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: { subscribe: false, listChanged: false }
            },
            serverInfo: { name: 'tulzo-mcp', version: '1.0.0' },
          },
        };

      case 'resources/list': {
        // Return pre-computed list of widget template resources
        return { jsonrpc: '2.0', id, result: { resources: RESOURCES_LIST } };
      }

      case 'resources/read': {
        const uri = (params as { uri: string }).uri;
        // Parse tool name from URI: ui://widget/{toolName}.html
        const match = uri.match(/ui:\/\/widget\/([a-z_]+)\.html/);
        if (!match) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Invalid resource URI: ${uri}` } };
        }
        const toolName = match[1];
        const tool = TOOLS.find(t => t.name === toolName);
        if (!tool) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${toolName}` } };
        }

        // Generate placeholder data for each tool type
        const templateData = getTemplateData(toolName);
        const widgetHtml = generateWidgetHtml(toolName, templateData);

        return {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [{
              uri,
              mimeType: 'text/html',
              text: widgetHtml,
            }]
          }
        };
      }

      case 'tools/list': {
        // Build tools list - start with NATIVE tools, add REST tools if authenticated
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let toolsList: any[] = [...TOOLS];

        if (context.isAuthenticated && context.userId) {
          try {
            const serverTools = await getEnabledServerTools(context.userId, context.serverName);
            if (serverTools.length > 0) {
              // Separate NATIVE and REST tools
              const filteredNativeTools: typeof TOOLS = [];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const restTools: any[] = [];

              for (const st of serverTools) {
                if (st.tool.tool_type === 'NATIVE') {
                  const nativeTool = TOOLS.find(t => t.name === st.tool.name);
                  if (nativeTool) {
                    filteredNativeTools.push(nativeTool);
                  }
                } else if (st.tool.tool_type === 'REST') {
                  // Convert REST tool to MCP format - use stored annotations or fallback to defaults
                  // Defaults: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=true
                  const storedAnnotations = st.tool.annotations as { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean } | null;
                  // Infer from tool name if not stored (rest_env-server-METHOD-op format)
                  const toolNameLower = st.tool.name.toLowerCase();
                  const isGetMethod = toolNameLower.includes('-get-');
                  const isDestructiveMethod = toolNameLower.includes('-delete-') || toolNameLower.includes('-put-') || toolNameLower.includes('-patch-');
                  const restTool = {
                    name: st.tool.name,
                    description: st.tool.description,
                    inputSchema: st.tool.input_schema,
                    outputSchema: st.tool.output_schema,
                    annotations: {
                      readOnlyHint: storedAnnotations?.readOnlyHint ?? isGetMethod,
                      destructiveHint: storedAnnotations?.destructiveHint ?? isDestructiveMethod,
                      idempotentHint: storedAnnotations?.idempotentHint ?? true,
                      openWorldHint: storedAnnotations?.openWorldHint ?? true,
                    },
                    _meta: {
                      'openai/toolInvocation/invoking': st.tool.invoking_message || 'Calling API...',
                      'openai/toolInvocation/invoked': st.tool.invoked_message || 'API call complete',
                      'openai/widgetAccessible': st.tool.has_widget,
                      'openai/resultCanProduceWidget': st.tool.has_widget,
                      'openai/widgetPrefersBorder': true,
                    },
                  };
                  restTools.push(restTool);
                } else if (st.tool.tool_type === 'GQL') {
                  // Convert GraphQL tool to MCP format - use stored annotations or fallback to defaults
                  // Defaults: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=true
                  const storedAnnotations = st.tool.annotations as { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean } | null;
                  // Infer from tool name if not stored (gql_env-server-query/mutation-op format)
                  const toolNameLower = st.tool.name.toLowerCase();
                  const isQuery = toolNameLower.includes('-query-');
                  const isMutation = toolNameLower.includes('-mutation-');
                  const gqlTool = {
                    name: st.tool.name,
                    description: st.tool.description,
                    inputSchema: st.tool.input_schema,
                    outputSchema: st.tool.output_schema,
                    annotations: {
                      readOnlyHint: storedAnnotations?.readOnlyHint ?? isQuery,
                      destructiveHint: storedAnnotations?.destructiveHint ?? isMutation,
                      idempotentHint: storedAnnotations?.idempotentHint ?? true,
                      openWorldHint: storedAnnotations?.openWorldHint ?? true,
                    },
                    _meta: {
                      'openai/toolInvocation/invoking': st.tool.invoking_message || 'Executing GraphQL...',
                      'openai/toolInvocation/invoked': st.tool.invoked_message || 'GraphQL complete',
                      'openai/widgetAccessible': st.tool.has_widget,
                      'openai/resultCanProduceWidget': st.tool.has_widget,
                      'openai/widgetPrefersBorder': true,
                    },
                  };
                  restTools.push(gqlTool); // Add to same array as REST tools
                } else if (st.tool.tool_type === 'MCP') {
                  // Convert MCP proxy tool to MCP format - use stored annotations from source server
                  // For MCP, we trust the source server's annotations, fallback to safe defaults
                  const storedAnnotations = st.tool.annotations as { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean } | null;
                  const mcpTool = {
                    name: st.tool.name,
                    description: st.tool.description,
                    inputSchema: st.tool.input_schema,
                    outputSchema: st.tool.output_schema,
                    annotations: {
                      readOnlyHint: storedAnnotations?.readOnlyHint ?? true,
                      destructiveHint: storedAnnotations?.destructiveHint ?? false,
                      idempotentHint: storedAnnotations?.idempotentHint ?? true,
                      openWorldHint: storedAnnotations?.openWorldHint ?? true,
                    },
                    _meta: {
                      'openai/toolInvocation/invoking': st.tool.invoking_message || 'Calling MCP server...',
                      'openai/toolInvocation/invoked': st.tool.invoked_message || 'MCP call complete',
                      'openai/widgetAccessible': st.tool.has_widget,
                      'openai/resultCanProduceWidget': st.tool.has_widget,
                      'openai/widgetPrefersBorder': true,
                    },
                  };
                  restTools.push(mcpTool); // Add to same array as other external tools
                } else if (st.tool.tool_type === 'A2A') {
                  // Convert A2A agent tool to MCP format
                  // A2A agents use safe defaults: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=true
                  const a2aTool = {
                    name: st.tool.name,
                    description: st.tool.description,
                    inputSchema: st.tool.input_schema,
                    outputSchema: st.tool.output_schema,
                    annotations: {
                      readOnlyHint: true,
                      destructiveHint: false,
                      idempotentHint: true,
                      openWorldHint: true,
                    },
                    _meta: {
                      'openai/toolInvocation/invoking': st.tool.invoking_message || 'Calling A2A agent...',
                      'openai/toolInvocation/invoked': st.tool.invoked_message || 'Agent response received',
                      'openai/widgetAccessible': false, // A2A tools don't have widgets
                      'openai/resultCanProduceWidget': false,
                      'openai/widgetPrefersBorder': true,
                    },
                  };
                  restTools.push(a2aTool); // Add to same array as other external tools
                }
              }

              // If we have enabled tools, use them; otherwise fall back to defaults
              if (filteredNativeTools.length > 0 || restTools.length > 0) {
                toolsList = [...filteredNativeTools, ...restTools];
              }
            }
          } catch (error) {
            console.error('Error fetching server tools, using defaults:', error);
            // Fall back to all TOOLS
          }
        }

        // Track tools/list event
        trackMCPEvent('mcp_tools_list', {
          tool_count: toolsList.length,
          event_category: 'mcp',
          event_label: 'tools_list',
        });
        return { jsonrpc: '2.0', id, result: { tools: toolsList } };
      }
      case 'tools/call': {
        const toolName = (params as { name: string }).name;
        const toolArgs = (params as { arguments?: Record<string, unknown> }).arguments || {};

        // Validate tool access - prevent tool call spoofing
        // For non-NATIVE tools, verify the tool is enabled for this user's server
        const toolDef = getToolDefinition(toolName);
        if (!toolDef || toolDef.type !== TOOL_TYPES.NATIVE) {
          // Non-NATIVE tool - must validate ownership
          if (!context.isAuthenticated || !context.userId) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32001, message: 'Authentication required to call this tool' }
            };
          }

          const serverTool = await validateToolForServer(toolName, context.userId, context.serverName);
          if (!serverTool) {
            return {
              jsonrpc: '2.0',
              id,
              error: { code: -32002, message: `Tool '${toolName}' is not enabled for your server` }
            };
          }
        }

        // Execute tool (async to support REST tools)
        const execContext: ExtendedToolContext = {
          apiKey: context.apiKey,
          authToken: context.authToken,
          mcpSessionId: context.mcpSessionId, // Pass MCP session ID for A2A context
          userId: context.userId, // Pass user ID for OAuth token lookup
          serverName: context.serverName, // Pass server name for OAuth login URL
        };

        const { result, isRestTool, toolInfo } = await executeToolAsync(toolName, toolArgs, execContext);

        // Track tool call event
        trackMCPEvent('mcp_tool_call', {
          tool_name: toolName,
          event_category: 'mcp',
          event_label: toolName,
          has_args: Object.keys(toolArgs).length > 0,
          is_rest_tool: isRestTool,
        });

        // Prepare widget data with input args for context
        const widgetData: Record<string, unknown> = result as Record<string, unknown>;

        // Build response text - use generic formatter for REST tools
        const responseText = isRestTool
          ? formatRestResultText(toolName, result)
          : formatResultText(toolName, result);

        // Generate widget HTML - use generic widget for REST tools
        const widgetHtmlContent = isRestTool
          ? generateRestWidgetHtml(toolName, widgetData, toolInfo?.hasWidget ?? false)
          : generateWidgetHtml(toolName, widgetData);

        // Get invocation messages
        const invocationMessages = isRestTool && toolInfo
          ? { invoking: toolInfo.invokingMessage || 'Calling API...', invoked: toolInfo.invokedMessage || 'API call complete' }
          : getInvocationMessages(toolName);

        // Build OpenAI widget resource (EmbeddedResource style)
        const widgetResource = {
          type: 'resource',
          resource: {
            uri: `ui://widget/${toolName}.html`,
            mimeType: 'text/html',
            text: widgetHtmlContent,
            title: toolName.split('_').filter(w => w.length > 0).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          }
        };

        // Build _meta with OpenAI widget hints
        const meta = {
          'openai.com/widget': widgetResource,
          'openai/toolInvocation/invoking': invocationMessages.invoking,
          'openai/toolInvocation/invoked': invocationMessages.invoked,
          'openai/widgetAccessible': toolInfo?.hasWidget ?? true,
          'openai/resultCanProduceWidget': toolInfo?.hasWidget ?? true,
          'openai/widgetPrefersBorder': true,
        };

        // Build content array with text result
        const content: Array<{ type: string; text?: string; resource?: unknown }> = [
          { type: 'text', text: responseText },
        ];

        // Add widget HTML for Claude artifact rendering (if widget enabled)
        if (!isRestTool || toolInfo?.hasWidget) {
          const widgetHtml = `Here is a complete, production-ready visualization widget. This should be displayed as an interactive artifact:
\`\`\`html
${widgetHtmlContent}
\`\`\`
This component is fully functional and ready for immediate use.`;
          content.push({ type: 'text', text: widgetHtml });

          // Add embedded resource for OpenAI widget rendering
          content.push({
            type: 'resource',
            resource: widgetResource.resource
          });
        }

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content,
            // structuredContent with query args and result data
            structuredContent: {
              query: toolArgs,
              result: widgetData,
              display: {
                type: 'html',
                content: widgetHtmlContent,
              }
            },
            _meta: meta,
          }
        };
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    }
  } catch (error) {
    return { jsonrpc: '2.0', id, error: { code: -32000, message: String(error) } };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check for internal forwarded request (from path-based auth)
    const internalUserId = request.headers.get('X-User-Id');
    const internalPlan = request.headers.get('X-User-Plan');
    const internalAuthMethod = request.headers.get('X-Auth-Method') as AuthMethod | null;
    const internalApiKeyId = request.headers.get('X-Api-Key-Id');
    const internalServerName = request.headers.get('X-Server-Name') || 'default';

    if (internalUserId) {
      // Request forwarded from /api/mcp/[key] route - already authenticated
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      // Log connection asynchronously (don't await)
      logConnection(internalApiKeyId || undefined, internalServerName, internalAuthMethod || 'path', clientIp, userAgent);

      // Extract API key from path (forwarded in X-Original-Api-Key header)
      const originalApiKey = request.headers.get('X-Original-Api-Key');
      const authorizationHeader = request.headers.get('Authorization');
      const bearerToken = authorizationHeader?.startsWith('Bearer ') ? authorizationHeader.slice(7) : undefined;

      // Extract MCP session ID for A2A context continuity
      const mcpSessionId = request.headers.get('mcp-session-id') || undefined;

      const context: MCPContext = {
        userId: internalUserId,
        apiKeyId: internalApiKeyId || undefined,
        serverName: internalServerName,
        isAuthenticated: true,
        apiKey: originalApiKey || undefined,
        authToken: bearerToken,
        mcpSessionId,
      };
      const response = await handleMCPRequest(body as MCPRequest, context);
      return NextResponse.json(response);
    }

    // Check for header-based auth (x-api-key or Bearer token)
    const { apiKey, authMethod } = extractAuth(request);

    if (apiKey) {
      // Use different validation based on auth method
      // - 'header' (x-api-key or Bearer tlz_*): API key validation (assumes Pro if valid)
      // - 'oauth' (Bearer JWT): Session token validation (checks plan)
      const authResult = authMethod === 'oauth'
        ? await validateBearerToken(apiKey)
        : await validateApiKey(apiKey);

      if (!authResult.authenticated) {
        return NextResponse.json({
          jsonrpc: '2.0',
          id: (body as MCPRequest).id || null,
          error: {
            code: -32001,
            message: authResult.error || 'Authentication failed',
          }
        }, { status: 401 });
      }

      if (!authResult.isSubscribed) {
        return NextResponse.json({
          jsonrpc: '2.0',
          id: (body as MCPRequest).id || null,
          error: {
            code: -32003,
            message: 'MCP access is not allowed for free users. Upgrade at tulzo.vercel.app/pricing',
          }
        }, { status: 403 });
      }

      // Log connection
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] ||
                       request.headers.get('x-real-ip') ||
                       'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';
      logConnection(authResult.apiKeyId, authResult.serverName || 'default', authResult.authMethod, clientIp, userAgent);

      // Determine API key and auth token for REST calls
      const isApiKeyAuth = authMethod === 'header' && !apiKey.startsWith('ey'); // JWT tokens start with 'ey'
      const isBearerAuth = authMethod === 'oauth' || apiKey.startsWith('ey');

      // Extract MCP session ID for A2A context continuity
      const mcpSessionId = request.headers.get('mcp-session-id') || undefined;

      const context: MCPContext = {
        userId: authResult.userId,
        apiKeyId: authResult.apiKeyId,
        serverName: authResult.serverName || 'default',
        isAuthenticated: true,
        apiKey: isApiKeyAuth ? apiKey : undefined,
        authToken: isBearerAuth ? apiKey : undefined,
        mcpSessionId,
      };
      const response = await handleMCPRequest(body as MCPRequest, context);
      return NextResponse.json(response);
    }

    // No auth provided - return error for tools/call, allow discovery methods
    const method = (body as MCPRequest).method;
    if (method === 'tools/call') {
      return NextResponse.json({
        jsonrpc: '2.0',
        id: (body as MCPRequest).id || null,
        error: {
          code: -32001,
          message: 'Authentication required. Use x-api-key header or Bearer token.',
        }
      }, { status: 401 });
    }

    // Allow unauthenticated access to discovery methods
    const context: MCPContext = {
      serverName: 'default',
      isAuthenticated: false,
    };
    const response = await handleMCPRequest(body as MCPRequest, context);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;

  return NextResponse.json({
    name: 'Tulzo MCP Server',
    version: '1.0.0',
    description: 'Model Context Protocol server for Tulzo tools',
    authentication: {
      oauth: {
        supported: true,
        discovery: `${baseUrl}/.well-known/openid-configuration`,
      },
      header: {
        supported: true,
        header_name: 'x-api-key',
        alternative: 'Authorization: Bearer {api_key}',
      },
      path: {
        supported: true,
        endpoint: `${baseUrl}/api/mcp/{api_key}`,
      },
    },
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })),
  });
}

