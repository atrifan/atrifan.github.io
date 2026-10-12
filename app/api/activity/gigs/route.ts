import { NextRequest, NextResponse } from 'next/server';
import { loadGigsActivity } from '@/src/lib/activity/gigs-activity-service';
import { sessionUserId, unauthorized, unavailable } from '@/src/lib/session-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/activity/gigs → { currency, customer, provider, ledger } for the signed-in user (gigs My activity). */
export async function GET(request: NextRequest) {
  const userId = await sessionUserId(request);
  if (!userId) return unauthorized();
  try {
    return NextResponse.json(await loadGigsActivity(userId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return unavailable('activity/gigs', err);
  }
}
