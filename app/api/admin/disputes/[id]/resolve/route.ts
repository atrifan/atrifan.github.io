import { NextRequest, NextResponse } from 'next/server';
import { readJson } from '@/src/lib/jobs/http';
import { withQaAdmin } from '@/src/lib/qa/admin-http';
import { resolveDispute } from '@/src/lib/disputes/dispute-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * POST /api/admin/disputes/[id]/resolve {outcome: release|partial_refund|full_refund,
 * refund_cents?, note}: an admin decides. Before the payout: refund and/or transfer; after
 * it: transfer reversal plus refund. Safe to retry.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withQaAdmin(request, async (adminUserId) => NextResponse.json(await resolveDispute(adminUserId, params.id, await readJson(request))));
}
