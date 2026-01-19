/**
 * Supabase Service Functions
 *
 * CRUD operations for api_keys, tools, server_tools, and user_preferences tables.
 * All functions use the server-side Supabase client with service role access.
 */

import { supabase } from './supabase';
import type {
  ApiKeyRow,
  ApiKeyInsert,
  ApiKeyUpdate,
  ToolRow,
  ServerToolRow,
  ServerToolInsert,
  ServerToolUpdate,
  ServerToolWithDetails,
  UserPreferencesRow,
  UserPreferencesInsert,
  UserPreferencesUpdate,
  RestApiSpecRow,
  RestApiEndpointRow,
  RestApiEndpointWithTool,
} from '../types/supabase';
import crypto from 'crypto';

// ============ Utility Functions ============

/**
 * Hash an API key for secure storage/lookup
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Get the last 4 characters of an API key for display
 */
export function getApiKeySuffix(apiKey: string): string {
  return apiKey.slice(-4);
}

// ============ API Keys ============

/**
 * Get API key by user_id and server_name
 */
export async function getApiKeyByUserAndServer(
  userId: string,
  serverName: string = 'default'
): Promise<ApiKeyRow | null> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .eq('server_name', serverName)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching API key:', error);
    throw error;
  }

  return data;
}

/**
 * Get API key by hash (for validation)
 */
export async function getApiKeyByHash(apiKeyHash: string): Promise<ApiKeyRow | null> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('api_key_hash', apiKeyHash)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching API key by hash:', error);
    throw error;
  }

  return data;
}

/**
 * Get all API keys for a user
 */
export async function getApiKeysByUser(userId: string): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching API keys:', error);
    throw error;
  }

  return data || [];
}

/**
 * Create a new API key
 */
export async function createApiKey(
  insert: ApiKeyInsert
): Promise<ApiKeyRow> {
  const { data, error } = await supabase
    .from('api_keys')
    .insert(insert as never)
    .select()
    .single();

  if (error) {
    console.error('Error creating API key:', error);
    throw error;
  }

  return data as unknown as ApiKeyRow;
}

/**
 * Update an API key
 */
export async function updateApiKey(
  id: string,
  update: ApiKeyUpdate
): Promise<ApiKeyRow> {
  const { data, error } = await supabase
    .from('api_keys')
    .update(update as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating API key:', error);
    throw error;
  }

  return data as unknown as ApiKeyRow;
}

/**
 * Revoke (soft delete) an API key
 */
export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase
    .from('api_keys')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
    } as never)
    .eq('id', id);

  if (error) {
    console.error('Error revoking API key:', error);
    throw error;
  }
}

/**
 * Hard delete an API key (and cascade to server_tools)
 */
export async function deleteApiKey(id: string): Promise<void> {
  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting API key:', error);
    throw error;
  }
}

// ============ Tools ============

/**
 * Get all tools (system NATIVE + user-created)
 */
