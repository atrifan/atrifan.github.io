/**
 * OAuth Token Manager
 *
 * Handles OAuth token storage, retrieval, refresh, and expiry checking.
 * Used server-side to manage tokens for tool calls.
 *
 * Supports token sharing across connectors that use the same OAuth provider
 * (identified by token_endpoint + client_id hash).
 */

import { supabase } from './supabase';
import type { OAuthTokenRow, OAuthTokenInsert, OAuthTokenUpdate, OAuthServerType, OAuth2AuthConfig } from '../types/supabase';

// Buffer time before expiry to trigger refresh (5 minutes)
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export interface OAuthTokenResult {
  success: boolean;
  accessToken?: string;
  tokenType?: string;
  error?: string;
  needsReauth?: boolean; // True if user needs to re-authenticate
}

export interface ServerReference {
  type: OAuthServerType;
  id: string;
}

/**
 * Get the column name for a server type
 */
function getServerColumn(type: OAuthServerType): string {
  switch (type) {
    case 'rest_api': return 'rest_api_spec_id';
    case 'graphql': return 'graphql_spec_id';
    case 'mcp': return 'mcp_server_id';
    case 'a2a': return 'a2a_agent_id';
    case 'rag': return 'rag_id';
  }
}

/**
 * Generate a hash to identify an OAuth provider
 * Based on token_endpoint + client_id (the unique identifier for an OAuth app)
 */
export function generateOAuthProviderHash(oauthConfig: OAuth2AuthConfig): string {
  const identifier = `${oauthConfig.token_endpoint}|${oauthConfig.client_id}`;
  // Simple hash - in production you might want a proper hash function
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `oauth_${Math.abs(hash).toString(36)}`;
}

/**
 * Get stored OAuth token by provider hash (for token sharing)
 */
export async function getOAuthTokenByProvider(
  userId: string,
  providerHash: string
): Promise<OAuthTokenRow | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('oauth_tokens' as never)
    .select('*')
    .eq('user_id', userId)
    .eq('oauth_provider_hash', providerHash)
    .single();

  if (error || !data) return null;
  return data as OAuthTokenRow;
}

/**
 * Get stored OAuth token for a server connection
 */
export async function getOAuthToken(
  userId: string,
  server: ServerReference
): Promise<OAuthTokenRow | null> {
  if (!supabase) return null;

  const column = getServerColumn(server.type);

  const { data, error } = await supabase
    .from('oauth_tokens' as never)
    .select('*')
    .eq('user_id', userId)
    .eq(column, server.id)
    .single();

  if (error || !data) return null;
  return data as OAuthTokenRow;
}

/**
 * Check if an access token is expired or about to expire
 */
export function isTokenExpired(token: OAuthTokenRow): boolean {
  if (!token.access_token_expires_at) {
    // No expiry set - assume valid
    return false;
  }
  
  const expiresAt = new Date(token.access_token_expires_at).getTime();
  const now = Date.now();
  
  // Consider expired if within buffer time
  return now >= (expiresAt - EXPIRY_BUFFER_MS);
}

/**
 * Check if a refresh token is expired
 */
export function isRefreshTokenExpired(token: OAuthTokenRow): boolean {
  if (!token.refresh_token) return true;
  if (!token.refresh_token_expires_at) return false; // No expiry = valid
  
  const expiresAt = new Date(token.refresh_token_expires_at).getTime();
  return Date.now() >= expiresAt;
}

/**
 * Attempt to refresh an OAuth token
 */
