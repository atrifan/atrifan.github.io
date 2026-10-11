import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { approveSteering } from '@/src/lib/jobs/steering-service';

type Ctx = { params: { id: string; sid: string } };

/**
 * The customer approves the provider's re-estimate of a scope change: the new contract version
 * becomes current. If the price went up, `checkout_url` is a Stripe Checkout for the top-up.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await approveSteering(userId, params.id, params.sid)));
}
