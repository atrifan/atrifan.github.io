'use client';

/**
 * The job owner's bid comparison: sort by price, delivery or trust, read plan summaries,
 * accept one. Accepting asks for the QA checks (preselected from the post wizard), then
 * goes to Stripe Checkout.
 */
import { useEffect, useRef, useState } from 'react';
import { apiJson } from '@/src/lib/jobs/client/api';
import { formatEuros } from '@/src/lib/jobs/client/format';
import { sortBids, type BidSort } from '@/src/lib/jobs/client/bids-sort';
import { normalizeQaChecks, parseStoredQaChecks, qaOptions, qaReserveCredits, qaStorageKey } from '@/src/lib/jobs/client/qa-checks';
import type { QaCheck } from '@/src/config/qa.config';
import { QaChecksFieldset } from './QaChecksFieldset';
import { TrustBadge } from './ui';
import { GigsWindowsNote } from './GigsWindowsNote';
import { CONSENT_TEXT } from '@/src/lib/legal/consent';
import type { TrustBadgeData } from '@/src/lib/trust/badges';

export interface CompareBid {
  id: string;
  price_cents: number;
  customer_total_cents: number;
  eta_days: number;
  plan: string | null;
  deliverables: string[];
  assumptions: string[];
  included_steering_credits: number;
  status: string;
  created_at: string;
  trust_score: number | null;
  /** Badge data for the bidder (score, reviews); absent = new on Tulzo. */
  trust?: TrustBadgeData;
  headline: string | null;
}

function steeringLabel(n: number): string {
  if (n === 0) return 'No steering included';
  return `${n} steering ${n === 1 ? 'interaction' : 'interactions'} included`;
}

const days = (n: number) => `Delivery in ${n} ${n === 1 ? 'day' : 'days'}`;

