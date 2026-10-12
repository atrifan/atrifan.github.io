import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { contractIdParam } from '@/src/lib/delivery/contract-data';
import { getDeliveryView } from '@/src/lib/delivery/delivery-service';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * GET /api/contracts/[id]/delivery: the delivery for either party: QA report and warnings,
 * attempt and contract version history, payment/payout/dispute state and allowed actions.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await getDeliveryView(userId, contractIdParam(params))));
}
