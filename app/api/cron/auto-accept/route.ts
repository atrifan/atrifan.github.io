import { NextRequest } from 'next/server';
import { withCron } from '@/src/lib/delivery/cron-auth';
import { runAutoAccept } from '@/src/lib/delivery/acceptance-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET|POST /api/cron/auto-accept (daily, Bearer $CRON_SECRET): accept deliveries whose
 * JOBS_AUTO_ACCEPT_DAYS ran out (paying the provider), send the 48-hour reminders, and retry
 * failed payouts. Disputed contracts are skipped.
 */
async function handle(request: NextRequest) {
  return withCron(request, 'auto-accept', () => runAutoAccept());
}

export const GET = handle;
export const POST = handle;
