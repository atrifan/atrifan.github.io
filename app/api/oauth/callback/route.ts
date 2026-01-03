import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth Callback Proxy
 * 
 * Receives callback from Clerk, decodes original redirect_uri from state,
 * and redirects to the original client with the authorization code.
 */

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  if (!state) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing state parameter' },
      { status: 400 }
    );
  }

  // Decode the proxy state
  let proxyState: { redirect_uri: string; original_state?: string; client_id?: string };
  try {
    proxyState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Invalid state parameter' },
      { status: 400 }
    );
  }

  const { redirect_uri, original_state } = proxyState;

  if (!redirect_uri) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Missing redirect_uri in state' },
      { status: 400 }
    );
  }

  // Build redirect URL to original client
  let targetUrl: URL;
  try {
    targetUrl = new URL(redirect_uri);
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'Invalid redirect_uri' },
      { status: 400 }
    );
  }

  // Forward error if present
  if (error) {
    targetUrl.searchParams.set('error', error);
    if (errorDescription) {
      targetUrl.searchParams.set('error_description', errorDescription);
    }
    if (original_state) {
      targetUrl.searchParams.set('state', original_state);
    }
    return NextResponse.redirect(targetUrl.toString());
  }

  // Forward authorization code
  if (code) {
    targetUrl.searchParams.set('code', code);
  }
  if (original_state) {
    targetUrl.searchParams.set('state', original_state);
  }

  return NextResponse.redirect(targetUrl.toString());
}

