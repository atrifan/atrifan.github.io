'use client';

/** Offer a service: title, description, labels, category, price and delivery time. */
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiJson } from '@/src/lib/jobs/client/api';
import { GIG_CATEGORIES, parseEurosToCents } from '@/src/lib/jobs/client/format';
import { validateOffer, type OfferForm as OfferFormValues } from '@/src/lib/jobs/client/validation';
import { gigsHref, type GigsBase } from '@/src/lib/jobs/ui/paths';
import { Field, describedBy } from './ui';
import { PriceBreakdownNote } from './PriceBreakdownNote';

const EMPTY: OfferFormValues = { title: '', description: '', labels: '', category: '', price: '', deliveryDays: '' };

export function OfferForm({ base, bps }: { base: GigsBase; bps: number }) {
  const router = useRouter();
  const [form, setForm] = useState<OfferFormValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof OfferFormValues, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof OfferFormValues) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const cents = parseEurosToCents(form.price);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = validateOffer(form);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    setProblem(null);
    const res = await apiJson('/api/offers', { method: 'POST', body: r.value });
    if (!res.ok) {
      setBusy(false);
      setProblem(res.message);
      return;
    }
    router.push(gigsHref(base, '/?tab=offers&posted=offer'));
  }

  return (
    <form className="gigs-panel gigs-form" onSubmit={submit} noValidate aria-label="Offer a service">
      {problem ? (
        <p role="alert" className="gigs-notice gigs-notice-danger">
          {problem}
        </p>
      ) : null}
      <Field id="offer-title" label="Title" error={errors.title}>
        <input id="offer-title" value={form.title} onChange={set('title')} maxLength={200} {...describedBy('offer-title', undefined, errors.title)} />
      </Field>
      <Field id="offer-description" label="Description" hint="What you deliver, how you work and what you need from the customer." error={errors.description}>
        <textarea id="offer-description" rows={6} value={form.description} onChange={set('description')} {...describedBy('offer-description', true, errors.description)} />
      </Field>
      <div className="gigs-row">
        <Field id="offer-labels" label="Labels (comma separated)" hint="For example: Next.js, CSV, testing" error={errors.labels}>
          <input id="offer-labels" value={form.labels} onChange={set('labels')} {...describedBy('offer-labels', true, errors.labels)} />
        </Field>
        <Field id="offer-category" label="Category">
          <select id="offer-category" value={form.category} onChange={set('category')}>
            <option value="">Choose a category</option>
            {GIG_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="gigs-row">
        <Field id="offer-price" label="Price (€)" error={errors.price}>
          <input id="offer-price" type="number" inputMode="decimal" min={5} step="0.01" value={form.price} onChange={set('price')} {...describedBy('offer-price', undefined, errors.price)} />
        </Field>
        <Field id="offer-days" label="Delivery time (days)" error={errors.deliveryDays}>
          <input id="offer-days" type="number" inputMode="numeric" min={1} max={365} step={1} value={form.deliveryDays} onChange={set('deliveryDays')} {...describedBy('offer-days', undefined, errors.deliveryDays)} />
        </Field>
      </div>
      <PriceBreakdownNote priceCents={cents != null && !Number.isNaN(cents) ? cents : null} bps={bps} audience="customers" />
      <div className="gigs-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Publishing…' : 'Publish offer'}
        </button>
      </div>
    </form>
  );
}
