import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { JobsError } from '@/src/lib/jobs/errors';
import { CreateJobSchema, parseJobListQuery } from '@/src/lib/jobs/schemas';
import { createJob, listJobs } from '@/src/lib/jobs/jobs-service';

/** Create a draft job. */
export async function POST(request: NextRequest) {
  return withUser(request, async (userId) => {
    const input = parseBody(CreateJobSchema, await readJson(request));
    const job = await createJob(userId, input);
    return NextResponse.json({ job }, { status: 201 });
  });
}

/** List public jobs (default status=open) or, with mine=true, the caller's own jobs. */
export async function GET(request: NextRequest) {
  return withUser(request, async (userId) => {
    const parsed = parseJobListQuery(request.nextUrl.searchParams);
    if (!parsed.ok) throw new JobsError('invalid_request', 400, 'Invalid query', parsed.issues);
    return NextResponse.json(await listJobs(userId, parsed.value));
  });
}
