import { NextRequest, NextResponse } from 'next/server';
import { parseBody, readJson, withUser } from '@/src/lib/jobs/http';
import { contractIdParam } from '@/src/lib/delivery/contract-data';
import { pushDelivery, pushSchema } from '@/src/lib/delivery/delivery-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: { id: string } };

/**
 * POST /api/contracts/[id]/delivery/push {repo, token}: push the QA'd commit's files into the
 * customer's empty private repo with their fine-grained write PAT (purged right after).
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const body = parseBody(pushSchema, await readJson(request));
    return NextResponse.json(await pushDelivery(userId, contractIdParam(params), body));
  });
}
