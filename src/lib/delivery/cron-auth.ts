/**
 * Auth for the Phase 5 cron routes (app/api/cron/*). Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET every call is refused.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function withCron(request: Request, name: string, fn: () => Promise<unknown>): Promise<NextResponse> {
  if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await fn());
  } catch (err) {
    console.error(`[cron/${name}] failed:`, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: `${name} failed` }, { status: 500 });
  }
}
