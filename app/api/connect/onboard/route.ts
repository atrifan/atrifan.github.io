import { NextRequest, NextResponse } from 'next/server';
import { withUser, readJson, parseBody } from '@/src/lib/jobs/http';
import { ConnectOnboardSchema } from '@/src/lib/jobs/schemas';
import { startOnboarding } from '@/src/lib/jobs/stripe-connect';

/**
 * Start (or continue) Stripe Connect Express onboarding. Returns an onboarding link, or a
 * dashboard login link once payouts are enabled. EEA/UK/CH only.
 */
export async function POST(request: NextRequest) {
  return withUser(request, async (userId) => {
    const { country } = parseBody(ConnectOnboardSchema, await readJson(request));
    return NextResponse.json(await startOnboarding(userId, country));
  });
}
