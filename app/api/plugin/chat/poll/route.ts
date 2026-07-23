import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateDevice,
  authorizeSession,
  drainFrames,
  drainDeviceInbox,
  touchDevicePresence,
} from '@/src/lib/chat-relay-service';

/**
 * Page → device (pull). Delivery path for a connected device that can't hold a
 * Supabase Realtime subscription: pull pending inbound (to_device) frames and
 * mark them consumed.
 *
 * Two modes:
 *  - INBOX (recommended): omit session_id. Drains ALL unconsumed to_device
 *    frames across every session targeting this device, each tagged with its
 *    session_id. The device needs no session discovery — it just polls its
 *    inbox with its Bearer key and emits replies back to the frame's session_id.
 *      → { frames: [{ session_id, frame }] }
 *  - SINGLE SESSION (legacy): pass ?session_id=<id> to drain just that session.
 *      → { frames: object[] }
 *
 *   GET /api/plugin/chat/poll[?session_id=<id>]
 *   Authorization: Bearer <device api key>
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateDevice(req.headers.get('authorization'));
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  // A live poll is the tightest presence signal we have — the device is
  // actively reachable right now (either mode).
  await touchDevicePresence(
    authResult.auth.apiKeyId,
    authResult.auth.userId,
    authResult.auth.deviceName
  );

  const sessionId = req.nextUrl.searchParams.get('session_id');

  // Inbox mode: no session_id → drain everything addressed to this device.
  if (!sessionId) {
    const frames = await drainDeviceInbox(authResult.auth.apiKeyId);
    return NextResponse.json({ frames });
  }

  // Legacy single-session mode.
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
