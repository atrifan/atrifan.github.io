import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { getConnectStatus } from '@/src/lib/jobs/stripe-connect';

// Per-user data behind Clerk auth: never prerender or cache.
export const dynamic = 'force-dynamic';

/** The caller's Connect status. `?refresh=1` re-reads the account from Stripe first. */
export async function GET(request: NextRequest) {
  return withUser(request, async (userId) => {
    const refresh = ['1', 'true'].includes(request.nextUrl.searchParams.get('refresh') ?? '');
    return NextResponse.json(await getConnectStatus(userId, { refresh }));
  });
}
