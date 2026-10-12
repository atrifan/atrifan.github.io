/**
 * Badge data for gig cards, bids and job posters: stored trust score (providers) plus the
 * review count and average (anyone). Best effort: a failed read means "no badge data", never
 * a broken page. The shape matches the TrustBadge component's props.
 */
import { trustForPrincipals } from './trust-service';
import { ratingsForPrincipals } from '../reviews/review-service';

export interface TrustBadgeData {
  score: number | null;
  level: 'new' | 'building' | 'established';
  reviewCount: number;
  averageRating: number | null;
}

export async function badgesForPrincipals(principalIds: Array<string | null | undefined>): Promise<Record<string, TrustBadgeData>> {
  const ids = Array.from(new Set(principalIds.filter((x): x is string => !!x)));
  if (ids.length === 0) return {};
  try {
    const [trust, ratings] = await Promise.all([trustForPrincipals(ids), ratingsForPrincipals(ids)]);
    const out: Record<string, TrustBadgeData> = {};
    for (const id of ids) {
      const t = trust.get(id);
      const r = ratings.get(id);
      if (!t && !r) continue;
      out[id] = { score: t?.score ?? null, level: t?.level ?? 'new', reviewCount: r?.count ?? 0, averageRating: r?.average ?? null };
    }
    return out;
  } catch (err) {
    console.error('[trust] badge data failed:', err instanceof Error ? err.message : 'error');
    return {};
  }
}
