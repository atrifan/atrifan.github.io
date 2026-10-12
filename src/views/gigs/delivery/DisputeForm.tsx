'use client';

/**
 * DisputeForm: the customer's structured dispute (before acceptance; it pauses auto-accept and
 * the payout) or claim (within the claim window after acceptance). POSTs
 * /api/contracts/{contractId}/dispute {category, reason, evidence}.
 *
 * Props:
 *  - contractId:   the contract (the caller must be its customer).
 *  - phase:        'pre_accept' ("Open a dispute") or 'post_accept' ("File a claim").
 *  - claimEndsAt:  ISO end of the claim window, shown for post-accept claims.
 *  - onOpened:     called with the created dispute.
 *  - onCancel:     shows a Cancel button when given.
 *  - headingLevel: 2 (default) or 3.
 */
import { useState } from 'react';
import { formatDate } from '@/src/lib/format';
import '@/styles/gigs-delivery.css';

export const DISPUTE_CATEGORY_OPTIONS = [
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'quality', label: 'Quality problems' },
  { value: 'late', label: 'Late delivery' },
  { value: 'not_delivered', label: 'Not delivered' },
  { value: 'other', label: 'Something else' },
] as const;

export interface DisputeFormProps {
  contractId: string;
  phase: 'pre_accept' | 'post_accept';
  claimEndsAt?: string | null;
  onOpened?: (dispute: Record<string, unknown>) => void;
  onCancel?: () => void;
  headingLevel?: 2 | 3;
}

export function DisputeForm({ contractId, phase, claimEndsAt, onOpened, onCancel, headingLevel = 2 }: DisputeFormProps) {
  const [category, setCategory] = useState<string>('not_as_described');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const id = `dispute-${contractId}`;
  const claim = phase === 'post_accept';

  const submit = async () => {
    if (reason.trim().length < 10) {
      setReasonError('Tell us what went wrong in at least 10 characters.');
      return;
    }
    setReasonError('');
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, reason: reason.trim(), evidence: evidence.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { dispute?: Record<string, unknown>; message?: string };
      if (!res.ok || !data.dispute) throw new Error(data.message || 'The dispute could not be opened. Try again.');
      onOpened?.(data.dispute);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The dispute could not be opened. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gigs-panel" aria-labelledby={`${id}-title`}>
      <H id={`${id}-title`} className="gigs-panel-title">
        {claim ? 'File a claim' : 'Open a dispute'}
      </H>
      <p className="gigs-hint">
        {claim
          ? `Something wrong after you accepted? Tell us${claimEndsAt ? ` before ${formatDate(claimEndsAt)}` : ''}. Tulzo reviews every claim and can refund you.`
          : 'Payment and auto-accept stop while Tulzo reviews the dispute. Be specific: what does not match the acceptance criteria?'}
      </p>
      <form
        className="delivery-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="gigs-field">
          <label htmlFor={`${id}-category`}>What went wrong</label>
          <select id={`${id}-category`} className="gigs-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {DISPUTE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="gigs-field">
          <label htmlFor={`${id}-reason`}>Describe the problem</label>
          <textarea
            id={`${id}-reason`}
            className="gigs-input"
            maxLength={4000}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError('');
            }}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? `${id}-reason-error` : undefined}
          />
          {reasonError ? (
            <p id={`${id}-reason-error`} className="gigs-error">
              {reasonError}
            </p>
          ) : null}
        </div>
        <div className="gigs-field">
          <label htmlFor={`${id}-evidence`}>Evidence (optional)</label>
          <textarea id={`${id}-evidence`} className="gigs-input" maxLength={20000} value={evidence} onChange={(e) => setEvidence(e.target.value)} aria-describedby={`${id}-evidence-hint`} />
          <p id={`${id}-evidence-hint`} className="gigs-hint">
            Steps to reproduce, failing inputs, links to logs or screenshots.
          </p>
        </div>
        <p role="alert" className="gigs-error">
          {error}
        </p>
        <div className="gigs-form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit dispute'}
          </button>
          {onCancel ? (
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
