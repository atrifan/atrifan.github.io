'use client';

/**
 * DeliveryPanel: the delivery of one contract, for either party. Reads
 * GET /api/contracts/{contractId}/delivery and refreshes itself after every action.
 *
 * Customer: once QA validated the work and the payment went through, download the exact QA'd
 * commit (.tar.gz), push it into an empty private repo of their own, accept it (the provider is
 * paid), or open a dispute; after acceptance, file a claim inside the claim window and review
 * the provider. Provider: the same report and history, the payout, and a review of the customer.
 * Both see the QA report and warnings, the attempt history and the contract version history.
 *
 * Props:
 *  - contractId:      the contract.
 *  - initial:         the server-rendered DeliveryView (optional; fetched when absent).
 *  - counterpartName: the other party's display name (review hint).
 *  - headingLevel:    level of the section headings, 2 (default) when the page has an h1 above.
 *  - onChanged:       called after an action changed the contract (accept, dispute, review, push).
 *
 * `RoomDeliveryPanel` is the same panel with the job room's slot props (the room's Delivery tab).
 */
import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDate, formatMoneyCents } from '@/src/lib/format';
import type { DeliveryView } from '@/src/lib/delivery/delivery-service';
import type { DeliveryPanelProps as RoomSlotProps } from '@/src/views/gigs/room/DeliverySlot';
import { DisputeForm } from './DisputeForm';
import { ReviewForm } from './ReviewForm';
import '@/styles/gigs-delivery.css';

export interface DeliveryPanelProps {
  contractId: string;
  initial?: DeliveryView | null;
  counterpartName?: string;
  headingLevel?: 2 | 3;
  onChanged?: () => void;
  /** Inside the job room: the room already shows the status, role and version history. */
  embedded?: boolean;
}

export type DeliveryChip = 'Waiting for QA' | 'Ready for review' | 'Accepted' | 'Disputed' | 'Refunded' | 'Cancelled' | 'Waiting for payment';

/** The one-word state shown at the top of the delivery. */
export function deliveryChip(view: DeliveryView): DeliveryChip {
  switch (view.contract.status) {
    case 'completed':
      return 'Accepted';
    case 'disputed':
      return 'Disputed';
    case 'refunded':
      return 'Refunded';
    case 'cancelled':
      return 'Cancelled';
    case 'pending_payment':
      return 'Waiting for payment';
    case 'delivered':
      return view.delivery.unlocked ? 'Ready for review' : 'Waiting for QA';
    default:
      return 'Waiting for QA';
  }
}

const VERDICT_LABEL: Record<string, string> = {
  validated: 'Validated',
  requires_changes: 'Changes requested',
  rejected: 'Rejected',
};

function verdictLabel(verdict: string | null, status: string): string {
  if (verdict) return VERDICT_LABEL[verdict] ?? verdict;
  return status === 'in_review' ? 'In review' : 'Waiting for QA';
}

const money = (cents: number, currency: string) => formatMoneyCents(cents, currency);

