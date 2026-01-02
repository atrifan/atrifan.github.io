import { NextRequest, NextResponse } from 'next/server';

/**
 * OpenID Connect Discovery endpoint
 * https://openid.net/specs/openid-connect-discovery-1_0.html
 * 
 * This provides metadata about the OAuth/OIDC configuration.
 * Since we use Clerk for authentication, this points to Clerk's endpoints.
 */
export async function GET(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;
  
  // Get Clerk's frontend API URL from the publishable key
  // Format: pk_test_<base64_encoded_frontend_api>
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  let clerkFrontendApi = 'https://clerk.tulzo.vercel.app';
  
  if (publishableKey) {
    try {
      // Extract the base64 part after pk_test_ or pk_live_
      const base64Part = publishableKey.replace(/^pk_(test|live)_/, '');
      const decoded = Buffer.from(base64Part, 'base64').toString('utf-8');
      // The decoded string is the frontend API domain
      if (decoded && decoded.includes('.clerk.')) {
        clerkFrontendApi = `https://${decoded}`;
      }
    } catch {
      // Use default if decoding fails
    }
  }

  const config = {
    // Issuer identifier
    issuer: baseUrl,
    
    // Authorization endpoint (Clerk handles this)
    authorization_endpoint: `${clerkFrontendApi}/oauth/authorize`,
    
    // Token endpoint (Clerk handles this)
    token_endpoint: `${clerkFrontendApi}/oauth/token`,
    
    // UserInfo endpoint
    userinfo_endpoint: `${clerkFrontendApi}/oauth/userinfo`,
    
    // JWKS URI for token verification
    jwks_uri: `${clerkFrontendApi}/.well-known/jwks.json`,
    
    // Registration endpoint (not supported)
    // registration_endpoint: null,
    
    // Scopes supported
    scopes_supported: [
      'openid',
      'profile',
      'email',
    ],
    
    // Response types supported
    response_types_supported: [
      'code',
      'token',
      'id_token',
      'code token',
      'code id_token',
      'token id_token',
      'code token id_token',
    ],
    
    // Response modes supported
    response_modes_supported: [
      'query',
      'fragment',
      'form_post',
    ],
    
    // Grant types supported
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
      'implicit',
    ],
    
    // Subject types supported
    subject_types_supported: ['public'],
    
    // ID token signing algorithms
    id_token_signing_alg_values_supported: ['RS256'],
    
    // Token endpoint auth methods
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
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

