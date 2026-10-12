import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { MilestoneUpdateSchema } from '@/src/lib/jobs/room-schemas';
import { listMilestones, updateMilestone } from '@/src/lib/jobs/room-service';

type Ctx = { params: { id: string } };

/** Milestones in order. `?since=<next_cursor>` returns only milestones changed since. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) =>
    NextResponse.json(await listMilestones(userId, params.id, request.nextUrl.searchParams.get('since'))),
  );
}

/**
 * The provider creates (no `milestone_id`; `title` required) or updates a milestone from the web
 * (the Jobs MCP has milestone_update). 201 on create, 200 on update.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const body = await readJson(request);
    const input = parseBody(MilestoneUpdateSchema, { ...(body as Record<string, unknown>), contract_id: params.id });
    const milestone = await updateMilestone(userId, input, null);
    return NextResponse.json({ milestone }, { status: input.milestone_id ? 200 : 201 });
  });
}
