import { NextRequest, NextResponse } from 'next/server';
import { MISCONFIGURED } from '@/src/lib/misconfigured';
import { resolveClerkFrontendApi } from '@/src/lib/clerk-oauth-config';

/**
 * OAuth UserInfo Proxy
 * 
 * Proxies userinfo requests to Clerk.
 */

export async function GET(request: NextRequest) {
  const clerkApi = resolveClerkFrontendApi(process.env);
  if (!clerkApi) {
    console.error('[oauth/userinfo] Clerk frontend API env is not configured');
    return NextResponse.json(MISCONFIGURED, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader) {
    return NextResponse.json(
      { error: 'invalid_token', error_description: 'Missing authorization header' },
      { status: 401 }
    );
  }

  try {
    const response = await fetch(`${clerkApi}/oauth/userinfo`, {
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

