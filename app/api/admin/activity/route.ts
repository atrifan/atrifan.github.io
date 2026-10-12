import { NextRequest, NextResponse } from 'next/server';
import { loadAdminActivity } from '@/src/lib/activity/admin-activity-service';
import { parseRange } from '@/src/lib/activity/totals';
import { clerkAdmin } from '@/src/lib/qa/admin-auth';
import { badRequest, forbidden, sessionUserId, unauthorized, unavailable } from '@/src/lib/session-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/activity?from=YYYY-MM-DD&to=YYYY-MM-DD (admins; default: the last 30 days)
 *   → { range, currency, totals, installs, publishes, payments, payouts, refunds, disputes }
 */
export async function GET(request: NextRequest) {
  const userId = await sessionUserId(request);
  if (!userId) return unauthorized();
  if (!(await clerkAdmin(userId))) return forbidden();
  const params = request.nextUrl.searchParams;
  const range = parseRange(params.get('from'), params.get('to'), new Date());
  if (!range.ok) return badRequest(range.error);
  try {
    return NextResponse.json(await loadAdminActivity(range.range), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return unavailable('admin/activity', err);
  }
}
