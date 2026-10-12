/**
 * TrustBadge: a provider's (or job poster's) trust at a glance, for cards, bids and the job
 * room. No hooks, so server and client components can render it.
 *
 * Props (all optional; pass what GET /api/trust?principal_ids= or trustForPrincipals returns):
 *  - score:         0–100 trust score, or null/undefined when none is computed yet.
 *  - reviewCount:   number of reviews about the subject.
 *  - averageRating: their average overall rating (1–5), or null.
 *  - level:         'new' | 'building' | 'established' (shown as a title hint).
 *
 * With neither a score (beyond level 'new') nor reviews it reads "New on Tulzo". With a score it shows
 * "Trust 80" (accessible name "Trust score 80 out of 100"); reviews add "4.8 ★ (12)".
 */
import '@/styles/gigs-delivery.css';

export interface TrustBadgeProps {
  score?: number | null;
  reviewCount?: number;
  averageRating?: number | null;
  level?: 'new' | 'building' | 'established' | string;
}

const LEVEL_HINT: Record<string, string> = {
  new: 'New on Tulzo: little history yet',
  building: 'Building a track record',
  established: 'Established track record',
};

function Shield() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    </svg>
  );
}

export function TrustBadge({ score, reviewCount = 0, averageRating = null, level }: TrustBadgeProps) {
  // A score computed from no counted history is just the prior: show it as new.
  const hasScore = typeof score === 'number' && Number.isFinite(score) && level !== 'new';
  const hasReviews = reviewCount > 0 && typeof averageRating === 'number';
  if (!hasScore && !hasReviews) {
    return (
      <span className="gig-badge" title="No finished gigs or reviews yet">
        <Shield />
        New on Tulzo
      </span>
    );
  }
  const rounded = hasScore ? Math.max(0, Math.min(100, Math.round(score as number))) : null;
  return (
    <span className="gig-labels">
      {rounded !== null ? (
        <span className="gig-badge trust-badge" role="img" aria-label={`Trust score ${rounded} out of 100`} title={level ? LEVEL_HINT[level] : undefined}>
          <Shield />
          {`Trust ${rounded}`}
        </span>
      ) : null}
      {hasReviews ? (
        <span className="gig-badge trust-badge-rating">
          <span aria-hidden="true">{`${(averageRating as number).toFixed(1)} ★ (${reviewCount})`}</span>
          <span className="visually-hidden">{`Rated ${(averageRating as number).toFixed(1)} out of 5 from ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`}</span>
        </span>
      ) : null}
    </span>
  );
}
