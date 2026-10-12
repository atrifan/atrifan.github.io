/** A job's public page: the approved spec, plus the bid form or the owner's bid comparison. */
import Link from 'next/link';
import { deadlineLabel, formatBudget, formatEuros, jobStatusLabel, postedAgo } from '@/src/lib/jobs/client/format';
import type { JobPageData } from '@/src/lib/jobs/ui/loaders';
import { gigsHref, type GigsBase } from '@/src/lib/jobs/ui/paths';
import type { QaCheck } from '@/src/config/qa.config';
import { BidCompare, type CompareBid } from './BidCompare';
import { BidForm } from './BidForm';
import { CategoryLabel, TrustBadge } from './ui';

const SENSITIVITY: Record<string, string> = {
  public: 'Public data',
  internal: 'Internal data',
  confidential: 'Confidential data',
};

function SpecSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="gigs-section">
      <h2 className="gigs-section-title">{title}</h2>
      <ul className="gigs-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function JobDetail({
  data,
  base,
  now,
  viewerId,
  signInUrl,
  profileUrl,
  bps,
  bounds,
  qaCosts,
  published,
}: {
  data: JobPageData;
  base: GigsBase;
  now: Date;
  viewerId: string | null;
  signInUrl: string;
  profileUrl: string;
  bps: number;
  bounds: { minCents: number; maxCents: number };
  qaCosts: Record<QaCheck, number>;
  published: boolean;
}) {
  const { job, spec, bidCount, isOwner, myBid, bids, contractId } = data;
  const min = spec?.budget_min_cents ?? job.budget_min_cents;
  const max = spec?.budget_max_cents ?? job.budget_max_cents;
  const deadline = spec?.deadline ?? job.deadline;
  const open = job.status === 'open';
  const compare: CompareBid[] = bids.map((b) => ({
    id: b.id,
    price_cents: b.price_cents,
    customer_total_cents: b.pricing.customer_total_cents,
    eta_days: b.eta_days,
    plan: b.plan,
    deliverables: b.deliverables,
    assumptions: b.assumptions,
    included_steering_credits: b.included_steering_credits,
    status: b.status,
    created_at: b.created_at,
    trust_score: data.trust[b.provider_principal_id]?.score ?? null,
    trust: data.trust[b.provider_principal_id],
    headline: b.provider.headline,
  }));

  let action: React.ReactNode;
  if (isOwner) {
    action =
      job.status === 'draft' ? (
        <section className="gigs-panel">
          <h2 className="gigs-panel-title">This job is a draft</h2>
          <p className="gigs-hint">Only you can see it. Finish the spec and publish it to receive bids.</p>
          <Link className="btn btn-primary" href={gigsHref(base, `/post?job=${job.id}&step=edit`)}>
            Continue editing
          </Link>
        </section>
      ) : contractId ? (
        <section className="gigs-panel">
          <h2 className="gigs-panel-title">You accepted a bid</h2>
          <Link className="btn btn-primary" href={gigsHref(base, `/contracts/${contractId}`)}>
            View contract
          </Link>
        </section>
      ) : (
        <section className="gigs-panel">
          <h2 className="gigs-panel-title">Your job</h2>
          <p className="gigs-hint">{open ? 'Open for bids. Compare the bids on this page and accept the one you like; you pay only then.' : `This job is ${jobStatusLabel(job.status).toLowerCase()}.`}</p>
        </section>
      );
  } else if (!viewerId) {
    action = (
      <section className="gigs-panel">
        <h2 className="gigs-panel-title">Want this job?</h2>
        <p className="gigs-hint">Sign in, link Stripe once, and bid yourself or through your agent with the Jobs MCP.</p>
        <a className="btn btn-primary" href={signInUrl}>
          Sign in to bid
        </a>
        <Link href={gigsHref(base, '/docs/mcp')}>Bid with an AI agent</Link>
      </section>
    );
  } else if (myBid) {
    action = (
      <section className="gigs-panel">
        <h2 className="gigs-panel-title">Your bid</h2>
        <p className="gigs-notice gigs-notice-success">{`You have an active bid on this job: ${formatEuros(myBid.price_cents)}, delivery in ${myBid.eta_days} ${myBid.eta_days === 1 ? 'day' : 'days'}.`}</p>
      </section>
    );
  } else if (open) {
    action = <BidForm jobId={job.id} bps={bps} bounds={bounds} profileUrl={profileUrl} />;
  } else {
    action = (
      <section className="gigs-panel">
        <h2 className="gigs-panel-title">Not accepting bids</h2>
        <p className="gigs-hint">{`This job is ${jobStatusLabel(job.status).toLowerCase()}.`}</p>
      </section>
    );
  }

  return (
    <div className="page gigs-page">
      <a className="gigs-back" href={base || '/'}>
        ← All gigs
      </a>
      {published ? (
        <p role="status" className="gigs-notice gigs-notice-success">
          Your job is live. Agents can now read the spec and bid.
        </p>
      ) : null}
      <div className="gigs-detail">
        <div className="gigs-detail-main">
          <header className="gigs-head">
            <p className="gig-labels">
              <span className="gig-status">{jobStatusLabel(job.status)}</span>
              <CategoryLabel category={job.category} />
            </p>
            <h1 className="gigs-title">{job.title}</h1>
            <p className="gig-card-meta">
              <time dateTime={job.created_at}>{postedAgo(job.created_at, now)}</time>
              <TrustBadge {...data.trust[job.customer_principal_id]} />
            </p>
          </header>
          <dl className="gigs-facts">
            <div className="gigs-fact">
              <dt>Budget</dt>
              <dd>{formatBudget(min, max)}</dd>
            </div>
            <div className="gigs-fact">
              <dt>Deadline</dt>
              <dd>{deadlineLabel(deadline)}</dd>
            </div>
            <div className="gigs-fact">
              <dt>Bids</dt>
              <dd>{bidCount === 0 ? 'No bids yet' : bidCount === 1 ? '1 bid' : `${bidCount} bids`}</dd>
            </div>
          </dl>
          <section className="gigs-section">
            <h2 className="gigs-section-title">The job</h2>
            <p className="gigs-prose">{job.description}</p>
          </section>
          {spec ? (
            <>
              <SpecSection title="Requirements" items={spec.requirements} />
              <SpecSection title="Deliverables" items={spec.deliverables} />
              <SpecSection title="Acceptance criteria" items={spec.acceptance_criteria} />
              <SpecSection title="Constraints" items={spec.constraints} />
              <SpecSection title="Permitted tools" items={spec.permitted_tools} />
              <section className="gigs-section">
                <h2 className="gigs-section-title">Security</h2>
                <p>
                  {SENSITIVITY[spec.security.data_sensitivity] ?? spec.security.data_sensitivity}
                  {spec.security.secrets_allowed ? ' · real secrets or credentials are needed' : ' · no real secrets or credentials'}
                </p>
                {spec.security.notes ? <p className="gigs-prose gigs-hint">{spec.security.notes}</p> : null}
              </section>
            </>
          ) : null}
          {isOwner && job.status !== 'draft' ? <BidCompare jobId={job.id} bids={compare} canAccept={open} qaCosts={qaCosts} /> : null}
        </div>
        <aside className="gigs-detail-aside">{action}</aside>
      </div>
    </div>
  );
}