export async function getAllTools(userId?: string): Promise<ToolRow[]> {
  let query = supabase
    .from('tools')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  // Get system tools (user_id is null) and optionally user's custom tools
  if (userId) {
    query = query.or(`user_id.is.null,user_id.eq.${userId}`);
  } else {
    query = query.is('user_id', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching tools:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get all NATIVE tools (system tools only)
 */
export async function getNativeTools(): Promise<ToolRow[]> {
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('tool_type', 'NATIVE')
    .is('user_id', null)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching native tools:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get tool by name
 */
export async function getToolByName(name: string): Promise<ToolRow | null> {
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('name', name)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching tool:', error);
    throw error;
  }

  return data;
}

/**
 * Get RAG by tool name (rag_{env}-{name}-search pattern)
 */
export async function getRAGByToolName(toolName: string): Promise<{
  id: string;
  name: string;
  rag_name: string;
  source_type: 'csv' | 'url';
  embedding_model: string | null;
  embedding_dimensions: number;
  top_n: number;
  remote_url: string | null;
  http_method: string;
  params_location: string;
  request_content_type: string;
  field_mapping: Record<string, string> | null;
  user_id: string;
} | null> {
  // Parse tool name: rag_{env}-{name}-search
  const match = toolName.match(/^rag_([a-z0-9-]+)-(.+)-search$/);
  if (!match) return null;

  const [, envName, ragName] = match;

  const { data, error } = await supabase
    .from('user_rags')
    .select('id, name, rag_name, source_type, embedding_model, embedding_dimensions, top_n, remote_url, http_method, params_location, request_content_type, field_mapping, user_id')
    .eq('rag_name', ragName)
    .eq('environment_name', envName)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching RAG by tool name:', error);
    return null;
  }

  return data;
}

/**
 * Get tool by ID
 */
export async function getToolById(id: string): Promise<ToolRow | null> {
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching tool:', error);
    throw error;
  }

  return data;
}

// ============ Server Tools ============

/**
 * Get all tools linked to a server with full tool details
 */
export async function getServerToolsWithDetails(
  userId: string,
  serverName: string = 'default'
): Promise<ServerToolWithDetails[]> {
  const { data, error } = await supabase
    .from('server_tools')
    .select(`
      *,
      tool:tools(*),
      environment:environments(name, host)
    `)
    .eq('user_id', userId)
    .eq('server_name', serverName)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching server tools:', error);
    throw error;
  }

  return (data || []) as unknown as ServerToolWithDetails[];
}

/**
 * Get enabled tools for a server
 */
export async function getEnabledServerTools(
  userId: string,
  serverName: string = 'default'
): Promise<ServerToolWithDetails[]> {
  const { data, error } = await supabase
    .from('server_tools')
    .select(`
      *,
      tool:tools(*),
      environment:environments(name, host)
    `)
    .eq('user_id', userId)
    .eq('server_name', serverName)
    .eq('is_enabled', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching enabled server tools:', error);
    throw error;
  }

  return (data || []) as unknown as ServerToolWithDetails[];
}

/**
 * Link a tool to a server (uses upsert to handle existing links)
 */
export async function linkToolToServer(
  insert: ServerToolInsert
): Promise<ServerToolRow> {
  const { data, error } = await supabase
    .from('server_tools')
    .upsert(insert as never, {
      onConflict: 'user_id,server_name,tool_id',
      ignoreDuplicates: false
    })
    .select()
    .single();

  if (error) {
    console.error('Error linking tool to server:', error);
    throw error;
  }

  return data as unknown as ServerToolRow;
}

/**
 * Link all NATIVE tools to a server
 */
export async function linkAllNativeToolsToServer(
  userId: string,
  serverName: string = 'default'
): Promise<void> {
  // Get all native tools
  const nativeTools = await getNativeTools();

  // Insert all as enabled
  const inserts: ServerToolInsert[] = nativeTools.map(tool => ({
    user_id: userId,
    server_name: serverName,
    tool_id: tool.id,
    is_enabled: true,
  }));

  const { error } = await supabase
    .from('server_tools')
    .upsert(inserts as never[], { onConflict: 'user_id,server_name,tool_id' });

  if (error) {
    console.error('Error linking native tools to server:', error);
    throw error;
  }
}

/**
 * Update a server tool (enable/disable, config)
 */
