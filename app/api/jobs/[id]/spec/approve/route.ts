import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { ApproveSpecRequestSchema } from '@/src/lib/jobs/schemas';
import { approveSpec } from '@/src/lib/jobs/jobs-service';

type Ctx = { params: { id: string } };

/** Approve a draft spec (default: the latest) and open the job for bids. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const body = parseBody(ApproveSpecRequestSchema, await readJson(request));
    return NextResponse.json(await approveSpec(userId, params.id, body.spec_version_id));
  });
}
