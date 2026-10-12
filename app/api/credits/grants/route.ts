import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { creditGrantView } from '@/src/lib/credits/grant-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/credits/grants: the signed-in user's monthly plan credits: this period's grant,
 * how much of it is left and when it expires, and past grants with what expired.
 */
export async function GET(request: NextRequest) {
  return withUser(request, async (userId) => NextResponse.json(await creditGrantView(userId)));
}
