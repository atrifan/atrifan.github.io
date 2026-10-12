import { NextRequest, NextResponse } from 'next/server';
import { parseFeedQuery } from '@/src/lib/notify/feed';
import { listFeed } from '@/src/lib/notify/feed-service';
import { badRequest, sessionUserId, unauthorized, unavailable } from '@/src/lib/session-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications?limit=&cursor=&unread=1&surface=&type=
 *   → { items, nextCursor, unreadCount }, newest first. Served on every surface (the bell).
 */
export async function GET(request: NextRequest) {
  const userId = await sessionUserId(request);
  if (!userId) return unauthorized();
  const parsed = parseFeedQuery(request.nextUrl.searchParams);
  if (!parsed.ok) return badRequest(parsed.error);
  try {
    return NextResponse.json(await listFeed(userId, parsed.query), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return unavailable('notifications', err);
  }
}
