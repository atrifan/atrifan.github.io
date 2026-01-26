import { NextResponse } from 'next/server';

/**
 * JWKS Proxy endpoint
 * 
 * Proxies JWKS requests to Clerk's JWKS endpoint.
 * This allows clients to use our domain for JWKS discovery.
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
  return process.env.CLERK_HOST || 'https://quick-adder-16.clerk.accounts.dev';
}

export async function GET() {
  try {
    const clerkJwksUrl = `${getClerkFrontendApi()}/.well-known/jwks.json`;
    
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

