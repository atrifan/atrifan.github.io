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
 * Get all tools linked to a server (api_key) with full tool details
 */
export async function getServerToolsWithDetails(
  apiKeyId: string
): Promise<ServerToolWithDetails[]> {
  const { data, error } = await supabase
    .from('server_tools')
    .select(`
      *,
      tool:tools(*),
      environment:environments(name, host)
    `)
    .eq('api_key_id', apiKeyId)
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
  apiKeyId: string
): Promise<ServerToolWithDetails[]> {
  const { data, error } = await supabase
    .from('server_tools')
    .select(`
      *,
      tool:tools(*),
      environment:environments(name, host)
    `)
    .eq('api_key_id', apiKeyId)
    .eq('is_enabled', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching enabled server tools:', error);
    throw error;
  }

  return (data || []) as unknown as ServerToolWithDetails[];
}

/**
 * Link a tool to a server
 */
export async function linkToolToServer(
  insert: ServerToolInsert
): Promise<ServerToolRow> {
  const { data, error } = await supabase
    .from('server_tools')
    .insert(insert as never)
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
  apiKeyId: string
): Promise<void> {
  // Get all native tools
  const nativeTools = await getNativeTools();

  // Insert all as enabled
  const inserts: ServerToolInsert[] = nativeTools.map(tool => ({
    api_key_id: apiKeyId,
    tool_id: tool.id,
    is_enabled: true,
  }));

  const { error } = await supabase
    .from('server_tools')
    .upsert(inserts as never[], { onConflict: 'api_key_id,tool_id' });

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
  apiKeyId: string,
  enabledToolIds: string[]
): Promise<void> {
  // First, disable all tools for this server
  const { error: disableError } = await supabase
    .from('server_tools')
    .update({ is_enabled: false, updated_at: new Date().toISOString() } as never)
    .eq('api_key_id', apiKeyId);

  if (disableError) {
    console.error('Error disabling server tools:', disableError);
    throw disableError;
  }

  // Then enable the selected ones
  if (enabledToolIds.length > 0) {
    const { error: enableError } = await supabase
      .from('server_tools')
      .update({ is_enabled: true, updated_at: new Date().toISOString() } as never)
      .eq('api_key_id', apiKeyId)
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
