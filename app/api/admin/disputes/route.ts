import { NextRequest, NextResponse } from 'next/server';
import { withQaAdmin } from '@/src/lib/qa/admin-http';
import { listDisputesForAdmin } from '@/src/lib/disputes/dispute-service';

export const dynamic = 'force-dynamic';

/** GET /api/admin/disputes?status=open|resolved|all&limit=: the hub /admin/disputes queue (admins only). */
export async function GET(request: NextRequest) {
  return withQaAdmin(request, async () => {
    const sp = request.nextUrl.searchParams;
    const limit = sp.get('limit');
    return NextResponse.json(await listDisputesForAdmin({ status: sp.get('status') ?? undefined, limit: limit ? Number(limit) : undefined }));
  });
}
