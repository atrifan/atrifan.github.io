/**
 * RAG Proxy API
 *
 * Forwards requests to external RAG endpoints to avoid CORS issues.
 * Used for both testing during import and actual RAG queries.
 * Supports various auth methods including OAuth2 with token refresh.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface TestProxyRequest {
  url: string;
  method: 'GET' | 'POST';
  paramsLocation: 'query' | 'body';
  contentType: 'application/json' | 'application/x-www-form-urlencoded';
  authType: 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';
  authConfig: {
    apiKey?: string;
    bearerToken?: string;
    basicCredentials?: string;
  };
  oauth2Config?: {
    accessToken?: string;
    tokenEndpoint?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
  };
  customHeaders: Record<string, string>;
  fieldMapping: {
    query: string;
    embedding: string;
    top_n: string;
    dimensions: string;
    model: string;
  };
  query: string;
  topN: number;
  generateEmbedding: boolean;
  embeddingModel?: string;
  dimensions?: number;
  embedding?: number[];
  // For OAuth token lookup
  ragId?: string;
}

// Refresh OAuth2 token
async function refreshOAuth2Token(
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null> {
  try {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      console.error('[RAG Proxy] Token refresh failed:', response.status);
      return null;
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (error) {
    console.error('[RAG Proxy] Token refresh error:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: TestProxyRequest = await request.json();
    const {
      url,
      method,
      paramsLocation,
      contentType,
      authType,
      authConfig,
      customHeaders,
      fieldMapping,
      query,
      topN,
      generateEmbedding,
      embeddingModel,
      dimensions,
    } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    // Build request params
    const params: Record<string, string | number | number[]> = {
      [fieldMapping.query || 'query']: query,
      [fieldMapping.top_n || 'top_n']: topN,
    };

    // Add embedding-related params if needed
    if (generateEmbedding) {
      // TODO: Generate actual embedding using the selected model
      // For now, we'll send placeholder values
      if (dimensions) {
        params[fieldMapping.dimensions || 'dimensions'] = dimensions;
      }
      if (embeddingModel) {
        params[fieldMapping.model || 'model'] = embeddingModel;
      }
      // Embedding would be generated here and added to params
      // params[fieldMapping.embedding || 'embedding'] = embedding;
    }

    // Build headers
    const headers: Record<string, string> = {
      ...customHeaders,
    };

    // Add auth headers
    let accessToken: string | null = null;
    const supabase = getSupabaseClient();

    if (authType === 'api_key' && authConfig.apiKey) {
      headers['X-API-Key'] = authConfig.apiKey;
    } else if (authType === 'bearer' && authConfig.bearerToken) {
      headers['Authorization'] = `Bearer ${authConfig.bearerToken}`;
    } else if (authType === 'basic' && authConfig.basicCredentials) {
      headers['Authorization'] = `Basic ${Buffer.from(authConfig.basicCredentials).toString('base64')}`;
    } else if (authType === 'oauth2') {
      // Try to get OAuth2 token from stored tokens
      if (body.ragId && supabase) {
        // Look up stored OAuth token for this RAG
        const { data: tokenData } = await supabase
          .from('oauth_tokens')
          .select('*')
          .eq('user_id', userId)
          .eq('server_type', 'rag')
          .eq('server_id', body.ragId)
          .single();

        if (tokenData) {
          // Check if token is expired
          const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at) : null;
          const isExpired = expiresAt && expiresAt < new Date();

          if (isExpired && tokenData.refresh_token && body.oauth2Config?.tokenEndpoint) {
            // Try to refresh the token
            const refreshed = await refreshOAuth2Token(
              body.oauth2Config.tokenEndpoint,
              body.oauth2Config.clientId || '',
              body.oauth2Config.clientSecret || '',
              tokenData.refresh_token
            );

            if (refreshed) {
              // Update stored token
              await supabase
                .from('oauth_tokens')
                .update({
                  access_token: refreshed.accessToken,
                  refresh_token: refreshed.refreshToken || tokenData.refresh_token,
                  expires_at: refreshed.expiresIn
                    ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
                    : null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', tokenData.id);

              accessToken = refreshed.accessToken;
            } else {
              // Refresh failed - need re-auth
              return NextResponse.json({
                needsOAuth: true,
                oauthServerId: body.ragId,
                error: 'OAuth token expired and refresh failed',
              });
            }
          } else if (!isExpired) {
            accessToken = tokenData.access_token;
          } else {
            // No refresh token and expired - need re-auth
            return NextResponse.json({
              needsOAuth: true,
              oauthServerId: body.ragId,
              error: 'OAuth token expired',
            });
          }
        } else {
          // No token found - need OAuth
          return NextResponse.json({
            needsOAuth: true,
            oauthServerId: body.ragId,
            error: 'OAuth authentication required',
          });
        }
      } else if (body.oauth2Config?.accessToken) {
        // Use provided access token (for testing)
        accessToken = body.oauth2Config.accessToken;
      }

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }

    // Build request URL and body
    let requestUrl = url;
    let requestBody: string | undefined;

    if (paramsLocation === 'query') {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        searchParams.set(key, String(value));
      });
      requestUrl = `${url}${url.includes('?') ? '&' : '?'}${searchParams.toString()}`;
    } else {
      headers['Content-Type'] = contentType;
      if (contentType === 'application/json') {
        requestBody = JSON.stringify(params);
      } else {
        const formParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          formParams.set(key, String(value));
        });
        requestBody = formParams.toString();
      }
    }

    // Make the request
    const response = await fetch(requestUrl, {
      method,
      headers,
      body: method === 'POST' ? requestBody : undefined,
    });

    // Check for 401 - might need OAuth re-auth
    if (response.status === 401 && authType === 'oauth2' && body.ragId) {
      return NextResponse.json({
        needsOAuth: true,
        oauthServerId: body.ragId,
        error: 'Authentication failed - please re-authenticate',
      });
    }

    const responseText = await response.text();
    let responseData: unknown;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return NextResponse.json({
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: responseData,
    });
  } catch (error) {
    console.error('Error in RAG test proxy:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Proxy request failed'
    }, { status: 500 });
  }
}