export async function updateServerTool(
  id: string,
  update: ServerToolUpdate
): Promise<ServerToolRow> {
  const { data, error } = await supabase
    .from('server_tools')
    .update({ ...update, updated_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating server tool:', error);
    throw error;
  }

  return data as unknown as ServerToolRow;
}

/**
 * Bulk update server tools (enable/disable multiple)
 */
export async function bulkUpdateServerTools(
  userId: string,
  serverName: string,
  enabledToolIds: string[]
): Promise<void> {
  // First, disable all tools for this server
  const { error: disableError } = await supabase
    .from('server_tools')
    .update({ is_enabled: false, updated_at: new Date().toISOString() } as never)
    .eq('user_id', userId)
    .eq('server_name', serverName);

  if (disableError) {
    console.error('Error disabling server tools:', disableError);
    throw disableError;
  }

  // Then enable the selected ones
  if (enabledToolIds.length > 0) {
    const { error: enableError } = await supabase
      .from('server_tools')
      .update({ is_enabled: true, updated_at: new Date().toISOString() } as never)
      .eq('user_id', userId)
      .eq('server_name', serverName)
      .in('tool_id', enabledToolIds);

    if (enableError) {
      console.error('Error enabling server tools:', enableError);
      throw enableError;
    }
  }
}

/**
 * Remove a tool from a server
 */
export async function unlinkToolFromServer(id: string): Promise<void> {
  const { error } = await supabase
    .from('server_tools')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error unlinking tool from server:', error);
    throw error;
  }
}

// ============ User Preferences ============

/**
 * Get user preferences
 */
export async function getUserPreferences(
  userId: string
): Promise<UserPreferencesRow | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching user preferences:', error);
    throw error;
  }

  return data;
}

/**
 * Create or update user preferences
 */
export async function upsertUserPreferences(
  insert: UserPreferencesInsert
): Promise<UserPreferencesRow> {
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert(insert as never, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('Error upserting user preferences:', error);
    throw error;
  }

  return data as unknown as UserPreferencesRow;
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(
  userId: string,
  update: UserPreferencesUpdate
): Promise<UserPreferencesRow> {
  const { data, error } = await supabase
    .from('user_preferences')
    .update({ ...update, updated_at: new Date().toISOString() } as never)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating user preferences:', error);
    throw error;
  }

  return data as unknown as UserPreferencesRow;
}

// ============ MCP Connections ============

import type { McpConnectionRow, McpConnectionInsert } from '../types/supabase';

/**
 * Log or update an MCP connection
 * Uses upsert with composite key (api_key_id, server_name, agent, auth_method)
 */
export async function logMcpConnection(
  apiKeyId: string,
  serverName: string,
  agent: string,
  authMethod: 'oauth' | 'header' | 'path' | 'internal',
  clientIp: string
): Promise<void> {
  // First try to get existing connection
  const { data: existingData } = await supabase
    .from('mcp_connections')
    .select('id, ips, request_count')
    .eq('api_key_id', apiKeyId)
    .eq('server_name', serverName)
    .eq('agent', agent)
    .eq('auth_method', authMethod)
    .single();

  const existing = existingData as { id: string; ips: string[] | null; request_count: number | null } | null;

  if (existing) {
    // Update existing connection
    const ips: string[] = existing.ips || [];
    if (clientIp && clientIp !== 'unknown' && !ips.includes(clientIp)) {
      ips.unshift(clientIp);
      if (ips.length > 5) ips.pop();
    }

    await supabase
      .from('mcp_connections')
      .update({
        ips,
        last_used_at: new Date().toISOString(),
        request_count: (existing.request_count || 0) + 1,
      } as never)
      .eq('id', existing.id);
  } else {
    // Insert new connection
    const insert: McpConnectionInsert = {
      api_key_id: apiKeyId,
      server_name: serverName,
      agent,
      auth_method: authMethod,
      ips: clientIp && clientIp !== 'unknown' ? [clientIp] : [],
      request_count: 1,
    };

    await supabase
      .from('mcp_connections')
      .insert(insert as never);
  }
}

/**
 * Get MCP connections for an API key
 */
export async function getMcpConnections(apiKeyId: string): Promise<McpConnectionRow[]> {
  const { data, error } = await supabase
    .from('mcp_connections')
    .select('*')
    .eq('api_key_id', apiKeyId)
    .order('last_used_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching MCP connections:', error);
    throw error;
  }

  return (data || []) as unknown as McpConnectionRow[];
}

/**
 * Get all MCP connections for a user (across all their API keys)
 */
