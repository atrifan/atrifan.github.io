import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { listActivity } from '@/src/lib/jobs/room-service';

type Ctx = { params: { id: string } };

/** The contract's activity feed, oldest first. Poll with `?since=<next_cursor>`. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) =>
    NextResponse.json(await listActivity(userId, params.id, request.nextUrl.searchParams.get('since'))),
  );
}
