import { NextResponse } from 'next/server';

/**
 * GET /api/push/vapid-key
 * 
 * Returns the VAPID public key needed for push subscription.
 * This is a public endpoint - no auth required.
 */
export async function GET() {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    return NextResponse.json(
      { 
        error: 'Push notifications not configured',
        configured: false,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    publicKey: vapidPublicKey,
    configured: true,
  });
}

