import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';

/**
 * OAuth Token Proxy
 * 
 * Validates client credentials and proxies token request to Clerk.
 */

function getClerkFrontendApi(): string {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  if (publishableKey) {
    try {
      const base64Part = publishableKey.replace(/^pk_(test|live)_/, '');
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      if (decoded && decoded.includes('.clerk.')) {
        return `https://${decoded}`;
      }
    } catch {
      // Use default
    }
  }
  return 'https://gentle-aardvark-60.clerk.accounts.dev';
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  
  let body: Record<string, string> = {};
  
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();
    formData.forEach((value, key) => {
      body[key] = value.toString();
    });
  } else if (contentType.includes('application/json')) {
    body = await request.json();
  } else {
    // Try form data anyway
    try {
      const text = await request.text();
      const params = new URLSearchParams(text);
      params.forEach((value, key) => {
        body[key] = value;
      });
    } catch {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Unsupported content type' },
        { status: 400 }
      );
    }
  }

  const clientId = body.client_id;
  const clientSecret = body.client_secret;
  const grantType = body.grant_type;
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const refreshToken = body.refresh_token;
  const codeVerifier = body.code_verifier;

  // Validate client credentials using Clerk's API key verification
  if (clientId) {
    try {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(clientId);

      if (!user) {
        return NextResponse.json(
          { error: 'invalid_client', error_description: 'Invalid client_id' },
          { status: 401 }
        );
      }

      // Verify client_secret using Clerk's API key verification
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
  }

  // Proxy to Clerk's token endpoint
  const baseUrl = process.env.NEXT_PUBLIC_HOST || request.nextUrl.origin;
  const clerkTokenUrl = `${getClerkFrontendApi()}/oauth/token`;
  
  const proxyBody = new URLSearchParams();
  proxyBody.set('client_id', process.env.NEXT_PUBLIC_CLERK_OAUTH_CLIENT_ID || 'XSfJ6XdWpI4hjmHT');
  proxyBody.set('client_secret', process.env.NEXT_PUBLIC_CLERK_OAUTH_CLIENT_SECRET || 'V0W2k5USrYoc37NsGpXaYEGb35lV0A2f');
  proxyBody.set('grant_type', grantType || 'authorization_code');
  
  if (code) proxyBody.set('code', code);
  if (redirectUri) {
    // Use our callback as the redirect_uri for Clerk
    proxyBody.set('redirect_uri', `${baseUrl}/api/oauth/callback`);
  }
  if (refreshToken) proxyBody.set('refresh_token', refreshToken);
  if (codeVerifier) proxyBody.set('code_verifier', codeVerifier);

  try {
    const response = await fetch(clerkTokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: proxyBody.toString(),
    });

    const data = await response.json();
    
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error proxying token request:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to process token request' },
      { status: 500 }
    );
  }
}

