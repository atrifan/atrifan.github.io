import { NextRequest, NextResponse } from 'next/server';
import { withQaAdmin } from '@/src/lib/qa/admin-http';
import { getDisputeDetail } from '@/src/lib/disputes/dispute-service';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** GET /api/admin/disputes/[id]: a dispute with the contract's money state and resolution previews. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withQaAdmin(request, async () => NextResponse.json(await getDisputeDetail(params.id)));
}
