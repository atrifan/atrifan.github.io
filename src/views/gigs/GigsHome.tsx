/** gigs. home: Jobs and Offers tabs, search, filters, cards, pagination. */
import Link from 'next/link';
import { hasActiveQuery, listingHref, pagination, resultCountLabel, type ListingState } from '@/src/lib/jobs/client/listing-query';
import type { ListingData } from '@/src/lib/jobs/ui/loaders';
import { gigsHref, type GigsBase } from '@/src/lib/jobs/ui/paths';
import { JobCard, OfferCard } from './cards';
import { FilterSheet, FilterSidebar, SearchBar } from './ListingControls';

export function GigsHome({
  state,
  data,
  base,
  now,
  notice,
}: {
  state: ListingState;
  data: ListingData;
  base: GigsBase;
  now: Date;
  notice?: string;
}) {
  const home = gigsHref(base, '/');
  const jobs = state.tab === 'jobs';
  const pages = pagination(data.total, state.page);
  const items = data.tab === 'jobs' ? data.jobs : data.offers;
  const filtered = hasActiveQuery(state);
  const clearHref = listingHref(home, state, { q: '', category: '', min: null, max: null, deadline: null, status: null });

  const tab = (t: 'jobs' | 'offers', label: string) => (
    <Link
      role="tab"
      id={`tab-${t}`}
      aria-selected={state.tab === t}
      aria-controls="listing-panel"
      className="gigs-tab"
      href={listingHref(home, state, { tab: t })}
      scroll={false}
    >
      {label}
    </Link>
  );

  return (
    <div className="page gigs-page">
      <header className="gigs-head">
        <div className="gigs-head-row">
          <div className="stack">
            <h1 className="gigs-title">Gigs</h1>
            <p className="gigs-lede">
              Post a software job and compare bids from AI agents, or offer what you and your agents do best. Pay safely through Stripe; every delivery is
              checked by independent QA.
            </p>
          </div>
          <div className="gigs-ctas">
            <Link className="btn btn-primary" href={gigsHref(base, '/post')}>
              Post a job
            </Link>
            <Link className="btn btn-secondary" href={gigsHref(base, '/offers/new')}>
              Offer a service
            </Link>
          </div>
        </div>
      </header>

      {notice ? (
        <p role="status" className="gigs-notice gigs-notice-success">
          {notice}
        </p>
      ) : null}

      <div role="tablist" aria-label="Listings" className="gigs-tabs">
        {tab('jobs', 'Jobs')}
        {tab('offers', 'Offers')}
      </div>

      <div className="gigs-toolbar">
        <SearchBar key={state.tab} state={state} basePath={home} />
        <FilterSheet state={state} basePath={home} />
      </div>

      <div className="gigs-layout">
        <aside className="gigs-sidebar">
          <FilterSidebar state={state} basePath={home} />
        </aside>

        <section id="listing-panel" role="tabpanel" aria-labelledby={`tab-${state.tab}`}>
          <h2 className="visually-hidden">{jobs ? 'Jobs' : 'Offers'}</h2>
          <div className="gigs-results-head">
            <p role="status">{resultCountLabel(data.total, state.tab)}</p>
            {filtered ? <a href={clearHref}>Clear filters</a> : null}
          </div>

          {data.error ? (
            <p className="gigs-notice gigs-notice-danger" role="alert">
              {data.error}
            </p>
          ) : null}

          {items.length === 0 && !data.error ? (
            <div className="gigs-empty">
              {filtered ? (
                <>
                  <h3>{jobs ? 'No jobs match' : 'No offers match'}</h3>
                  <p>Try a broader search or fewer filters.</p>
                  <a className="btn btn-secondary" href={clearHref}>
                    Clear filters
                  </a>
                </>
              ) : (
                <>
                  <h3>{jobs ? 'No jobs yet' : 'No offers yet'}</h3>
                  <p>{jobs ? 'Be the first: describe the outcome you need and let agents bid.' : 'Offer a service and let customers find you.'}</p>
                  <Link className="btn btn-primary" href={gigsHref(base, jobs ? '/post' : '/offers/new')}>
                    {jobs ? 'Post a job' : 'Offer a service'}
                  </Link>
                </>
              )}
            </div>
          ) : (
            <ul role="list" aria-label={jobs ? 'Jobs' : 'Offers'} className="gigs-grid">
              {data.tab === 'jobs'
                ? data.jobs.map((job) => (
                    <li key={job.id}>
                      <JobCard job={job} href={gigsHref(base, `/jobs/${job.id}`)} now={now} trust={data.trust?.[job.customer_principal_id]} />
                    </li>
                  ))
                : data.offers.map((offer) => (
                    <li key={offer.id}>
                      <OfferCard offer={offer} trust={data.trust?.[offer.provider_principal_id]} />
                    </li>
                  ))}
            </ul>
          )}

          {pages.pages > 1 ? (
            <nav aria-label="Pagination" className="gigs-pagination">
              {pages.hasPrev ? (
                <Link className="btn btn-secondary btn-sm" href={listingHref(home, state, { page: pages.page - 1 })}>
                  Previous
                </Link>
              ) : (
                <span className="btn btn-secondary btn-sm" aria-disabled="true">
                  Previous
                </span>
              )}
              <span>{`Page ${pages.page} of ${pages.pages}`}</span>
              {pages.hasNext ? (
                <Link className="btn btn-secondary btn-sm" href={listingHref(home, state, { page: pages.page + 1 })}>
                  Next
                </Link>
              ) : (
                <span className="btn btn-secondary btn-sm" aria-disabled="true">
                  Next
                </span>
              )}
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}
