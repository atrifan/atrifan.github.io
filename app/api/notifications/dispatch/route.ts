import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { dispatchQueued } from '@/src/lib/notify/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET|POST /api/notifications/dispatch — drains due rows from the notifications outbox.
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`.
 */

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const raw = Number(request.nextUrl.searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 50;
  try {
    return NextResponse.json(await dispatchQueued(limit));
  } catch (err) {
    console.error('[notify] dispatch failed', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Dispatch failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
