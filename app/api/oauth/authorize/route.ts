import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';

/**
 * OAuth Authorization Proxy
 * 
 * Validates client_id (user_id) and client_secret (api_key),
 * stores original redirect_uri in state, then redirects to Clerk.
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const clientId = searchParams.get('client_id');
  const clientSecret = searchParams.get('client_secret');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type') || 'code';
  const scope = searchParams.get('scope') || 'openid profile email';
  const state = searchParams.get('state') || '';
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');

  // Validate required params
  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing client_id or redirect_uri' },
      { status: 400 }
    );
  }

  // Validate client credentials (client_id = user_id, client_secret = api_key)
  try {
    const clerk = await clerkClient();

    // Verify user exists
    const user = await clerk.users.getUser(clientId);
    if (!user) {
      return NextResponse.json(
        { error: 'invalid_client', error_description: 'Invalid client_id' },
        { status: 401 }
      );
    }

    // If client_secret provided, verify it using Clerk's API key verification
    if (clientSecret) {
      try {
        const apiKey = await clerk.apiKeys.verify(clientSecret);
        if (!apiKey || apiKey.subject !== clientId || apiKey.revoked || apiKey.expired) {
          return NextResponse.json(
            { error: 'invalid_client', error_description: 'Invalid client_secret' },
            { status: 401 }
          );
        }
      } catch {
        return NextResponse.json(
          { error: 'invalid_client', error_description: 'Invalid client_secret' },
          { status: 401 }
        );
      }
    }
  } catch (error) {
    console.error('Error validating client:', error);
    return NextResponse.json(
      { error: 'invalid_client', error_description: 'Invalid client_id' },
      { status: 401 }
    );
  }

  // Encode original redirect_uri and state in our state param
  const proxyState = Buffer.from(JSON.stringify({
    redirect_uri: redirectUri,
    original_state: state,
    client_id: clientId,
  })).toString('base64url');

  // Build Clerk authorization URL
  const baseUrl = process.env.NEXT_PUBLIC_HOST || request.nextUrl.origin;
  const clerkAuthUrl = new URL(`${getClerkFrontendApi()}/oauth/authorize`);
  
  // Use Clerk's OAuth app credentials
  clerkAuthUrl.searchParams.set('client_id', process.env.NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID || 'XSfJ6XdWpI4hjmHT');
  clerkAuthUrl.searchParams.set('redirect_uri', `${baseUrl}/api/oauth/callback`);
  clerkAuthUrl.searchParams.set('response_type', responseType);
  clerkAuthUrl.searchParams.set('scope', scope);
  clerkAuthUrl.searchParams.set('state', proxyState);
  
  if (codeChallenge) {
    clerkAuthUrl.searchParams.set('code_challenge', codeChallenge);
  }
  if (codeChallengeMethod) {
    clerkAuthUrl.searchParams.set('code_challenge_method', codeChallengeMethod);
  }

  return NextResponse.redirect(clerkAuthUrl.toString());
}

