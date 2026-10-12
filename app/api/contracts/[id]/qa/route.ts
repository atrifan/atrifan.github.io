import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { getContractForParty } from '@/src/lib/jobs/room-service';
import { qaStatus } from '@/src/lib/qa/submission-service';

type Ctx = { params: { id: string } };

/**
 * QA for the job room: submissions (attempt, repo, pinned commit, status) and every verdict
 * with its reason. Never the PAT. 404 unknown contract, 403 not a party.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const { contract } = await getContractForParty(userId, params.id);
    return NextResponse.json(await qaStatus(userId, { contract_id: contract.id }));
  });
}
