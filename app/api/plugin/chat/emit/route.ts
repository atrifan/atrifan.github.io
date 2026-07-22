import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateDevice,
  authorizeSession,
  enqueueFrame,
  maybePersistTerminalFrame,
} from '@/src/lib/chat-relay-service';

/**
 * Device → page. The connected "Horia" device posts an outbound frame
 * (STREAM_CHUNK, THINKING_CHUNK, RENDER_BLOCK, STREAM_DONE, …) destined for the
 * remote chat page. Broadcast + durable row; terminal frames persist history.
 *
 *   POST /api/plugin/chat/emit
 *   Authorization: Bearer <device api key>
 *   { session_id: string, frame: object }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateDevice(req.headers.get('authorization'));
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  const body = await req.json().catch(() => ({}));
  const sessionId = body?.session_id as string | undefined;
  const frame = body?.frame as Record<string, unknown> | undefined;
  if (!sessionId || !frame || typeof frame !== 'object') {
    return NextResponse.json({ error: 'session_id and frame are required' }, { status: 400 });
  }

  const authz = await authorizeSession(sessionId, {
    userId: authResult.auth.userId,
    apiKeyId: authResult.auth.apiKeyId,
  });
  if (!authz.ok) {
    return NextResponse.json({ error: 'Session not found' }, { status: authz.status });
  }

  await enqueueFrame(authz.session, 'to_page', frame);
  await maybePersistTerminalFrame(authz.session, frame);

  return NextResponse.json({ ok: true });
}
