import { NextRequest } from 'next/server';
import { withCron } from '@/src/lib/delivery/cron-auth';
import { runGrantCron } from '@/src/lib/credits/grant-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET|POST /api/cron/credit-grants (daily, Bearer $CRON_SECRET): the fallback for missed Clerk
 * webhooks. Grants this month's plan credits to active subscribers that don't have them yet,
 * then expires the unused part of grants whose period ended.
 */
async function handle(request: NextRequest) {
  return withCron(request, 'credit-grants', () => runGrantCron());
}

export const GET = handle;
export const POST = handle;
