import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { acceptBid } from '@/src/lib/jobs/contracts-service';

type Ctx = { params: { id: string } };

/** Accept a bid on your job: creates the contract (v1) and returns a Stripe Checkout URL. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await acceptBid(userId, params.id), { status: 201 }));
}