export async function getMcpConnectionsByUser(userId: string): Promise<McpConnectionRow[]> {
  const { data, error } = await supabase
    .from('mcp_connections')
    .select(`
      *,
      api_keys!inner(user_id)
    `)
    .eq('api_keys.user_id', userId)
    .order('last_used_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching user MCP connections:', error);
    throw error;
  }

  return (data || []) as unknown as McpConnectionRow[];
}

// ============ REST API Specs ============

/**
 * Get all REST API specs for a user
 */
export async function getRestApiSpecs(userId: string): Promise<RestApiSpecRow[]> {
  const { data, error } = await supabase
    .from('rest_api_specs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching REST API specs:', error);
    throw error;
  }

  return (data || []) as unknown as RestApiSpecRow[];
}

/**
 * Get REST API spec by ID with endpoints
 */
export async function getRestApiSpecWithEndpoints(
  specId: string
): Promise<{ spec: RestApiSpecRow; endpoints: RestApiEndpointWithTool[] } | null> {
  const { data: specData, error: specError } = await supabase
    .from('rest_api_specs')
    .select('*')
    .eq('id', specId)
    .single();

  if (specError) {
    if (specError.code === 'PGRST116') return null;
    console.error('Error fetching REST API spec:', specError);
    throw specError;
  }

  const { data: endpointsData, error: endpointsError } = await supabase
    .from('rest_api_endpoints')
    .select(`
      *,
      tool:tools(*)
    `)
    .eq('spec_id', specId)
    .order('path', { ascending: true });

  if (endpointsError) {
    console.error('Error fetching REST API endpoints:', endpointsError);
    throw endpointsError;
  }

  return {
    spec: specData as unknown as RestApiSpecRow,
    endpoints: (endpointsData || []) as unknown as RestApiEndpointWithTool[],
  };
}

/**
 * Get all REST tools for a user (tools with type REST)
 */
export async function getRestTools(userId: string): Promise<ToolRow[]> {
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('user_id', userId)
    .eq('tool_type', 'REST')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching REST tools:', error);
    throw error;
  }

  return (data || []) as unknown as ToolRow[];
}

/**
 * Delete a REST API spec and all associated endpoints/tools
 */
export async function deleteRestApiSpec(specId: string, userId: string): Promise<void> {
  // First get all tool IDs associated with this spec
  const { data: endpoints, error: endpointsError } = await supabase
    .from('rest_api_endpoints')
    .select('tool_id')
    .eq('spec_id', specId);

  if (endpointsError) {
    console.error('Error fetching endpoints for deletion:', endpointsError);
    throw endpointsError;
  }

  const toolIds = (endpoints as Array<{ tool_id: string }> | null)?.map(e => e.tool_id) || [];

  // Delete the spec (cascades to endpoints)
  const { error: specError } = await supabase
    .from('rest_api_specs')
    .delete()
    .eq('id', specId)
    .eq('user_id', userId);

  if (specError) {
    console.error('Error deleting REST API spec:', specError);
    throw specError;
  }

  // Delete the associated tools
  if (toolIds.length > 0) {
    const { error: toolsError } = await supabase
      .from('tools')
      .delete()
      .in('id', toolIds)
      .eq('user_id', userId);

    if (toolsError) {
      console.error('Error deleting REST tools:', toolsError);
      throw toolsError;
    }
  }
}

/**
 * Get REST API endpoint by tool ID
 */
export async function getRestEndpointByToolId(
  toolId: string
): Promise<RestApiEndpointRow | null> {
  const { data, error } = await supabase
    .from('rest_api_endpoints')
    .select('*')
    .eq('tool_id', toolId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching REST endpoint:', error);
    throw error;
  }

  return data as unknown as RestApiEndpointRow;
}

/**
 * Get REST API endpoint with full details (spec + environment) by tool ID
 * Used for executing REST API calls
 */
