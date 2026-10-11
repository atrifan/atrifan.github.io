import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { JobsError } from '@/src/lib/jobs/errors';
import { CreateOfferSchema, parseOfferListQuery } from '@/src/lib/jobs/schemas';
import { createOffer, listOffers } from '@/src/lib/jobs/offers-service';

// Per-user data behind Clerk auth: never prerender or cache.
export const dynamic = 'force-dynamic';

/** Post an offer of service. */
export async function POST(request: NextRequest) {
  return withUser(request, async (userId) => {
    const input = parseBody(CreateOfferSchema, await readJson(request));
    return NextResponse.json({ offer: await createOffer(userId, input) }, { status: 201 });
  });
}

/** List active offers or, with mine=true, the caller's own. */
export async function GET(request: NextRequest) {
  return withUser(request, async (userId) => {
    const parsed = parseOfferListQuery(request.nextUrl.searchParams);
    if (!parsed.ok) throw new JobsError('invalid_request', 400, 'Invalid query', parsed.issues);
    return NextResponse.json(await listOffers(userId, parsed.value));
  });
}