export function BidCompare({
  jobId,
  bids,
  canAccept,
  qaCosts,
  windowsNotice,
}: {
  jobId: string;
  bids: CompareBid[];
  canAccept: boolean;
  qaCosts: Record<QaCheck, number>;
  /** The dispute and claim windows line (gigsConfig().windowsNotice). */
  windowsNotice: string;
}) {
  const [sort, setSort] = useState<BidSort>('price');
  const [accepting, setAccepting] = useState<CompareBid | null>(null);
  const [qa, setQa] = useState<QaCheck[]>(['basic']);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sorted = sortBids(bids, sort);
  const options = qaOptions(qaCosts);

  useEffect(() => {
    if (accepting) dialogRef.current?.showModal();
  }, [accepting]);

  function open(bid: CompareBid) {
    setQa(parseStoredQaChecks(window.sessionStorage.getItem(qaStorageKey(jobId))));
    setProblem(null);
    setConsent(false);
    setAccepting(bid);
  }

  function close() {
    dialogRef.current?.close();
    setAccepting(null);
  }

  async function accept() {
    if (!accepting) return;
    if (!consent) {
      setProblem('Tick the box to confirm before you pay.');
      document.getElementById('accept-consent')?.focus();
      return;
    }
    setBusy(true);
    setProblem(null);
    const checks = normalizeQaChecks(qa);
    window.sessionStorage.setItem(qaStorageKey(jobId), JSON.stringify(checks));
    const res = await apiJson<{ checkout_url: string; contract: { id: string } }>(`/api/bids/${accepting.id}/accept`, {
      method: 'POST',
      body: { qa_checks: checks, withdrawal_consent: true },
    });
    if (res.ok && res.data?.checkout_url) {
      window.location.assign(res.data.checkout_url);
      return;
    }
    setBusy(false);
    setProblem(res.message ?? 'Could not start the checkout. Try again.');
  }

  return (
    <section className="gigs-section" aria-labelledby="compare-title">
      <div className="gigs-results-head">
        <h2 id="compare-title" className="gigs-section-title">
          Compare bids
        </h2>
        {bids.length > 1 ? (
          <div className="gigs-field">
            <label htmlFor="bid-sort">Sort bids by</label>
            <select id="bid-sort" value={sort} onChange={(e) => setSort(e.target.value as BidSort)}>
              <option value="price">Lowest price</option>
              <option value="delivery">Fastest delivery</option>
              <option value="trust">Most trusted</option>
            </select>
          </div>
        ) : null}
      </div>
      {bids.length === 0 ? (
        <div className="gigs-empty">
          <h3>No bids yet</h3>
          <p>Agents are notified about new jobs. Bids usually arrive within a day.</p>
        </div>
      ) : (
        <ul role="list" aria-label="Bids" className="gigs-bids">
          {sorted.map((bid) => (
            <li key={bid.id}>
              <article className="gigs-bid" aria-label={`Bid of ${formatEuros(bid.price_cents)}`}>
                <div className="gigs-bid-top">
                  <p className="gig-card-price">{formatEuros(bid.price_cents)}</p>
                  <TrustBadge {...bid.trust} />
                </div>
                <p className="gig-card-meta">
                  <span>{`Customer total ${formatEuros(bid.customer_total_cents)}`}</span>
                  <span>{days(bid.eta_days)}</span>
                  <span>{steeringLabel(bid.included_steering_credits)}</span>
                </p>
                {bid.headline ? <p className="gigs-hint">{bid.headline}</p> : null}
                {bid.plan ? <p className="gigs-bid-plan">{bid.plan}</p> : <p className="gigs-hint">No plan given.</p>}
                {bid.deliverables.length ? (
                  <p className="gigs-hint">{`Delivers: ${bid.deliverables.join(', ')}`}</p>
                ) : null}
                {canAccept && bid.status === 'active' ? (
                  <div className="gigs-bid-actions">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => open(bid)}>
                      Accept bid
                    </button>
                  </div>
                ) : bid.status !== 'active' ? (
                  <p className="gigs-hint">{bid.status === 'accepted' ? 'Accepted' : 'Withdrawn'}</p>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}

      <dialog ref={dialogRef} className="gigs-dialog" aria-labelledby="accept-title" onClose={() => setAccepting(null)}>
        {accepting ? (
          <div className="gigs-dialog-inner">
            <div className="gigs-dialog-head">
              <h2 id="accept-title" className="gigs-dialog-title">
                Accept this bid
              </h2>
              <button type="button" className="gigs-icon-button" aria-label="Close" onClick={close}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <table className="gigs-sum">
              <tbody>
                <tr>
                  <th scope="row">Bid</th>
                  <td>{formatEuros(accepting.price_cents)}</td>
                </tr>
                <tr>
                  <th scope="row">Platform fee</th>
                  <td>{formatEuros(accepting.customer_total_cents - accepting.price_cents)}</td>
                </tr>
                <tr>
                  <th scope="row">You pay</th>
                  <td>{formatEuros(accepting.customer_total_cents)}</td>
                </tr>
              </tbody>
            </table>
            <p className="gigs-hint">{`You pay ${formatEuros(accepting.customer_total_cents)} now through Stripe. The provider is paid after QA validates the delivery and you accept it.`}</p>
            <QaChecksFieldset
              idPrefix="accept-qa"
              options={options}
              chosen={qa}
              onChange={(id, on) => setQa(normalizeQaChecks(on ? [...qa, id] : qa.filter((c) => c !== id)))}
              reserve={qaReserveCredits(qa, qaCosts)}
            />
            <GigsWindowsNote text={windowsNotice} />
            <div className="gigs-consent">
              <input
                id="accept-consent"
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  if (e.target.checked) setProblem(null);
                }}
              />
              <label htmlFor="accept-consent">{CONSENT_TEXT.gig_contract}</label>
            </div>
            {problem ? (
              <p role="alert" className="gigs-notice gigs-notice-danger">
                {problem}
              </p>
            ) : null}
            <div className="gigs-form-actions">
              <button type="button" className="btn btn-primary" onClick={accept} disabled={busy}>
                {busy ? 'Opening checkout…' : 'Continue to payment'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
