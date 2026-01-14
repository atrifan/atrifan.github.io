/**
 * OAuth Connections API
 *
 * GET - List all OAuth connections with linked imports
 * DELETE - Delete OAuth connection (revoke all tokens)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/src/lib/supabase';
import { generateOAuthProviderHash } from '@/src/lib/oauth-token-manager';
import type { OAuth2AuthConfig } from '@/src/types/supabase';

// OAuth connection with linked imports
export interface OAuthConnection {
  id: string;
  providerHash: string;
  oauthConfig: OAuth2AuthConfig;
  hasRefreshToken: boolean;
  accessTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
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

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // Get all OAuth tokens for this user that have a provider hash (shared tokens)
    const { data: tokens, error } = await supabase
      .from('oauth_tokens')
      .select('*')
      .eq('user_id', userId)
      .not('oauth_provider_hash', 'is', null);

    if (error) {
      console.error('[OAuth Connections] Failed to fetch tokens:', error);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    // Build a map of provider hash to connection
    const connectionMap = new Map<string, OAuthConnection>();

    // Initialize connections from tokens
    for (const token of tokens || []) {
      connectionMap.set(token.oauth_provider_hash, {
        id: token.id,
        providerHash: token.oauth_provider_hash,
        oauthConfig: {
          authorization_endpoint: '',
          token_endpoint: '',
          scopes: token.scope || '',
          use_dcr: false,
          client_id: '',
          client_secret: '',
          registration_endpoint: '',
        },
        hasRefreshToken: !!token.refresh_token,
        accessTokenExpiresAt: token.access_token_expires_at,
        createdAt: token.created_at,
        updatedAt: token.updated_at,
        linkedImports: [],
      });
    }

    // Find all OAuth2 imports and link them to connections
    const importTypes = [
      { table: 'rest_api_specs', type: 'rest_api' as const, nameField: 'api_title' },
      { table: 'graphql_specs', type: 'graphql' as const, nameField: 'api_title' },
      { table: 'mcp_servers', type: 'mcp' as const, nameField: 'display_name' },
      { table: 'a2a_agents', type: 'a2a' as const, nameField: 'display_name' },
      { table: 'user_rags', type: 'rag' as const, nameField: 'name' },
    ];

    for (const { table, type, nameField } of importTypes) {
      const { data: imports } = await supabase
        .from(table)
        .select(`id, ${nameField}, auth_type, auth_config`)
        .eq('user_id', userId)
        .eq('auth_type', 'oauth2');

      for (const imp of imports || []) {
        const config = getOAuthConfig(imp.auth_config as Record<string, unknown> | null);
        if (!config || !config.token_endpoint || !config.client_id) continue;

        const providerHash = generateOAuthProviderHash(config);
        const connection = connectionMap.get(providerHash);

        if (connection) {
          // Update OAuth config from import (first one wins)
          if (!connection.oauthConfig.token_endpoint) {
            connection.oauthConfig = config;
          }
          connection.linkedImports.push({
            type,
            id: imp.id,
            name: imp[nameField] || 'Unknown',
          });
        }
      }
    }

    // Filter out connections with no OAuth config (orphaned tokens)
    const connections = Array.from(connectionMap.values()).filter(
      c => c.oauthConfig.token_endpoint
    );

    return NextResponse.json({ connections });
  } catch (error) {
    console.error('[OAuth Connections] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


/**
 * DELETE - Revoke all tokens for a connection
 * Query param: id (token ID)
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

    if (!tokenId) {
      return NextResponse.json({ error: 'Token ID required' }, { status: 400 });
    }

    // Verify the token belongs to this user
    const { data: token, error: fetchError } = await supabase
      .from('oauth_tokens')
      .select('id, oauth_provider_hash')
      .eq('id', tokenId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    // Delete the token
    const { error: deleteError } = await supabase
      .from('oauth_tokens')
      .delete()
      .eq('id', tokenId);

    if (deleteError) {
      console.error('[OAuth Connections] Failed to delete token:', deleteError);
      return NextResponse.json({ error: 'Failed to delete token' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[OAuth Connections] Delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

