import { NextRequest, NextResponse } from 'next/server';
import { withQaAdmin } from '@/src/lib/qa/admin-http';
import { JobsError } from '@/src/lib/jobs/errors';
import { listThreads, type ThreadSource, type ThreadStatus } from '@/src/lib/support/support-service';

export const dynamic = 'force-dynamic';

const SOURCES: readonly ThreadSource[] = ['complaint', 'email'];
const STATUSES: readonly ThreadStatus[] = ['open', 'answered', 'closed'];

/** GET /api/admin/inbox?source=complaint|email&status=open|answered|closed → `{ threads }`, newest first (admins only). */
export async function GET(request: NextRequest) {
  return withQaAdmin(request, async () => {
    const sp = request.nextUrl.searchParams;
    const source = sp.get('source') || undefined;
    const status = sp.get('status') || undefined;
    if (source && !SOURCES.includes(source as ThreadSource)) throw new JobsError('invalid_request', 400, 'source must be complaint or email');
    if (status && !STATUSES.includes(status as ThreadStatus)) throw new JobsError('invalid_request', 400, 'status must be open, answered or closed');
    return NextResponse.json({ threads: await listThreads({ source: source as ThreadSource | undefined, status: status as ThreadStatus | undefined }) });
  });
}