export function DeliveryPanel({ contractId, initial = null, counterpartName, headingLevel = 2, onChanged, embedded = false }: DeliveryPanelProps) {
  const [view, setView] = useState<DeliveryView | null>(initial);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'accept' | 'push' | null>(null);
  const [showDispute, setShowDispute] = useState(false);
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [pushError, setPushError] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const H3 = headingLevel === 2 ? 'h3' : 'h4';
  const base = `/api/contracts/${encodeURIComponent(contractId)}`;

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${base}/delivery`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setView((await res.json()) as DeliveryView);
      setLoadError('');
    } catch {
      setLoadError("We couldn't load the delivery. Refresh to try again.");
    }
  }, [base]);

  useEffect(() => {
    if (!initial) void reload();
  }, [initial, reload]);

  if (!view) {
    return (
      <div className="delivery">
        {loadError ? <p className="gigs-error">{loadError}</p> : <p className="gigs-hint">Loading the delivery…</p>}
      </div>
    );
  }

  const { contract, delivery, qa, actions, dispute, payout } = view;
  const customer = contract.role === 'customer';
  const cur = contract.currency;
  const chip = deliveryChip(view);
  const disputeOpen = !!dispute && dispute.status !== 'resolved';
  const showLocked = !delivery.unlocked && ['active', 'submitted', 'in_qa', 'rework', 'pending_payment', 'delivered'].includes(contract.status);

  const accept = async () => {
    setBusy('accept');
    setError('');
    try {
      const res = await fetch(`${base}/accept`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || 'The delivery could not be accepted. Try again.');
      setConfirming(false);
      setMessage('Accepted. The provider has been paid.');
      await reload();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The delivery could not be accepted. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const push = async () => {
    setPushError('');
    setPushMessage('');
    if (!repo.trim() || !token.trim()) {
      setPushError('Enter your repository and a fine-grained token.');
      return;
    }
    setBusy('push');
    try {
      const res = await fetch(`${base}/delivery/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo.trim(), token: token.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; file_count?: number; target_repo?: string };
      if (!res.ok) throw new Error(data.message || 'The push failed. Try again.');
      setToken('');
      setPushMessage(`Pushed ${data.file_count} files to ${data.target_repo}.`);
      await reload();
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'The push failed. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={embedded ? 'delivery delivery-embedded' : 'delivery'}>
      {embedded ? null : (
        <p className="gig-labels">
          <span className="gig-status">{chip}</span>
          <span className="gig-label">{customer ? 'You are the customer' : 'You are the provider'}</span>
        </p>
      )}
      <p role="status" className="gigs-notice gigs-notice-success">
        {message}
      </p>
      {loadError ? <p className="gigs-error">{loadError}</p> : null}

      {showLocked ? <p className="gigs-notice">The delivery unlocks once QA validates the work and the payment has gone through.</p> : null}

      {disputeOpen ? (
        <section className="gigs-notice gigs-notice-warning" aria-labelledby="delivery-dispute-title">
          <H id="delivery-dispute-title" className="gigs-section-title">
            {dispute.source === 'chargeback' ? 'A chargeback is open' : 'A dispute is open'}
          </H>
          <p>{dispute.reason}</p>
          <p className="gigs-hint">
            {dispute.phase === 'pre_accept'
              ? 'Payment and auto-accept are paused while Tulzo reviews it.'
              : 'Tulzo is reviewing this claim.'}
          </p>
        </section>
      ) : null}
      {dispute && dispute.status === 'resolved' && dispute.resolution_note ? (
        <section className="gigs-notice" aria-labelledby="delivery-resolution-title">
          <H id="delivery-resolution-title" className="gigs-section-title">
            Dispute resolved
          </H>
          <p>{dispute.resolution_note}</p>
          {dispute.refund_cents ? <p className="gigs-hint">{`Refunded ${money(dispute.refund_cents, cur)}.`}</p> : null}
        </section>
      ) : null}

      {delivery.commit_sha ? (
        <section className="gigs-panel" aria-labelledby="delivery-commit-title">
          <H id="delivery-commit-title" className="gigs-panel-title">
            Delivered commit
          </H>
          <p className="delivery-meta" data-volatile>
            <code className="delivery-sha" title={delivery.commit_sha}>
              {delivery.commit_sha.slice(0, 12)}
            </code>
            <span>{`Attempt ${delivery.attempt ?? 1}`}</span>
            {delivery.unlocked_at ? <span>{`Validated ${formatDate(delivery.unlocked_at)}`}</span> : null}
          </p>
          {contract.status === 'delivered' && delivery.auto_accept_at && !disputeOpen ? (
            <p data-volatile>
              {customer ? '' : 'Waiting for the customer to accept. '}
              {`Auto-accepts on ${formatDate(delivery.auto_accept_at)}.`}
            </p>
          ) : null}
          {contract.status === 'delivered' && !customer && !delivery.auto_accept_at ? <p>Waiting for the customer to accept.</p> : null}

          {customer && (actions.can_download || actions.can_accept || actions.can_dispute) ? (
            <div className="delivery-actions">
              {actions.can_download ? (
                <a className="btn btn-secondary" href={`${base}/delivery/download`} download>
                  Download .tar.gz
                </a>
              ) : null}
              {actions.can_accept && !confirming ? (
                <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
                  Accept delivery
                </button>
              ) : null}
              {actions.can_dispute && !showDispute ? (
                <button type="button" className="btn btn-ghost" onClick={() => setShowDispute(true)}>
                  {actions.dispute_phase === 'post_accept' ? 'File a claim' : 'Open a dispute'}
                </button>
              ) : null}
            </div>
          ) : null}
          {customer && actions.can_download ? (
            <p className="gigs-hint">
              {contract.status === 'delivered'
                ? 'The download is the exact commit QA checked. It stays available here after you accept.'
                : 'The download is the exact commit QA checked.'}
            </p>
          ) : null}
          {customer && actions.can_dispute && actions.dispute_phase === 'post_accept' && actions.claim_window_ends_at ? (
            <p className="gigs-hint">{`You can file a claim until ${formatDate(actions.claim_window_ends_at)}.`}</p>
          ) : null}

          {confirming ? (
            <div className="delivery-confirm">
              <p>Accepting releases the payment to the provider and ends the platform&apos;s access to their repository. The QA&apos;d commit stays available to download.</p>
              <div className="delivery-actions">
                <button type="button" className="btn btn-primary" onClick={() => void accept()} disabled={busy === 'accept'}>
                  {busy === 'accept' ? 'Accepting…' : 'Accept and release payment'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy === 'accept'}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <p role="alert" className="gigs-error">
            {error}
          </p>
        </section>
      ) : null}

      {showDispute && actions.can_dispute && actions.dispute_phase ? (
        <DisputeForm
          contractId={contractId}
          phase={actions.dispute_phase}
          claimEndsAt={actions.claim_window_ends_at}
          headingLevel={headingLevel}
          onCancel={() => setShowDispute(false)}
          onOpened={async () => {
            setShowDispute(false);
            setConfirming(false);
            setMessage(
              actions.dispute_phase === 'post_accept'
                ? 'Claim filed. Tulzo will review it.'
                : 'Dispute opened. Payment and auto-accept are paused while Tulzo reviews it.',
            );
            await reload();
            onChanged?.();
          }}
        />
      ) : null}

      {customer && actions.can_push ? (
        <section className="gigs-panel" aria-labelledby="delivery-push-title">
          <H id="delivery-push-title" className="gigs-panel-title">
            Push to your repository
          </H>
          <p className="gigs-hint">
            Create an empty private repository, then a fine-grained token for that repository only with &quot;Contents: Read and write&quot;. We push the QA&apos;d files as one commit and delete the token right after.
          </p>
          <form
            className="delivery-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void push();
            }}
          >
            <div className="gigs-field">
              <label htmlFor="delivery-push-repo">Repository</label>
              <input id="delivery-push-repo" className="gigs-input" type="text" placeholder="owner/name" autoComplete="off" spellCheck={false} value={repo} onChange={(e) => setRepo(e.target.value)} />
            </div>
            <div className="gigs-field">
              <label htmlFor="delivery-push-token">Fine-grained token</label>
              <input id="delivery-push-token" className="gigs-input" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
            <p role="status" className="gigs-notice gigs-notice-success">
              {pushMessage}
            </p>
            <p role="alert" className="gigs-error">
              {pushError}
            </p>
            <div className="gigs-form-actions">
              <button type="submit" className="btn btn-secondary" disabled={busy === 'push'}>
                {busy === 'push' ? 'Pushing…' : 'Push to my repo'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {qa ? (
        <section className="gigs-panel" aria-labelledby="delivery-qa-title">
          <H id="delivery-qa-title" className="gigs-panel-title">
            QA report
          </H>
          {qa.report_md ? (
            <div className="delivery-report gigs-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                {qa.report_md.replace(/^#{1,2}\s+QA report\s*\n/i, '')}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="gigs-hint">QA validated the work against the acceptance criteria.</p>
          )}
          {qa.warnings.length > 0 ? (
            <>
              <H3 className="gigs-section-title">Warnings</H3>
              <ul className="delivery-warnings">
                {qa.warnings.map((w, i) => (
                  <li key={i}>
                    {w.severity ? <span className="delivery-severity">{w.severity}</span> : null}
                    {w.title}
                    {w.detail ? <span className="gigs-hint">{` ${w.detail}`}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {view.history.length > 0 ? (
        <section className="gigs-panel" aria-labelledby="delivery-history-title">
          <H id="delivery-history-title" className="gigs-panel-title">
            History
          </H>
          <div className="gigs-table-wrap">
            <table className="gigs-table">
              <caption className="visually-hidden">Submission attempts</caption>
              <thead>
                <tr>
                  <th scope="col">Attempt</th>
                  <th scope="col">Commit</th>
                  <th scope="col">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {view.history.map((h) => (
                  <tr key={h.attempt}>
                    <td>{h.attempt}</td>
                    <td>
                      <code className="delivery-sha delivery-sha-cell">{h.commit_sha.slice(0, 12)}</code>
                    </td>
                    <td>
                      {verdictLabel(h.verdict, h.status)}
                      {h.reason ? <span className="gigs-hint">{`: ${h.reason}`}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!embedded && view.contract_versions.length > 0 ? (
        <section className="gigs-panel" aria-labelledby="delivery-versions-title">
          <H id="delivery-versions-title" className="gigs-panel-title">
            Contract versions
          </H>
          <div className="gigs-table-wrap">
            <table className="gigs-table">
              <caption className="visually-hidden">Contract versions</caption>
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Price</th>
                  <th scope="col">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {view.contract_versions.map((v) => (
                  <tr key={v.version}>
                    <td>{v.current ? `${v.version} (current)` : v.version}</td>
                    <td>{money(v.price_cents, cur)}</td>
                    <td>{v.deadline ? formatDate(v.deadline) : 'No deadline'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!customer && payout ? (
        <section className="gigs-panel" aria-labelledby="delivery-payout-title">
          <H id="delivery-payout-title" className="gigs-panel-title">
            Payout
          </H>
          <p>
            {payout.status === 'paid' || payout.status === 'partially_reversed' || payout.status === 'reversed'
              ? `Paid out ${money(payout.amount_cents, cur)}`
              : payout.status === 'failed'
                ? 'The payout did not go through yet. We retry it daily.'
                : 'The payout is on its way.'}
          </p>
          {payout.reversed_cents > 0 ? <p className="gigs-hint">{`${money(payout.reversed_cents, cur)} was reversed after a claim.`}</p> : null}
        </section>
      ) : null}

      {actions.can_review || view.reviews.mine ? (
        <ReviewForm
          key="review"
          contractId={contractId}
          counterpartName={counterpartName}
          existing={view.reviews.mine}
          headingLevel={headingLevel}
          onSubmitted={() => {
            void reload();
            onChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The panel in the job room's Delivery tab: section headings under the room's h2, and a fresh
 * load whenever the room sees the contract status change (QA validated, accepted, disputed).
 */
export function RoomDeliveryPanel({ contractId, contractStatus, onChanged }: RoomSlotProps) {
  return <DeliveryPanel key={contractStatus} contractId={contractId} headingLevel={3} onChanged={onChanged} embedded />;
}
