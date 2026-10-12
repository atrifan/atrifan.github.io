import { NextRequest, NextResponse } from 'next/server';
import { loadPublisherActivity } from '@/src/lib/activity/publisher-activity-service';
import { sessionUserId, unauthorized, unavailable } from '@/src/lib/session-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/marketplace/publisher/activity → { totals, daily, packages } for the signed-in
 * publisher's packages. Anonymous counts only: no installer is ever named.
 */
export async function GET(request: NextRequest) {
  const userId = await sessionUserId(request);
  if (!userId) return unauthorized();
  try {
    return NextResponse.json(await loadPublisherActivity(userId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return unavailable('marketplace/publisher/activity', err);
  }
}
