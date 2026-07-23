import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { authorizeSession, fetchPageFrames, latestPageSeq } from '@/src/lib/chat-relay-service';

/**
 * Device → page (pull). The reliable delivery path for the remote chat PAGE.
 *
 * The page is Clerk-authed and has no Supabase JWT, so it cannot receive
 * `to_page` frames over Supabase Realtime under RLS. It polls this route with a
 * monotonic `after` seq cursor to drain the device's streamed frames
 * (STREAM_CHUNK / THINKING_CHUNK / RENDER_BLOCK / STREAM_DONE / …). Mirrors the
 * device's `/poll` inbox. Realtime broadcast stays a best-effort optimization.
 *
 *   GET /api/plugin/chat/receive?session_id=<id>&after=<seq>
 *   (Clerk session)
 *   → { frames: [{ seq, frame }], cursor }
 *
 * `after=latest` (or omitting it on the first poll) primes the cursor to the
 * newest existing seq WITHOUT returning frames, so reopening a session doesn't
 * replay every historical STREAM_CHUNK (durable history hydrates separately from
 * `chat_relay_messages`). Subsequent polls pass the numeric cursor to stream new
 * frames only.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
  }

  const authz = await authorizeSession(sessionId, { userId });
  if (!authz.ok) {
    return NextResponse.json({ error: 'Session not found' }, { status: authz.status });
  }

  const afterParam = req.nextUrl.searchParams.get('after');
  // Prime mode: skip the backlog, return the current high-water seq as the cursor.
  if (afterParam === 'latest') {
    const cursor = await latestPageSeq(sessionId);
    return NextResponse.json({ frames: [], cursor });
  }

  const afterSeq = Number(afterParam ?? '0') || 0;
  const frames = await fetchPageFrames(sessionId, afterSeq);
  const cursor = frames.length ? frames[frames.length - 1].seq : afterSeq;
  return NextResponse.json({ frames, cursor });
}
