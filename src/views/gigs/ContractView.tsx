/** A contract for its two parties: summary, checkout return states and the job room (always on). */
import Link from 'next/link';
import { contractStatusLabel, deadlineLabel, formatEuros } from '@/src/lib/jobs/client/format';
import { percentFromBps } from '@/src/lib/jobs/client/pricing';
import type { ContractPageData } from '@/src/lib/jobs/ui/loaders';
import { gigsHref, type GigsBase } from '@/src/lib/jobs/ui/paths';
import { ContractQaChecks } from './ContractQaChecks';
import { JobRoom } from './JobRoom';
import { GigsWindowsNote } from './GigsWindowsNote';

export function ContractView({
  data,
  base,
  checkout,
  windowsNotice,
}: {
  data: ContractPageData;
  base: GigsBase;
  checkout: 'success' | 'cancelled' | null;
  /** gigsConfig().windowsNotice */
  windowsNotice: string;
}) {
  const { contract, role, version, job, spec, bid } = data;
  const status = contract.status;
  const title = job?.title ?? 'Contract';
  const qaStored = (version as { qa_checks?: string[] | null } | null)?.qa_checks ?? null;

  return (
    <div className="page gigs-page">
      {job ? (
        <Link className="gigs-back" href={gigsHref(base, `/jobs/${job.id}`)}>
          ← Back to the job
        </Link>
      ) : null}

      {checkout === 'success' ? (
        <p role="status" className="gigs-notice gigs-notice-success">
          {status === 'pending_payment'
            ? "Thanks! We're confirming your payment with Stripe. This page updates once it's through."
            : 'Thanks! Payment received. The provider can start now.'}
        </p>
      ) : null}
      {checkout === 'cancelled' ? (
        <p role="status" className="gigs-notice gigs-notice-warning">
          Checkout was cancelled. You haven&apos;t been charged. The bid stays reserved for a while; if the checkout expires, the job opens for bids again.
        </p>
      ) : null}

      <header className="gigs-head">
        <p className="gig-labels">
          <span className="gig-status">{contractStatusLabel(status)}</span>
          <span className="gig-label">{role === 'customer' ? 'You are the customer' : 'You are the provider'}</span>
        </p>
        <h1 className="gigs-title">Contract</h1>
        <p className="gigs-lede">{title}</p>
      </header>
      <div className="gigs-detail gigs-contract">
        <div className="gigs-detail-main">
          {spec ? (
            <>
              <section className="gigs-section">
                <h2 className="gigs-section-title">Requirements</h2>
                <ul className="gigs-list">
                  {spec.requirements.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
              <section className="gigs-section">
                <h2 className="gigs-section-title">Acceptance criteria</h2>
                <ul className="gigs-list">
                  {spec.acceptance_criteria.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}

          <JobRoom contractId={contract.id} role={role} plan={bid?.plan ?? null} initialStatus={status} initialDeadline={version?.deadline ?? null} />
        </div>

        <aside className="gigs-detail-aside">
          <section className="gigs-panel" aria-labelledby="summary-title">
            <h2 id="summary-title" className="gigs-panel-title">
              Summary
            </h2>
            {version ? (
              <table className="gigs-sum">
                <tbody>
                  <tr>
                    <th scope="row">Bid</th>
                    <td>{formatEuros(version.price_cents)}</td>
                  </tr>
                  <tr>
                    <th scope="row">{`Platform fee (${percentFromBps(version.commission_bps)})`}</th>
                    <td>{formatEuros(version.fee_cents)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Total</th>
                    <td>{formatEuros(version.customer_total_cents)}</td>
                  </tr>
                </tbody>
              </table>
            ) : null}
            {version && role === 'provider' ? (
              <p className="gigs-breakdown">{`You receive ${formatEuros(version.price_cents)}. The fee is paid by the customer on top.`}</p>
            ) : null}
            <GigsWindowsNote text={windowsNotice} />
            <dl className="gigs-facts">
              <div className="gigs-fact">
                <dt>Deadline</dt>
                <dd>{deadlineLabel(version?.deadline ?? null)}</dd>
              </div>
              <div className="gigs-fact">
                <dt>Steering interactions included</dt>
                <dd>{version?.steering_allowance ?? 0}</dd>
              </div>
            </dl>
            <div className="gigs-section">
              <h3 className="gigs-section-title">QA checks</h3>
              {job ? <ContractQaChecks jobId={job.id} stored={qaStored} /> : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
