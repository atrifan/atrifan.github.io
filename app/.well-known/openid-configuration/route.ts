import { NextRequest, NextResponse } from 'next/server';

/**
 * OpenID Connect Discovery endpoint
 * https://openid.net/specs/openid-connect-discovery-1_0.html
 *
 * This provides metadata about the OAuth/OIDC configuration.
 * All endpoints point to our OAuth proxy which handles Clerk auth.
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

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_HOST || request.nextUrl.origin;
  const clerkFrontendApi = getClerkFrontendApi();

  const config = {
    // Issuer identifier
    issuer: baseUrl,

    // OAuth proxy endpoints on our domain
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    userinfo_endpoint: `${baseUrl}/api/oauth/userinfo`,

    // JWKS URI for token verification (still Clerk's)
    jwks_uri: `${clerkFrontendApi}/.well-known/jwks.json`,

    // Scopes supported
    scopes_supported: [
      'openid',
      'profile',
      'email',
    ],

    // Response types supported
    response_types_supported: [
      'code',
    ],

    // Response modes supported
    response_modes_supported: [
      'query',
    ],

    // Grant types supported
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
    ],

    // Subject types supported
    subject_types_supported: ['public'],

    // ID token signing algorithms
    id_token_signing_alg_values_supported: ['RS256'],

    // Token endpoint auth methods
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none',
    ],

    // Claims supported
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'email',
      'email_verified',
      'name',
      'given_name',
      'family_name',
      'picture',
    ],

    // Code challenge methods for PKCE
    code_challenge_methods_supported: ['S256', 'plain'],

    // Tulzo-specific endpoints
    tulzo_mcp_endpoint: `${baseUrl}/api/mcp`,
    tulzo_mcp_authenticated_endpoint: `${baseUrl}/api/mcp/{api_key}`,
    tulzo_dashboard: `${baseUrl}/dashboard`,
    tulzo_pricing: `${baseUrl}/pricing`,
  };

  return NextResponse.json(config, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

