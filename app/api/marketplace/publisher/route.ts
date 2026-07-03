import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPublisherStats } from '@/src/lib/marketplace-service';

/**
 * Publisher analytics for the logged-in user: per-package download counts,
 * ratings, and moderation status. Powers the "Publisher" view in the control
 * panel. Clerk-authenticated (web UI).
 *
 *   GET /api/marketplace/publisher
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const packages = await getPublisherStats(userId);
    const totals = packages.reduce(
      (acc, p) => {
        acc.installs += p.install_count;
        acc.ratings += p.rating_count;
        return acc;
      },
      { installs: 0, ratings: 0 }
    );
    return NextResponse.json({ packages, totals });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load stats' }, { status: 500 });
  }
}
