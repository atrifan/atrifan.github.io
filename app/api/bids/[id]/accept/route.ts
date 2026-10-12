import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { AcceptBidSchema } from '@/src/lib/jobs/schemas';
import { acceptBid } from '@/src/lib/jobs/contracts-service';
import { CONSENT_REQUIRED } from '@/src/lib/legal/consent';

type Ctx = { params: { id: string } };

/**
 * Accept a bid on your job: creates the contract (v1) and returns a Stripe Checkout URL.
 * Optional `qa_checks` (src/config/qa.config.ts) are stored on the version; the response's
 * `qa.reserve` is what QA will hold from the customer's credits at submission.
 * `withdrawal_consent: true` is required (400 consent_required otherwise, the bid stays active);
 * the consent is recorded with the contract and goes into the Checkout metadata.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return withUser(request, async (userId) => {
    const { qa_checks, withdrawal_consent } = parseBody(AcceptBidSchema, await readJson(request));
    if (withdrawal_consent !== true) return NextResponse.json(CONSENT_REQUIRED, { status: 400 });
    return NextResponse.json(await acceptBid(userId, params.id, { qaChecks: qa_checks, withdrawalConsent: true }), { status: 201 });
  });
}
