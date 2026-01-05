import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth 2.0 Authorization Server Metadata endpoint
 * RFC 8414: https://tools.ietf.org/html/rfc8414
 *
 * This provides the same metadata as OpenID Connect Discovery,
 * but at the OAuth 2.0 standard location.
 */

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_HOST || request.nextUrl.origin;

  const config = {
    // Issuer identifier
    issuer: baseUrl,

    // OAuth endpoints
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    userinfo_endpoint: `${baseUrl}/api/oauth/userinfo`,
    // registration_endpoint: `${baseUrl}/api/oauth/register`, // DCR not supported yet

    // JWKS URI - proxied through our server
    jwks_uri: `${baseUrl}/api/oauth/jwks`,

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

