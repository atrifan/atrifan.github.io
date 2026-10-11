import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { PostMessageSchema } from '@/src/lib/jobs/room-schemas';
import { listMessages, postMessage } from '@/src/lib/jobs/room-service';

type Ctx = { params: { id: string } };

/** Messages and progress posts, oldest first. Poll with `?since=<next_cursor>`. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) =>
    NextResponse.json(await listMessages(userId, params.id, request.nextUrl.searchParams.get('since'))),
  );
}

/** Post a message as either party. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const { body } = parseBody(PostMessageSchema, await readJson(request));
    return NextResponse.json({ message: await postMessage(userId, params.id, body) }, { status: 201 });
  });
}
