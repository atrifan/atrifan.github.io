import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { regenerateTopup } from '@/src/lib/jobs/steering-service';

type Ctx = { params: { id: string; sid: string } };

/**
 * The customer gets a new top-up Checkout for an approved scope change whose top-up is unpaid
 * (e.g. the last Checkout expired, which keeps the work paused). → `{ checkout_url, steering }`;
 * 409 when there is nothing to pay.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await regenerateTopup(userId, params.id, params.sid)));
}
