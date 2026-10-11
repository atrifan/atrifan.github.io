import { NextResponse } from 'next/server';
import { MISCONFIGURED, resolveClerkFrontendApi } from '@/src/lib/clerk-oauth-config';

/**
 * JWKS Proxy endpoint
 * 
 * Proxies JWKS requests to Clerk's JWKS endpoint.
 * This allows clients to use our domain for JWKS discovery.
 */

export async function GET() {
  const clerkApi = resolveClerkFrontendApi(process.env);
  if (!clerkApi) {
    console.error('[oauth/jwks] Clerk frontend API env is not configured');
    return NextResponse.json(MISCONFIGURED, { status: 500 });
  }
  try {
    const clerkJwksUrl = `${clerkApi}/.well-known/jwks.json`;
    
    const response = await fetch(clerkJwksUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch JWKS from Clerk:', response.status);
      return NextResponse.json(
        { error: 'Failed to fetch JWKS' },
        { status: 502 }
      );
    }

    const jwks = await response.json();

    return NextResponse.json(jwks, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error proxying JWKS request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch JWKS' },
      { status: 500 }
    );
  }
}

