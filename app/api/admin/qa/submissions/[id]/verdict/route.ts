import { NextRequest, NextResponse } from 'next/server';
import { submissionIdParam, withQaAdmin } from '@/src/lib/qa/admin-http';
import { markSubmission } from '@/src/lib/qa/qa-review-service';
import { readJson } from '@/src/lib/jobs/http';

export const dynamic = 'force-dynamic';

/**
 * POST { verdict: validated|requires_changes|rejected, reason?, report_md?, findings? }
 * → the recorded review and the new submission/contract status. A reason is required
 * unless validated (422). Admins only.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withQaAdmin(request, async (adminUserId) => {
    const submission_id = submissionIdParam(params);
    const body = await readJson(request);
    const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    return NextResponse.json(await markSubmission(adminUserId, { ...input, submission_id }));
  });
}
