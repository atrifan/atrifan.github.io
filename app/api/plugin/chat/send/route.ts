import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  authorizeSession,
  enqueueFrame,
  isSessionDeviceOnline,
  appendMessage,
  logChatInteraction,
} from '@/src/lib/chat-relay-service';

/**
 * Page → device. The remote chat page posts an inbound frame (SEND_MESSAGE,
 * STOP_STREAM, approval responses, …) for the connected device to execute. The
 * device receives it over the Realtime channel or via /poll. A SEND_MESSAGE
 * frame also persists the user message to durable history.
 *
 *   POST /api/plugin/chat/send
 *   (Clerk session)
 *   { session_id: string, frame: object }
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = body?.session_id as string | undefined;
  const frame = body?.frame as Record<string, unknown> | undefined;
  if (!sessionId || !frame || typeof frame !== 'object') {
    return NextResponse.json({ error: 'session_id and frame are required' }, { status: 400 });
  }

  const authz = await authorizeSession(sessionId, { userId });
  if (!authz.ok) {
    return NextResponse.json({ error: 'Session not found' }, { status: authz.status });
  }

  // Enqueue regardless of presence: the frame is durable and the device will
  // pick it up when it next polls/subscribes. We surface presence to the UI as
  // a banner (deviceOnline) rather than hard-failing the send.
  const deviceOnline = await isSessionDeviceOnline(authz.session);

  await enqueueFrame(authz.session, 'to_device', frame);

  // Persist the user's message so history is complete on both surfaces, and
  // count the turn toward the dashboard's request stats.
  if (frame.type === 'SEND_MESSAGE' && typeof frame.text === 'string') {
    await appendMessage(authz.session, 'user', { text: frame.text });
    await logChatInteraction(authz.session);
  }

  return NextResponse.json({ ok: true, deviceOnline });
}