export async function refreshOAuthToken(
  token: OAuthTokenRow,
  oauthConfig: OAuth2AuthConfig
): Promise<OAuthTokenResult> {
  if (!token.refresh_token) {
    return { success: false, error: 'No refresh token available', needsReauth: true };
  }

  if (isRefreshTokenExpired(token)) {
    return { success: false, error: 'Refresh token expired', needsReauth: true };
  }

  try {
    const tokenParams = new URLSearchParams();
    tokenParams.set('grant_type', 'refresh_token');
    tokenParams.set('refresh_token', token.refresh_token);
    tokenParams.set('client_id', oauthConfig.client_id);
    if (oauthConfig.client_secret) {
      tokenParams.set('client_secret', oauthConfig.client_secret);
    }

    const response = await fetch(oauthConfig.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: tokenParams.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // If refresh fails with invalid_grant, user needs to re-authenticate
      if (errorData.error === 'invalid_grant') {
        return { success: false, error: 'Refresh token invalid', needsReauth: true };
      }
      return { success: false, error: errorData.error_description || 'Token refresh failed', needsReauth: true };
    }

    const tokenData = await response.json();
    
    // Calculate expiry
    let accessTokenExpiresAt: string | null = null;
    if (tokenData.expires_in) {
      accessTokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    }

    // Update stored token
    if (supabase) {
      const update: OAuthTokenUpdate = {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || 'Bearer',
        access_token_expires_at: accessTokenExpiresAt,
      };

      // Update refresh token if a new one was provided
      if (tokenData.refresh_token) {
        update.refresh_token = tokenData.refresh_token;
      }

      if (tokenData.scope) {
        update.scope = tokenData.scope;
      }

      await supabase
        .from('oauth_tokens' as never)
        .update(update as never)
        .eq('id', token.id);
    }

    return {
      success: true,
      accessToken: tokenData.access_token,
      tokenType: tokenData.token_type || 'Bearer',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token refresh failed',
      needsReauth: true,
    };
  }
}

/**
 * Get a valid OAuth token for a server, refreshing if needed
 * This is the main entry point for tool execution
 *
 * Token lookup order:
 * 1. Check for token specific to this server
 * 2. Check for shared token by OAuth provider hash (token_endpoint + client_id)
 */
export async function getValidOAuthToken(
  userId: string,
  server: ServerReference,
  oauthConfig: OAuth2AuthConfig
): Promise<OAuthTokenResult> {
  // First, try to get token specific to this server
  let token = await getOAuthToken(userId, server);

  // If no server-specific token, try to find a shared token by provider hash
  if (!token && oauthConfig.token_endpoint && oauthConfig.client_id) {
    const providerHash = generateOAuthProviderHash(oauthConfig);
    token = await getOAuthTokenByProvider(userId, providerHash);

    if (token) {
      console.log(`[OAuth] Found shared token for provider ${providerHash}`);
    }
  }

  if (!token) {
    return { success: false, error: 'No OAuth token stored', needsReauth: true };
  }

  // Check if token is still valid
  if (!isTokenExpired(token)) {
    return {
      success: true,
      accessToken: token.access_token,
      tokenType: token.token_type,
    };
  }

  // Token expired - try to refresh
  return refreshOAuthToken(token, oauthConfig);
}

/**
 * Store a new OAuth token after successful authentication
 *
 * Stores token with both server reference AND provider hash for sharing.
 * If oauthConfig is provided, also stores/updates a shared token by provider hash.
 */
