import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { listMilestones } from '@/src/lib/jobs/room-service';

type Ctx = { params: { id: string } };

/** Milestones in order. `?since=<next_cursor>` returns only milestones changed since. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) =>
    NextResponse.json(await listMilestones(userId, params.id, request.nextUrl.searchParams.get('since'))),
  );
}