export async function getRestEndpointWithDetails(
  toolId: string,
  environmentId?: string
): Promise<{
  endpoint: RestApiEndpointRow;
  spec: RestApiSpecRow;
  environment: { id: string; name: string; host: string };
} | null> {
  // Get the endpoint
  const { data: endpointData, error: endpointError } = await supabase
    .from('rest_api_endpoints')
    .select('*')
    .eq('tool_id', toolId)
    .single();

  if (endpointError) {
    if (endpointError.code === 'PGRST116') return null;
    console.error('Error fetching REST endpoint:', endpointError);
    throw endpointError;
  }

  const endpoint = endpointData as unknown as RestApiEndpointRow;

  // Get the spec
  const { data: specData, error: specError } = await supabase
    .from('rest_api_specs')
    .select('*')
    .eq('id', endpoint.spec_id)
    .single();

  if (specError) {
    console.error('Error fetching REST spec:', specError);
    throw specError;
  }

  const spec = specData as unknown as RestApiSpecRow;

  // Get environment - either specified or first one for this user
  let envQuery = supabase
    .from('environments')
    .select('id, name, host')
    .eq('user_id', spec.user_id);

  if (environmentId) {
    envQuery = envQuery.eq('id', environmentId);
  }

  const { data: envData, error: envError } = await envQuery.limit(1).single();

  if (envError) {
    // If no environment found, use a default based on spec
    console.warn('No environment found, using spec defaults');
    return {
      endpoint,
      spec,
      environment: {
        id: 'default',
        name: 'default',
        host: 'https://api.example.com', // Will need to be configured
      },
    };
  }

  return {
    endpoint,
    spec,
    environment: envData as { id: string; name: string; host: string },
  };
}

// ============ GraphQL Operations ============

/**
 * Get GraphQL operation with spec and environment details for execution
 */
export async function getGraphQLOperationWithDetails(
  toolId: string,
  environmentId?: string
): Promise<{
  operation: {
    id: string;
    operation_name: string;
    operation_type: string;
    operation_string: string;
    arguments: unknown[];
    return_type: string | null;
    return_type_kind: string | null;
    description: string | null;
  };
  spec: {
    id: string;
    user_id: string;
    server_name: string;
    default_headers: Record<string, string>;
    auth_type: string;
    auth_config: Record<string, unknown>;
  };
  environment: { id: string; name: string; host: string };
} | null> {
  // Get operation by tool_id
  const { data: operation, error: opError } = await supabase
    .from('graphql_operations')
    .select('id, spec_id, operation_name, operation_type, operation_string, arguments, return_type, return_type_kind, description')
    .eq('tool_id', toolId)
    .single();

  if (opError || !operation) {
    console.error('GraphQL operation not found for tool:', toolId, opError);
    return null;
  }

  // Get spec
  const { data: spec, error: specError } = await supabase
    .from('graphql_specs')
    .select('id, user_id, server_name, source_url, default_headers, auth_type, auth_config')
    .eq('id', (operation as { spec_id: string }).spec_id)
    .single();

  if (specError || !spec) {
    console.error('GraphQL spec not found:', specError);
    return null;
  }

  // Get environment - either specified or from graphql_environments link
  let envHost: string;
  let envId: string;
  let envName: string;

  if (environmentId) {
    const { data: env } = await supabase
      .from('environments')
      .select('id, name, host')
      .eq('id', environmentId)
      .single();

    if (env) {
      envId = (env as { id: string }).id;
      envName = (env as { name: string }).name;
      envHost = (env as { host: string }).host;
    } else {
      // Fall back to source URL
      envId = 'default';
      envName = 'default';
      envHost = (spec as { source_url: string }).source_url;
    }
  } else {
    // Try to get first linked environment
    const { data: envLink } = await supabase
      .from('graphql_environments')
      .select('environment_id')
      .eq('spec_id', (operation as { spec_id: string }).spec_id)
      .limit(1)
      .single();

    if (envLink) {
      const { data: env } = await supabase
        .from('environments')
        .select('id, name, host')
        .eq('id', (envLink as { environment_id: string }).environment_id)
        .single();

      if (env) {
        envId = (env as { id: string }).id;
        envName = (env as { name: string }).name;
        envHost = (env as { host: string }).host;
      } else {
        envId = 'default';
        envName = 'default';
        envHost = (spec as { source_url: string }).source_url;
      }
    } else {
      // Use source URL as default
      envId = 'default';
      envName = 'default';
      envHost = (spec as { source_url: string }).source_url;
    }
  }

  return {
    operation: operation as {
      id: string;
      operation_name: string;
      operation_type: string;
      operation_string: string;
      arguments: unknown[];
      return_type: string | null;
      return_type_kind: string | null;
      description: string | null;
    },
    spec: spec as {
      id: string;
      user_id: string;
      server_name: string;
      default_headers: Record<string, string>;
      auth_type: string;
      auth_config: Record<string, unknown>;
    },
    environment: { id: envId, name: envName, host: envHost },
  };
}

