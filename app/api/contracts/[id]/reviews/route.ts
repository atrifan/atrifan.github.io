import { NextRequest, NextResponse } from 'next/server';
import { readJson, withUser } from '@/src/lib/jobs/http';
import { contractIdParam } from '@/src/lib/delivery/contract-data';
import { listContractReviews, submitReview } from '@/src/lib/reviews/review-service';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** GET /api/contracts/[id]/reviews: the contract's reviews, for its parties. */
export async function GET(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => NextResponse.json(await listContractReviews(userId, contractIdParam(params))));
}

/**
 * POST /api/contracts/[id]/reviews {overall, quality, communication, timeliness, body?}: one
 * review per party per contract, after acceptance or resolution. 201; 409 already_reviewed.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const result = await submitReview(userId, contractIdParam(params), await readJson(request));
    return NextResponse.json(result, { status: 201 });
  });
}
