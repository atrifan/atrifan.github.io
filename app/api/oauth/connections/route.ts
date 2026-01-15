/**
 * OAuth Connections API
 *
 * GET - List all OAuth connections with linked imports and all tokens
 * DELETE - Delete token(s) - single token or all tokens for a provider
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { generateOAuthProviderHash } from '@/src/lib/oauth-token-manager';
import type { OAuth2AuthConfig } from '@/src/types/supabase';

// Individual token info
export interface OAuthTokenInfo {
  id: string;
  isShared: boolean; // true if oauth_provider_hash token, false if server-specific
  linkedServerId?: string; // The server ID if server-specific
  linkedServerType?: 'rest_api' | 'graphql' | 'mcp' | 'a2a' | 'rag';
  hasRefreshToken: boolean;
  accessTokenExpiresAt: string | null;
  isExpired: boolean;
  createdAt: string;
  updatedAt: string;
}

// OAuth connection with linked imports and all tokens
export interface OAuthConnection {
  providerHash: string;
  oauthConfig: OAuth2AuthConfig;
  tokens: OAuthTokenInfo[];
  linkedImports: {
    type: 'rest_api' | 'graphql' | 'mcp' | 'a2a' | 'rag';
    id: string;
    name: string;
  }[];
}

// Helper to get OAuth config from auth_config
function getOAuthConfig(authConfig: Record<string, unknown> | null): OAuth2AuthConfig | null {
  if (!authConfig) return null;
  return {
    authorization_endpoint: (authConfig.authorization_endpoint as string) || '',
    token_endpoint: (authConfig.token_endpoint as string) || '',
    scopes: (authConfig.scopes as string) || '',
    use_dcr: (authConfig.use_dcr as boolean) || false,
    client_id: (authConfig.client_id as string) || '',
    client_secret: (authConfig.client_secret as string) || '',
    registration_endpoint: (authConfig.registration_endpoint as string) || '',
  };
}

// Check if token is expired
function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Get ALL OAuth tokens for this user (both shared and server-specific)
    const { data: allTokens, error } = await supabase
      .from('oauth_tokens' as 'rest_api_specs')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }) as { data: Array<{
        id: string;
        oauth_provider_hash: string | null;
        rest_api_spec_id: string | null;
        graphql_spec_id: string | null;
        mcp_server_id: string | null;
        a2a_agent_id: string | null;
        rag_id: string | null;
        refresh_token: string | null;
        access_token_expires_at: string | null;
        created_at: string;
        updated_at: string;
        [key: string]: unknown;
      }> | null; error: unknown }; // Most recent first

    if (error) {
      console.error('[OAuth Connections] Failed to fetch tokens:', error);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    // Build a map of provider hash to connection
    const connectionMap = new Map<string, OAuthConnection>();

    // First, find all OAuth2 imports to build provider hash -> config mapping
    const importTypes = [
      { table: 'rest_api_specs', type: 'rest_api' as const, nameField: 'api_title', idField: 'rest_api_spec_id' },
      { table: 'graphql_specs', type: 'graphql' as const, nameField: 'api_title', idField: 'graphql_spec_id' },
      { table: 'mcp_servers', type: 'mcp' as const, nameField: 'display_name', idField: 'mcp_server_id' },
      { table: 'a2a_agents', type: 'a2a' as const, nameField: 'display_name', idField: 'a2a_agent_id' },
      { table: 'user_rags', type: 'rag' as const, nameField: 'name', idField: 'rag_id' },
    ];

    // Map of server ID to import info
    const serverImportMap = new Map<string, { type: 'rest_api' | 'graphql' | 'mcp' | 'a2a' | 'rag'; name: string; config: OAuth2AuthConfig }>();

    for (const { table, type, nameField } of importTypes) {
      const { data: imports } = await supabase
        .from(table as 'rest_api_specs')
        .select(`id, ${nameField}, auth_type, auth_config`)
        .eq('user_id', userId)
        .eq('auth_type', 'oauth2');

      for (const imp of (imports || []) as Array<{ id: string; auth_type: string; auth_config: Record<string, unknown> | null; [key: string]: unknown }>) {
        const config = getOAuthConfig(imp.auth_config);
        if (!config || !config.token_endpoint || !config.client_id) continue;

        const providerHash = generateOAuthProviderHash(config);
        serverImportMap.set(imp.id, { type, name: (imp[nameField] as string) || 'Unknown', config });

        // Initialize connection if not exists
        if (!connectionMap.has(providerHash)) {
          connectionMap.set(providerHash, {
            providerHash,
            oauthConfig: config,
            tokens: [],
            linkedImports: [],
          });
        }

        // Add linked import
        const connection = connectionMap.get(providerHash)!;
        if (!connection.linkedImports.find(li => li.id === imp.id)) {
          connection.linkedImports.push({ type, id: imp.id, name: (imp[nameField] as string) || 'Unknown' });
        }
      }
    }

    // Now process all tokens and add them to connections
    for (const token of allTokens || []) {
      let providerHash = token.oauth_provider_hash;
      let linkedServerType: 'rest_api' | 'graphql' | 'mcp' | 'a2a' | 'rag' | undefined;
      let linkedServerId: string | undefined;

      // For server-specific tokens, find the provider hash from the linked import
      if (!providerHash) {
        for (const { idField, type } of importTypes) {
          const serverId = token[idField] as string | null;
          if (serverId) {
            linkedServerId = serverId;
            linkedServerType = type;
            const importInfo = serverImportMap.get(serverId);
            if (importInfo) {
              providerHash = generateOAuthProviderHash(importInfo.config);
            }
            break;
          }
        }
      }

      if (!providerHash) continue; // Skip orphaned tokens

      // Ensure connection exists
      if (!connectionMap.has(providerHash)) {
        // This is a token without a matching import - skip it
        continue;
      }

      const connection = connectionMap.get(providerHash)!;
      connection.tokens.push({
        id: token.id,
        isShared: !!token.oauth_provider_hash,
        linkedServerId,
        linkedServerType,
        hasRefreshToken: !!token.refresh_token,
        accessTokenExpiresAt: token.access_token_expires_at,
        isExpired: isTokenExpired(token.access_token_expires_at),
        createdAt: token.created_at,
        updatedAt: token.updated_at,
      });
    }

    // Filter out connections with no tokens
    const connections = Array.from(connectionMap.values()).filter(c => c.tokens.length > 0);

    return NextResponse.json({ connections });
  } catch (error) {
    console.error('[OAuth Connections] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


/**
 * DELETE - Revoke token(s)
 * Query params:
 *   - id: single token ID to delete
 *   - providerHash: delete ALL tokens for this provider (used with deleteAll=true)
 *   - deleteAll: if true, delete all tokens for the provider
 */
