'use client';

/**
 * ReviewForm: one review per party per contract, after acceptance or an admin resolution.
 * POSTs /api/contracts/{contractId}/reviews and then shows the posted review.
 *
 * Props:
 *  - contractId:     the contract (the caller must be one of its parties).
 *  - counterpartName: who is being reviewed, for the hint ("How was working with …?").
 *  - existing:       the caller's own review if there is one: the summary is shown instead.
 *  - onSubmitted:    called with the created review (e.g. to refresh the delivery view).
 *  - headingLevel:   2 (default) or 3, to fit the surrounding outline.
 */
import { useState } from 'react';
import '@/styles/gigs-delivery.css';

export interface ReviewScores {
  overall: number;
  quality: number;
  communication: number;
  timeliness: number;
  body?: string | null;
}

export interface ReviewFormProps {
  contractId: string;
  counterpartName?: string;
  existing?: (ReviewScores & { created_at?: string }) | null;
  onSubmitted?: (review: Record<string, unknown>) => void;
  headingLevel?: 2 | 3;
}

const ASPECTS = [
  { key: 'overall', label: 'Overall' },
  { key: 'quality', label: 'Quality' },
  { key: 'communication', label: 'Communication' },
  { key: 'timeliness', label: 'Timeliness' },
] as const;
type Aspect = (typeof ASPECTS)[number]['key'];

function Stars({ name, legend, value, onChange }: { name: string; legend: string; value: number; onChange: (v: number) => void }) {
  return (
    <fieldset className="stars">
      <legend>{legend}</legend>
      <div className="stars-options">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`stars-option${n <= value ? ' is-on' : ''}`}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} />
            <span aria-hidden="true">★</span>
            <span className="visually-hidden">{n === 1 ? '1 star' : `${n} stars`}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Summary({ review, headingLevel }: { review: ReviewScores; headingLevel: 2 | 3 }) {
  const H = headingLevel === 2 ? 'h3' : 'h4';
  return (
    <div className="review-summary">
      <H className="gigs-section-title">Your review</H>
      <p>
        <strong>{`${review.overall}/5 overall`}</strong>
        <span className="gigs-hint">{` · Quality ${review.quality}/5 · Communication ${review.communication}/5 · Timeliness ${review.timeliness}/5`}</span>
      </p>
      {review.body ? <p>{review.body}</p> : null}
    </div>
  );
}

export function ReviewForm({ contractId, counterpartName, existing = null, onSubmitted, headingLevel = 2 }: ReviewFormProps) {
  const [scores, setScores] = useState<Record<Aspect, number>>({ overall: 0, quality: 0, communication: 0, timeliness: 0 });
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<ReviewScores | null>(existing);
  const [message, setMessage] = useState('');
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const id = `review-${contractId}`;

  const submit = async () => {
    if (ASPECTS.some((a) => scores[a.key] < 1)) {
      setError('Rate all four.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${encodeURIComponent(contractId)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...scores, body: body.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { review?: Record<string, unknown>; message?: string };
      if (!res.ok || !data.review) throw new Error(data.message || 'Your review could not be posted. Try again.');
      setPosted({ ...scores, body: body.trim() || null });
      setMessage('Thanks! Your review is posted.');
      onSubmitted?.(data.review);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your review could not be posted. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="gigs-panel" aria-labelledby={`${id}-title`} id="review">
      <H id={`${id}-title`} className="gigs-panel-title">
        {posted ? 'Review' : 'Leave a review'}
      </H>
      <p role="status" className="gigs-notice gigs-notice-success">
        {message}
      </p>
      {posted ? (
        <Summary review={posted} headingLevel={headingLevel} />
      ) : (
        <form
          className="delivery-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="gigs-hint">
            {counterpartName ? `How was working with ${counterpartName}? ` : ''}One review per contract; it shows on their profile.
          </p>
          {ASPECTS.map((a) => (
            <Stars key={a.key} name={`${id}-${a.key}`} legend={a.label} value={scores[a.key]} onChange={(v) => setScores((s) => ({ ...s, [a.key]: v }))} />
          ))}
          <div className="gigs-field">
            <label htmlFor={`${id}-body`}>Your review (optional)</label>
            <textarea id={`${id}-body`} className="gigs-input" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <p role="alert" className="gigs-error">
            {error}
          </p>
          <div className="gigs-form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Posting…' : 'Submit review'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