// Helper to check if a string is a valid UUID
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function storeOAuthToken(
  userId: string,
  server: ServerReference,
  tokenData: {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
  },
  oauthConfig?: OAuth2AuthConfig
): Promise<boolean> {
  if (!supabase) return false;

  const column = getServerColumn(server.type);

  // Check if server ID is a valid UUID (temp IDs like 'temp_xxx' are not)
  const isValidServerId = isValidUUID(server.id);

  // Calculate expiry timestamps
  let accessTokenExpiresAt: string | null = null;
  if (tokenData.expires_in) {
    accessTokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  }

  // Try to decode refresh token expiry from JWT if it's a JWT
  let refreshTokenExpiresAt: string | null = null;
  if (tokenData.refresh_token) {
    try {
      const payload = decodeJwtPayload(tokenData.refresh_token);
      if (payload?.exp && typeof payload.exp === 'number') {
        refreshTokenExpiresAt = new Date(payload.exp * 1000).toISOString();
      }
    } catch {
      // Not a JWT or invalid - that's fine
    }
  }

  // Only store server-specific token if we have a valid UUID
  // Temp IDs (used during import before agent is created) will only use provider hash
  let serverTokenStored = false;
  if (isValidServerId) {
    const tokenRecord: OAuthTokenInsert = {
      user_id: userId,
        [column]: server.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope || null,
        access_token_expires_at: accessTokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        id_token: tokenData.id_token || null,
      };

      // Check if token already exists for this user/server
      const { data: existingToken } = await supabase
        .from('oauth_tokens' as never)
        .select('id')
        .eq('user_id', userId)
        .eq(column, server.id)
        .single();

      let error;
      if (existingToken) {
        // Update existing token
        const updateData: OAuthTokenUpdate = {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || null,
          token_type: tokenData.token_type || 'Bearer',
          scope: tokenData.scope || null,
          access_token_expires_at: accessTokenExpiresAt,
          refresh_token_expires_at: refreshTokenExpiresAt,
          id_token: tokenData.id_token || null,
        };
        const result = await supabase
          .from('oauth_tokens' as never)
          .update(updateData as never)
          .eq('id', (existingToken as { id: string }).id);
        error = result.error;
      } else {
        // Insert new token
        const result = await supabase
          .from('oauth_tokens' as never)
          .insert(tokenRecord as never);
        error = result.error;
      }

      if (error) {
        console.error('[OAuth] Failed to store server-specific token:', error);
        // Don't return false - try provider hash storage as fallback
      } else {
        serverTokenStored = true;
      }
  } else {
    console.log('[OAuth] Skipping server-specific token storage (temp ID):', server.id);
  }

  // Also store/update shared token by provider hash for token sharing
  if (oauthConfig?.token_endpoint && oauthConfig?.client_id) {
    const providerHash = generateOAuthProviderHash(oauthConfig);

    // Check if shared token already exists
    const { data: existingSharedToken } = await supabase
      .from('oauth_tokens' as never)
      .select('id')
      .eq('user_id', userId)
      .eq('oauth_provider_hash', providerHash)
      .single();

    let sharedError;
    if (existingSharedToken) {
      // Update existing shared token
      const updateData: OAuthTokenUpdate = {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope || null,
        access_token_expires_at: accessTokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        id_token: tokenData.id_token || null,
      };
      const result = await supabase
        .from('oauth_tokens' as never)
        .update(updateData as never)
        .eq('id', (existingSharedToken as { id: string }).id);
      sharedError = result.error;
    } else {
      // Insert new shared token
      const sharedTokenRecord: OAuthTokenInsert = {
        user_id: userId,
        oauth_provider_hash: providerHash,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_type: tokenData.token_type || 'Bearer',
        scope: tokenData.scope || null,
        access_token_expires_at: accessTokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
        id_token: tokenData.id_token || null,
      };
      const result = await supabase
        .from('oauth_tokens' as never)
        .insert(sharedTokenRecord as never);
      sharedError = result.error;
    }

    if (sharedError) {
      console.error('[OAuth] Failed to store shared provider token:', sharedError);
      // Don't fail - server-specific token was stored successfully
    } else {
      console.log(`[OAuth] Stored shared token for provider ${providerHash}`);
    }
  }

  return true;
}

/**
 * Delete stored OAuth token (for logout/revoke)
 */
export async function deleteOAuthToken(
  userId: string,
  server: ServerReference
): Promise<boolean> {
  if (!supabase) return false;

  const column = getServerColumn(server.type);

  const { error } = await supabase
    .from('oauth_tokens' as never)
    .delete()
    .eq('user_id', userId)
    .eq(column, server.id);

  return !error;
}

/**
 * Decode JWT payload without verification (for reading expiry)
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Parse expiry from access token if it's a JWT
 */
export function parseTokenExpiry(accessToken: string): Date | null {
  const payload = decodeJwtPayload(accessToken);
  if (payload?.exp && typeof payload.exp === 'number') {
    return new Date(payload.exp * 1000);
  }
  return null;
}

