import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { trustForPrincipals } from '@/src/lib/trust/trust-service';
import { ratingsForPrincipals } from '@/src/lib/reviews/review-service';

export const dynamic = 'force-dynamic';

const ids = z.array(z.string().uuid()).min(1).max(100);

/**
 * GET /api/trust?principal_ids=a,b: public badge data for providers and job posters (score,
 * level, review count and average). Unknown ids are simply absent. No auth: it is what the
 * public gig cards show.
 */
export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get('principal_ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const parsed = ids.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request', message: 'principal_ids must be 1 to 100 UUIDs' }, { status: 400 });
  try {
    const [trust, ratings] = await Promise.all([trustForPrincipals(parsed.data), ratingsForPrincipals(parsed.data)]);
    const badges: Record<string, { score: number | null; level: string; review_count: number; average_rating: number | null }> = {};
    for (const id of parsed.data) {
      const t = trust.get(id);
      const r = ratings.get(id);
      if (!t && !r) continue;
      badges[id] = {
        score: t ? t.score : null,
        level: t ? t.level : 'new',
        review_count: r?.count ?? 0,
        average_rating: r?.average ?? null,
      };
    }
    return NextResponse.json({ badges }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch (err) {
    console.error('[trust] badge lookup failed:', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'internal_error', message: 'Something went wrong' }, { status: 500 });
  }
}
