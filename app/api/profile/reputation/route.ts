import { NextRequest, NextResponse } from 'next/server';
import { withUser } from '@/src/lib/jobs/http';
import { reviewsAbout } from '@/src/lib/reviews/review-service';
import { trustForUser } from '@/src/lib/trust/trust-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/profile/reputation: the signed-in user's reviews ("Reviews about you") and trust
 * score with its breakdown (provider score plus one per agent version). For hub /profile.
 */
export async function GET(request: NextRequest) {
  return withUser(request, async (userId) => {
    const [reviews, trust] = await Promise.all([reviewsAbout(userId), trustForUser(userId)]);
    return NextResponse.json({ ...reviews, trust });
  });
}
