import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSession, listSessions } from '@/src/lib/chat-relay-service';

/**
 * Relay chat sessions for the logged-in user (Clerk). A session is one chat
 * thread targeting a specific connected device (api_key_id).
 *
 *   GET  /api/plugin/chat/sessions            → { sessions }
 *   POST /api/plugin/chat/sessions { api_key_id, title? } → { session }
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sessions = await listSessions(userId);
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const apiKeyId = body?.api_key_id as string | undefined;
  const title = typeof body?.title === 'string' ? body.title : undefined;
  if (!apiKeyId) {
    return NextResponse.json({ error: 'api_key_id is required' }, { status: 400 });
  }

  try {
    const session = await createSession(userId, apiKeyId, title);
    return NextResponse.json({ session }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'device_not_found') {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}
