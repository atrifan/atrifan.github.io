import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth UserInfo Proxy
 * 
 * Proxies userinfo requests to Clerk.
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
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return NextResponse.json(
      { error: 'invalid_token', error_description: 'Missing authorization header' },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(`${getClerkFrontendApi()}/oauth/userinfo`, {
      headers: {
        'Authorization': authHeader,
      },
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
    console.error('Error proxying userinfo request:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Failed to fetch user info' },
      { status: 500 }
    );
  }
}

