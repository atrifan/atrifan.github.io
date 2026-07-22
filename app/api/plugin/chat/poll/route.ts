import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateDevice,
  authorizeSession,
  drainFrames,
} from '@/src/lib/chat-relay-service';

/**
 * Page → device (pull). Fallback delivery path for a connected device that
 * can't hold a Supabase Realtime subscription: pull pending inbound
 * (to_device) frames and mark them consumed. The primary path is the device
 * subscribing to the `chat:<session_id>` channel directly.
 *
 *   GET /api/plugin/chat/poll?session_id=<id>
 *   Authorization: Bearer <device api key>
 *   → { frames: object[] }
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateDevice(req.headers.get('authorization'));
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
  }

  const authz = await authorizeSession(sessionId, {
    userId: authResult.auth.userId,
    apiKeyId: authResult.auth.apiKeyId,
  });
  if (!authz.ok) {
    return NextResponse.json({ error: 'Session not found' }, { status: authz.status });
  }

  const frames = await drainFrames(sessionId, 'to_device');
  return NextResponse.json({ frames });
}
