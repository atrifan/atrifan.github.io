import { NextRequest, NextResponse } from 'next/server';
import { parseReadBody } from '@/src/lib/notify/feed';
import { markFeedRead } from '@/src/lib/notify/feed-service';
import { badRequest, jsonBody, sessionUserId, unauthorized, unavailable } from '@/src/lib/session-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/notifications/read  { ids: string[] } | { all: true } → { updated, unreadCount } */
export async function POST(request: NextRequest) {
  const userId = await sessionUserId(request);
  if (!userId) return unauthorized();
  const parsed = parseReadBody(await jsonBody(request));
  if (!parsed.ok) return badRequest(parsed.error);
  try {
    return NextResponse.json(await markFeedRead(userId, parsed.target));
  } catch (err) {
    return unavailable('notifications', err);
  }
}
