import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  authenticateDevice,
  authorizeSession,
  getMessages,
} from '@/src/lib/chat-relay-service';

/**
 * Durable chat history for a relay session, oldest first. Reachable two ways:
 *  - the remote page (Clerk-authenticated owner), to hydrate on load;
 *  - the connected device (Bearer api key) for its owned session.
 *
 *   GET /api/plugin/chat/sessions/[id]/messages → { messages }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Prefer a device Bearer key if present; otherwise fall back to Clerk.
  const authHeader = req.headers.get('authorization');
  let userId: string | null = null;
  let apiKeyId: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    const device = await authenticateDevice(authHeader);
    if (!device.ok) {
      return NextResponse.json({ error: device.error }, { status: device.status });
    }
    userId = device.auth.userId;
    apiKeyId = device.auth.apiKeyId;
  } else {
    const clerk = await auth();
    if (!clerk.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = clerk.userId;
  }

  const authz = await authorizeSession(id, { userId, apiKeyId });
  if (!authz.ok) {
    return NextResponse.json({ error: 'Session not found' }, { status: authz.status });
  }

  const messages = await getMessages(id);
  return NextResponse.json({ messages });
}