export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('id');
    const providerHash = searchParams.get('providerHash');
    const deleteAll = searchParams.get('deleteAll') === 'true';

    if (deleteAll && providerHash) {
      // Delete all tokens for this provider - both shared AND server-specific
      let totalDeleted = 0;

      // 1. Delete shared tokens with this provider hash
      const { data: sharedTokens } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('user_id', userId)
        .eq('oauth_provider_hash', providerHash);

      const { error: deleteSharedError } = await supabase
        .from('oauth_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('oauth_provider_hash', providerHash);

      if (deleteSharedError) {
        console.error('[OAuth Connections] Failed to delete shared tokens:', deleteSharedError);
      } else {
        totalDeleted += sharedTokens?.length || 0;
      }

      // 2. Find and delete server-specific tokens by looking up imports with matching config
      const importTypes = [
        { table: 'rest_api_specs', tokenColumn: 'rest_api_spec_id' },
        { table: 'graphql_specs', tokenColumn: 'graphql_spec_id' },
        { table: 'mcp_servers', tokenColumn: 'mcp_server_id' },
        { table: 'a2a_agents', tokenColumn: 'a2a_agent_id' },
        { table: 'user_rags', tokenColumn: 'rag_id' },
      ];

      for (const { table, tokenColumn } of importTypes) {
        // Get all OAuth2 imports for this user
        const { data: imports } = await supabase
          .from(table as 'rest_api_specs')
          .select('id, auth_config')
          .eq('user_id', userId)
          .eq('auth_type', 'oauth2') as { data: Array<{ id: string; auth_config: Record<string, unknown> | null }> | null; error: unknown };

        for (const imp of imports || []) {
          if (!imp.auth_config?.token_endpoint || !imp.auth_config?.client_id) continue;

          const impProviderHash = generateOAuthProviderHash({
            token_endpoint: imp.auth_config.token_endpoint as string,
            client_id: imp.auth_config.client_id as string,
            authorization_endpoint: (imp.auth_config.authorization_endpoint as string) || '',
            scopes: (imp.auth_config.scopes as string) || '',
            use_dcr: false,
            client_secret: '',
            registration_endpoint: '',
          });

          if (impProviderHash === providerHash) {
            // Delete server-specific token for this import
            const { data: deletedTokens } = await supabase
              .from('oauth_tokens')
              .delete()
              .eq('user_id', userId)
              .eq(tokenColumn, imp.id)
              .select('id');

            totalDeleted += deletedTokens?.length || 0;
          }
        }
      }

      return NextResponse.json({ success: true, deletedCount: totalDeleted });
    }

    if (!tokenId) {
      return NextResponse.json({ error: 'Token ID or providerHash required' }, { status: 400 });
    }

    // Verify the token belongs to this user and get its details
    const { data: token, error: fetchError } = await supabase
      .from('oauth_tokens' as 'rest_api_specs')
      .select('id, oauth_provider_hash, rest_api_spec_id, graphql_spec_id, mcp_server_id, a2a_agent_id, rag_id')
      .eq('id', tokenId)
      .eq('user_id', userId)
      .single() as { data: {
        id: string;
        oauth_provider_hash: string | null;
        rest_api_spec_id: string | null;
        graphql_spec_id: string | null;
        mcp_server_id: string | null;
        a2a_agent_id: string | null;
        rag_id: string | null;
      } | null; error: unknown };

    if (fetchError || !token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    // Delete the single token
    const { error: deleteError } = await supabase
      .from('oauth_tokens')
      .delete()
      .eq('id', tokenId);

    if (deleteError) {
      console.error('[OAuth Connections] Failed to delete token:', deleteError);
      return NextResponse.json({ error: 'Failed to delete token' }, { status: 500 });
    }

    // Also delete the corresponding paired token (shared <-> server-specific)
    // This ensures both tokens are deleted together to prevent refresh token reuse
    if (token.oauth_provider_hash) {
      // This was a shared token - find and delete any server-specific tokens with matching server IDs
      // that would have the same provider hash
      // For now, we don't have a direct way to find them, so we skip this case
      // The server-specific tokens will be orphaned and won't work without the shared token
    } else {
      // This was a server-specific token - find the server ID and look for shared tokens
      const serverId = token.rest_api_spec_id || token.graphql_spec_id || token.mcp_server_id || token.a2a_agent_id || token.rag_id;
      if (serverId) {
        // Get the import's OAuth config to find the provider hash
        const serverType = token.rest_api_spec_id ? 'rest_api_specs' :
                          token.graphql_spec_id ? 'graphql_specs' :
                          token.mcp_server_id ? 'mcp_servers' :
                          token.a2a_agent_id ? 'a2a_agents' : 'user_rags';

        const { data: importData } = await supabase
          .from(serverType as 'rest_api_specs')
          .select('auth_config')
          .eq('id', serverId)
          .single() as { data: { auth_config: Record<string, unknown> | null } | null; error: unknown };

        if (importData?.auth_config) {
          const config = importData.auth_config;
          if (config.token_endpoint && config.client_id) {
            const provHash = generateOAuthProviderHash({
              token_endpoint: config.token_endpoint as string,
              client_id: config.client_id as string,
              authorization_endpoint: (config.authorization_endpoint as string) || '',
              scopes: (config.scopes as string) || '',
              use_dcr: false,
              client_secret: '',
              registration_endpoint: '',
            });

            // Delete the shared token with this provider hash
            await supabase
              .from('oauth_tokens')
              .delete()
              .eq('user_id', userId)
              .eq('oauth_provider_hash', provHash);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[OAuth Connections] Delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

