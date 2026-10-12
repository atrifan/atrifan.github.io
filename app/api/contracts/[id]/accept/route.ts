import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { contractIdParam } from '@/src/lib/delivery/contract-data';
import { acceptContract } from '@/src/lib/delivery/acceptance-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** POST /api/contracts/[id]/accept: the customer accepts the delivery; the provider is paid. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await acceptContract(userId, contractIdParam(params))));
}
