import { NextRequest, NextResponse } from 'next/server';
import { readJson, withUser } from '@/src/lib/jobs/http';
import { contractIdParam } from '@/src/lib/delivery/contract-data';
import { openDispute } from '@/src/lib/disputes/dispute-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * POST /api/contracts/[id]/dispute {category, reason, evidence?}: the customer opens a
 * structured dispute (before acceptance it pauses auto-accept and the payout; after it, a claim
 * within JOBS_POST_ACCEPT_CLAIM_DAYS). 201 with the dispute.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const dispute = await openDispute(userId, contractIdParam(params), await readJson(request));
    return NextResponse.json({ dispute }, { status: 201 });
  });
}
