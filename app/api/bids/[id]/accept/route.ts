import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { AcceptBidSchema } from '@/src/lib/jobs/schemas';
import { acceptBid } from '@/src/lib/jobs/contracts-service';

type Ctx = { params: { id: string } };

/**
 * Accept a bid on your job: creates the contract (v1) and returns a Stripe Checkout URL.
 * Optional `qa_checks` (src/config/qa.config.ts) are stored on the version; the response's
 * `qa.reserve` is what QA will hold from the customer's credits at submission.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const { qa_checks } = parseBody(AcceptBidSchema, await readJson(request));
    return NextResponse.json(await acceptBid(userId, params.id, { qaChecks: qa_checks }), { status: 201 });
  });
}
