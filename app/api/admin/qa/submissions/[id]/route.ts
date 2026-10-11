import { NextRequest, NextResponse } from 'next/server';
import { submissionIdParam, withQaAdmin } from '@/src/lib/qa/admin-http';
import { getSubmissionDetail } from '@/src/lib/qa/qa-review-service';

export const dynamic = 'force-dynamic';

/** GET → a submission's full QA context (job, spec, contract versions, parties, QA, history). Admins only. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return withQaAdmin(request, async () =>
    NextResponse.json(await getSubmissionDetail({ submission_id: submissionIdParam(params) })),
  );
}
