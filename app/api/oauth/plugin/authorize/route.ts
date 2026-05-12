import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getApiKeyByUserAndServer } from '@/src/lib/supabase-services';

/**
 * OAuth-like authorization endpoint for the native-host/plugin.
 *
 * Flow:
 * 1. Native-host opens browser to this URL with a local callback port
 * 2. User authenticates via Clerk (session already exists if signed in)
 * 3. This endpoint returns the user's API key + plan info to the callback
 *
 * Query params:
 * - callback_port: localhost port the native-host is listening on
 * - state: random state for CSRF protection
 */
export async function GET(req: NextRequest) {
  const { userId, sessionClaims } = await auth();
  const { searchParams } = new URL(req.url);
  const callbackPort = searchParams.get('callback_port');
  const state = searchParams.get('state');

  if (!userId) {
    // Redirect to sign-in with return URL back to this endpoint
    const returnUrl = req.url;
    const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`;
    return NextResponse.redirect(new URL(signInUrl, req.url));
  }

  // Get user's plan from session claims
  const plaClaim = (sessionClaims as Record<string, unknown>)?.pla as string | undefined;
  let plan = 'free';
  if (plaClaim) {
    const extracted = plaClaim.includes(':') ? plaClaim.split(':')[1] : plaClaim;
    if (extracted === 'pro' || extracted === 'plus') plan = extracted;
  }

  // Get existing API key
  const existingKey = await getApiKeyByUserAndServer(userId, 'default');

  if (!existingKey) {
    // No API key yet - redirect to dashboard to generate one
    if (callbackPort) {
      const callbackUrl = `http://localhost:${callbackPort}/callback?error=no_api_key&message=${encodeURIComponent('Generate an API key in the Control Panel first')}&state=${state || ''}`;
      return NextResponse.redirect(callbackUrl);
    }
    return NextResponse.json({ error: 'no_api_key', message: 'Generate an API key in the Control Panel first' }, { status: 400 });
  }

  if (plan === 'free') {
    if (callbackPort) {
      const callbackUrl = `http://localhost:${callbackPort}/callback?error=plan_required&message=${encodeURIComponent('Upgrade to Pro or Plus to use the plugin')}&state=${state || ''}`;
      return NextResponse.redirect(callbackUrl);
    }
    return NextResponse.json({ error: 'plan_required', message: 'Upgrade to Pro or Plus to use the plugin' }, { status: 403 });
  }

  // Success - return credentials to the native-host callback
  if (callbackPort) {
    const callbackUrl = `http://localhost:${callbackPort}/callback?api_key=${encodeURIComponent(existingKey.api_key || '')}&plan=${plan}&user_id=${userId}&state=${state || ''}`;
    return NextResponse.redirect(callbackUrl);
  }

  return NextResponse.json({
    api_key: existingKey.api_key,
    plan,
    user_id: userId,
  });
}
