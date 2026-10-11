import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { CreateBidSchema } from '@/src/lib/jobs/schemas';
import { placeBid, listBidsForOwner } from '@/src/lib/jobs/bids-service';

type Ctx = { params: { id: string } };

/** Place a bid. 403 connect_required until the caller's Stripe payouts are enabled. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const input = parseBody(CreateBidSchema, await readJson(request));
    return NextResponse.json(await placeBid(userId, params.id, input), { status: 201 });
  });
}

/** The job owner's bid comparison view. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json({ bids: await listBidsForOwner(userId, params.id) }));
}
