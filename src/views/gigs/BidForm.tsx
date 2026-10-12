'use client';

/**
 * Bid on a job. The live breakdown uses the same commission math as the server. A 403
 * connect_required swaps the form for the "Link Stripe" card.
 */
import { useState, type FormEvent } from 'react';
import { apiJson } from '@/src/lib/jobs/client/api';
import { formatEuros, parseEurosToCents } from '@/src/lib/jobs/client/format';
import { validateBid, type BidForm as BidFormValues } from '@/src/lib/jobs/client/validation';
import { Field, StripeLinkCard, describedBy } from './ui';
import { PriceBreakdownNote } from './PriceBreakdownNote';

const EMPTY: BidFormValues = { price: '', etaDays: '', plan: '', deliverables: '', steering: '', assumptions: '' };

export function BidForm({
  jobId,
  bps,
  bounds,
  profileUrl,
}: {
  jobId: string;
  bps: number;
  bounds: { minCents: number; maxCents: number };
  profileUrl: string;
}) {
  const [form, setForm] = useState<BidFormValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof BidFormValues, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [needsStripe, setNeedsStripe] = useState(false);
  const [placed, setPlaced] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof BidFormValues) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const cents = parseEurosToCents(form.price);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validateBid(form, bounds);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setProblem(null);
    setBusy(true);
    const res = await apiJson(`/api/jobs/${jobId}/bids`, { method: 'POST', body: r.value });
    setBusy(false);
    if (res.ok) {
      setPlaced(r.value.price_cents);
      return;
    }
    if (res.error === 'connect_required') {
      setNeedsStripe(true);
      return;
    }
    const known: Record<string, string> = {
      bid_exists: 'You already have an active bid on this job.',
      job_not_open: 'This job is no longer open for bids.',
      own_job: "You can't bid on your own job.",
      price_out_of_bounds: `Bids must be between ${formatEuros(bounds.minCents)} and ${formatEuros(bounds.maxCents)}.`,
    };
    setProblem(known[res.error ?? ''] ?? res.message);
  }

  if (needsStripe) {
    return (
      <StripeLinkCard title="Link Stripe to bid" profileUrl={profileUrl}>
        Tulzo pays providers through Stripe, so bidding needs a linked Stripe account with payouts enabled. Link it once on your profile, then come back to
        place your bid.
      </StripeLinkCard>
    );
  }

  if (placed != null) {
    return (
      <section className="gigs-panel" aria-labelledby="bid-done-title">
        <h2 id="bid-done-title" className="gigs-panel-title">
          Bid placed
        </h2>
        <p role="status" className="gigs-notice gigs-notice-success">
          {`Your bid is in: ${formatEuros(placed)}. We'll let you know if the customer accepts it.`}
        </p>
      </section>
    );
  }

  return (
    <form className="gigs-panel gigs-form" onSubmit={submit} noValidate aria-labelledby="bid-title">
      <h2 id="bid-title" className="gigs-panel-title">
        Place a bid
      </h2>
      {problem ? (
        <p role="alert" className="gigs-notice gigs-notice-danger">
          {problem}
        </p>
      ) : null}
      <div className="gigs-row">
        <Field id="bid-price" label="Your price (€)" error={errors.price}>
          <input id="bid-price" type="number" inputMode="decimal" min={bounds.minCents / 100} step="0.01" value={form.price} onChange={set('price')} {...describedBy('bid-price', undefined, errors.price)} />
        </Field>
        <Field id="bid-eta" label="Delivery estimate (days)" error={errors.etaDays}>
          <input id="bid-eta" type="number" inputMode="numeric" min={1} max={365} step={1} value={form.etaDays} onChange={set('etaDays')} {...describedBy('bid-eta', undefined, errors.etaDays)} />
        </Field>
      </div>
      <PriceBreakdownNote priceCents={cents != null && !Number.isNaN(cents) ? cents : null} bps={bps} audience="the customer" />
      <Field id="bid-plan" label="Plan" hint="How you will do the work. The customer sees this when comparing bids." error={errors.plan}>
        <textarea id="bid-plan" rows={5} value={form.plan} onChange={set('plan')} {...describedBy('bid-plan', true, errors.plan)} />
      </Field>
      <Field id="bid-deliverables" label="Deliverables (one per line)" error={errors.deliverables}>
        <textarea id="bid-deliverables" rows={3} value={form.deliverables} onChange={set('deliverables')} {...describedBy('bid-deliverables', undefined, errors.deliverables)} />
      </Field>
      <Field id="bid-steering" label="Steering interactions included" hint="Revisions the customer can ask for at no extra cost." error={errors.steering}>
        <input id="bid-steering" type="number" inputMode="numeric" min={0} max={100} step={1} value={form.steering} onChange={set('steering')} {...describedBy('bid-steering', true, errors.steering)} />
      </Field>
      <Field id="bid-assumptions" label="Assumptions (one per line)" error={errors.assumptions}>
        <textarea id="bid-assumptions" rows={3} value={form.assumptions} onChange={set('assumptions')} {...describedBy('bid-assumptions', undefined, errors.assumptions)} />
      </Field>
      <div className="gigs-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Placing bid…' : 'Place bid'}
        </button>
      </div>
    </form>
  );
}
