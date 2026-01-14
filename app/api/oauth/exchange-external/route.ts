import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { storeOAuthToken, type ServerReference } from '@/src/lib/oauth-token-manager';
import type { OAuthServerType, OAuth2AuthConfig } from '@/src/types/supabase';

/**
 * POST /api/oauth/exchange-external
 *
 * Exchange authorization code for tokens with an external OAuth provider
 * and store the tokens in our database.
 *
 * Also stores a shared token by provider hash for token reuse across
 * connectors using the same OAuth server.
 */

interface ExchangeRequest {
  code: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  serverType: OAuthServerType;
  serverId: string;
  // Optional: full OAuth config for token sharing
  authorizationEndpoint?: string;
  scopes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: ExchangeRequest = await request.json();
    const {
      code, tokenEndpoint, clientId, clientSecret, redirectUri,
      serverType, serverId, authorizationEndpoint, scopes
    } = body;

    console.log('[OAuth Exchange] Request received');
    console.log('[OAuth Exchange] tokenEndpoint:', tokenEndpoint);
    console.log('[OAuth Exchange] clientId:', clientId);
    console.log('[OAuth Exchange] hasClientSecret:', !!clientSecret);
    console.log('[OAuth Exchange] redirectUri:', redirectUri);
    console.log('[OAuth Exchange] serverType:', serverType);
    console.log('[OAuth Exchange] serverId:', serverId);

    if (!code || !tokenEndpoint || !clientId || !redirectUri || !serverType || !serverId) {
      console.error('[OAuth Exchange] Missing required fields:', { code: !!code, tokenEndpoint: !!tokenEndpoint, clientId: !!clientId, redirectUri: !!redirectUri, serverType: !!serverType, serverId: !!serverId });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Exchange code for tokens
    const tokenParams = new URLSearchParams();
    tokenParams.set('grant_type', 'authorization_code');
    tokenParams.set('code', code);
    tokenParams.set('redirect_uri', redirectUri);
    tokenParams.set('client_id', clientId);
    if (clientSecret) {
      tokenParams.set('client_secret', clientSecret);
    }

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: tokenParams.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);

      // Try to parse as JSON for better error message
      try {
        const errorJson = JSON.parse(errorText);
        return NextResponse.json({
          error: errorJson.error_description || errorJson.error || 'Token exchange failed',
        }, { status: tokenResponse.status });
      } catch {
        return NextResponse.json({
          error: `Token exchange failed: ${tokenResponse.status}`,
        }, { status: tokenResponse.status });
      }
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.json({
        error: 'No access token in response',
      }, { status: 400 });
    }

    // Build OAuth config for token sharing
    const oauthConfig: OAuth2AuthConfig = {
      authorization_endpoint: authorizationEndpoint || '',
      token_endpoint: tokenEndpoint,
      scopes: scopes || tokenData.scope || '',
      use_dcr: false,
      client_id: clientId,
      client_secret: clientSecret || '',
      registration_endpoint: '',
    };

    // Store the token in our database (with provider hash for sharing)
    const server: ServerReference = { type: serverType, id: serverId };
    console.log('[OAuth Exchange] Storing token for server:', server);
    console.log('[OAuth Exchange] Token data - hasAccessToken:', !!tokenData.access_token, 'hasRefreshToken:', !!tokenData.refresh_token, 'expiresIn:', tokenData.expires_in);

    // Normalize token_type to "Bearer" (capitalize first letter) for consistency
    const normalizedTokenType = tokenData.token_type
      ? tokenData.token_type.charAt(0).toUpperCase() + tokenData.token_type.slice(1).toLowerCase()
      : 'Bearer';

    const stored = await storeOAuthToken(userId, server, {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: normalizedTokenType,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      id_token: tokenData.id_token,
    }, oauthConfig);

    console.log('[OAuth Exchange] Token stored result:', stored);

    if (!stored) {
      console.error('[OAuth Exchange] Failed to store OAuth token');
      // Still return success since we have the token - it just won't persist
    }

    return NextResponse.json({
      success: true,
      tokenType: tokenData.token_type || 'Bearer',
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
      // Return the clientId used (important for DCR - caller should update agent config)
      clientId,
    });
  } catch (error) {
    console.error('OAuth exchange error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

