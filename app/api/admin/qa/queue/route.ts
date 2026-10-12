import { NextRequest, NextResponse } from 'next/server';
import { withQaAdmin } from '@/src/lib/qa/admin-http';
import { listQueue } from '@/src/lib/qa/qa-review-service';
import { JobsError } from '@/src/lib/jobs/errors';

export const dynamic = 'force-dynamic';

/** GET ?status=awaiting_qa|in_review|validated|requires_changes|rejected&limit=1..100 → { items }. Admins only. */
export async function GET(request: NextRequest) {
  return withQaAdmin(request, async () => {
    const params = request.nextUrl.searchParams;
    const args: Record<string, unknown> = {};
    const status = params.get('status');
    if (status) args.status = status;
    const limit = params.get('limit');
    if (limit !== null) {
      if (!/^\d+$/.test(limit)) throw new JobsError('invalid_request', 400, 'limit must be a whole number');
      args.limit = Number(limit);
    }
    return NextResponse.json(await listQueue(args));
  });
}
