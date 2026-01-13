import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth Token Exchange API
 * 
 * Exchanges an authorization code for an access token.
 * This is used by the AuthenticationCard OAuth popup flow.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      tokenEndpoint,
      clientId,
      clientSecret,
      redirectUri,
      codeVerifier, // For PKCE
    } = body;

    if (!code || !tokenEndpoint || !clientId || !redirectUri) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Build token request
    const tokenParams = new URLSearchParams();
    tokenParams.set('grant_type', 'authorization_code');
    tokenParams.set('code', code);
    tokenParams.set('redirect_uri', redirectUri);
    tokenParams.set('client_id', clientId);
    
    if (clientSecret) {
      tokenParams.set('client_secret', clientSecret);
    }
    
    if (codeVerifier) {
      tokenParams.set('code_verifier', codeVerifier);
    }

    // Make token request
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: tokenParams.toString(),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return NextResponse.json(
        {
          error: tokenData.error || 'token_exchange_failed',
          error_description: tokenData.error_description || 'Failed to exchange code for token',
        },
        { status: tokenResponse.status }
      );
    }

    // Return the token response
    return NextResponse.json({
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token,
      scope: tokenData.scope,
      id_token: tokenData.id_token,
    });
  } catch (error) {
    console.error('Token exchange error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to exchange token' },
      { status: 500 }
    );
  }
}