// ============ MCP Server Tools ============

/**
 * Get MCP server tool details for execution (proxy pass)
 */
export async function getMCPServerToolDetails(
  toolId: string
): Promise<{
  serverTool: {
    id: string;
    original_name: string;
    original_description: string | null;
    has_widget: boolean;
    is_enabled: boolean;
  };
  server: {
    id: string;
    server_name: string;
    display_name: string;
    source_url: string;
    environment_name: string;
    auth_type: string;
    auth_config: Record<string, unknown>;
    default_headers: Record<string, string>;
    category: string;
  };
} | null> {
  // Get the MCP server tool link
  const { data: serverTool, error: toolError } = await supabase
    .from('mcp_server_tools')
    .select(`
      id,
      original_name,
      original_description,
      has_widget,
      is_enabled,
      mcp_server_id
    `)
    .eq('tool_id', toolId)
    .single();

  if (toolError || !serverTool) {
    console.error('Error fetching MCP server tool:', toolError);
    return null;
  }

  // Cast serverTool to access mcp_server_id
  const serverToolData = serverTool as {
    id: string;
    original_name: string;
    original_description: string | null;
    has_widget: boolean;
    is_enabled: boolean;
    mcp_server_id: string;
  };

  // Get the MCP server details
  const { data: server, error: serverError } = await supabase
    .from('mcp_servers')
    .select(`
      id,
      server_name,
      display_name,
      source_url,
      environment_name,
      auth_type,
      auth_config,
      default_headers,
      category
    `)
    .eq('id', serverToolData.mcp_server_id)
    .single();

  if (serverError || !server) {
    console.error('Error fetching MCP server:', serverError);
    return null;
  }

  return {
    serverTool: serverToolData,
    server: server as {
      id: string;
      server_name: string;
      display_name: string;
      source_url: string;
      environment_name: string;
      auth_type: string;
      auth_config: Record<string, unknown>;
      default_headers: Record<string, string>;
      category: string;
    },
  };
}

// ============ A2A Agents ============

/**
 * A2A Agent row type
 */
export interface A2AAgentRow {
  id: string;
  user_id: string;
  agent_name: string;
  display_name: string;
  agent_url: string;
  import_url: string | null;
  environment_name: string;
  agent_card: Record<string, unknown>;
  version: string | null;
  protocol_version: string | null;
  description: string | null;
  icon_url: string | null;
  tags: string[];
  category: string;
  auth_type: 'none' | 'api_key' | 'bearer' | 'basic';
  auth_config: Record<string, unknown>;
  default_headers: Record<string, string>;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  has_widget: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Get A2A agent by tool name
 * Tool names follow the pattern: a2a_{env}-{agent_name}
 */
export async function getA2AAgentByToolName(toolName: string): Promise<A2AAgentRow | null> {
  // Parse tool name: a2a_{env}-{agent_name}
  const match = toolName.match(/^a2a_([^-]+)-(.+)$/);
  if (!match) {
    return null;
  }

  const [, envName, agentName] = match;

  const { data, error } = await supabase
    .from('a2a_agents')
    .select('*')
    .eq('agent_name', agentName)
    .eq('environment_name', envName)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching A2A agent:', error);
    throw error;
  }

  return data as unknown as A2AAgentRow;
}

