import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { UpdateJobSchema } from '@/src/lib/jobs/schemas';
import { getJobForViewer, updateJob, cancelJob } from '@/src/lib/jobs/jobs-service';

type Ctx = { params: { id: string } };

/** A job and its current spec. Drafts are visible to their owner only. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await getJobForViewer(userId, params.id)));
}

/** Edit a draft job (owner only). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const input = parseBody(UpdateJobSchema, await readJson(request));
    return NextResponse.json({ job: await updateJob(userId, params.id, input) });
  });
}

/** Cancel a draft or open job (owner only). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json({ job: await cancelJob(userId, params.id) }));
}
