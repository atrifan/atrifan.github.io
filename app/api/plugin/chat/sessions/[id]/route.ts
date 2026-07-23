import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { renameSession, deleteRelaySession } from '@/src/lib/chat-relay-service';

/**
 * Manage a single relay chat session (Clerk-authenticated owner).
 *
 *   PATCH  /api/plugin/chat/sessions/[id]  { title } → { session }
 *   DELETE /api/plugin/chat/sessions/[id]           → { ok }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === 'string' ? body.title.trim() : undefined;
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const session = await renameSession(id, userId, title);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const removed = await deleteRelaySession(id, userId);
  if (!removed) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
