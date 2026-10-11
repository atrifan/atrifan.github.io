import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { getContractDetail } from '@/src/lib/jobs/room-service';

type Ctx = { params: { id: string } };

/** A contract for its parties: current version, version history, spec, pause and steering-credit state. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await getContractDetail(userId, params.id)));
}
