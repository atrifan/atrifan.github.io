/** Job and offer cards for the gigs listing. Minimal, the whole card is the link. */
import Link from 'next/link';
import { deadlineLabel, formatBudget, formatEuros, jobStatusLabel, postedAgo } from '@/src/lib/jobs/client/format';
import type { JobWithBidCount } from '@/src/lib/jobs/jobs-service';
import type { OfferCardData } from '@/src/lib/jobs/ui/loaders';
import type { TrustBadgeData } from '@/src/lib/trust/badges';
import { Avatar, CategoryLabel, StripeBadge, TrustBadge } from './ui';

function bidCountLabel(n: number): string {
  if (n === 0) return 'No bids yet';
  return n === 1 ? '1 bid' : `${n} bids`;
}

export function JobCard({ job, href, now, trust }: { job: JobWithBidCount; href: string; now: Date; trust?: TrustBadgeData }) {
  return (
    <article className="gig-card" aria-labelledby={`job-${job.id}`}>
      <p className="gig-labels">
        <CategoryLabel category={job.category} />
        <span className="gig-label">Fixed price</span>
        {job.status !== 'open' ? (
          <span className="gig-label">{jobStatusLabel(job.status)}</span>
        ) : null}
      </p>
      <h3 className="gig-card-title" id={`job-${job.id}`}>
        <Link className="gig-card-link" href={href}>
          {job.title}
        </Link>
      </h3>
      <p className="gig-card-desc">{job.description}</p>
      <p className="gig-card-price">{formatBudget(job.budget_min_cents, job.budget_max_cents)}</p>
      <p className="gig-card-meta">
        <span>{deadlineLabel(job.deadline)}</span>
        <span>{bidCountLabel(job.bid_count)}</span>
      </p>
      <div className="gig-card-foot">
        <TrustBadge {...trust} />
        <time dateTime={job.created_at}>{postedAgo(job.created_at, now)}</time>
      </div>
    </article>
  );
}

export function OfferCard({ offer, trust }: { offer: OfferCardData; trust?: TrustBadgeData }) {
  const days = offer.delivery_days;
  return (
    <article className="gig-card" aria-labelledby={`offer-${offer.id}`}>
      <p className="gig-labels">
        <CategoryLabel category={offer.category} />
        {offer.tags.map((tag) => (
          <span key={tag} className="gig-label">
            {tag}
          </span>
        ))}
      </p>
      <h3 className="gig-card-title" id={`offer-${offer.id}`}>
        {offer.title}
      </h3>
      <p className="gig-card-desc">{offer.description}</p>
      <p className="gig-card-price">{formatEuros(offer.price_cents)}</p>
      <p className="gig-card-meta">
        <span>{`Delivery in ${days} ${days === 1 ? 'day' : 'days'}`}</span>
      </p>
      <div className="gig-card-foot">
        <span className="gig-provider">
          <Avatar name={offer.provider_name} />
          <span>{offer.provider_name}</span>
        </span>
        {offer.stripe_linked ? <StripeBadge /> : null}
        {trust ? <TrustBadge {...trust} /> : null}
      </div>
    </article>
  );
}
