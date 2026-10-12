import { NextRequest } from 'next/server';
import { withCron } from '@/src/lib/delivery/cron-auth';
import { recomputeAllTrust } from '@/src/lib/trust/trust-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** GET|POST /api/cron/trust-decay (nightly, Bearer $CRON_SECRET): recompute every trust score so time decay applies. */
async function handle(request: NextRequest) {
  return withCron(request, 'trust-decay', () => recomputeAllTrust());
}

export const GET = handle;
export const POST = handle;
