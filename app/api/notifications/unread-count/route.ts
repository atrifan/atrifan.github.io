import { NextRequest, NextResponse } from 'next/server';
import { feedUnreadCount } from '@/src/lib/notify/feed-service';
import { sessionUserId, unauthorized, unavailable } from '@/src/lib/session-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/notifications/unread-count → { count }. The bell polls it every 30s while visible. */
export async function GET(request: NextRequest) {
  const userId = await sessionUserId(request);
  if (!userId) return unauthorized();
  try {
    return NextResponse.json({ count: await feedUnreadCount(userId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return unavailable('notifications', err);
  }
}
