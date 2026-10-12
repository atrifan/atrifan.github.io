'use client';

/**
 * Hub /admin/disputes: open and resolved disputes (customer disputes and claims, QA
 * rejections, chargebacks) → detail with the contract's money → release, partial refund or
 * full refund. A thin client over app/api/admin/disputes/*, which wrap
 * src/lib/disputes/dispute-service.ts. Before the payout a refund is a refund; after it the
 * service reverses the transfer and refunds.
 */
import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatMoneyCents } from '@/src/lib/format';

type Filter = 'open' | 'resolved';
type Outcome = 'release' | 'partial_refund' | 'full_refund';

interface Party {
  user_id: string;
  name: string | null;
  email: string | null;
}

interface Item {
  id: string;
  job_title: string | null;
  source: 'customer' | 'qa_rejected' | 'chargeback';
  phase: 'pre_accept' | 'post_accept';
  category: string;
  status: string;
  resolution: Outcome | null;
  created_at: string;
  customer: Party | null;
  provider: Party | null;
  customer_total_cents: number | null;
  currency: string;
}

interface Detail {
  dispute: {
    id: string;
    source: Item['source'];
    phase: Item['phase'];
    category: string;
    reason: string;
    evidence: string | null;
    status: string;
    default_resolution: Outcome | null;
    resolution: Outcome | null;
    resolution_note: string | null;
    resolved_at: string | null;
    stripe_dispute_status: string | null;
    created_at: string;
  };
  contract: { id: string; status: string; job_title: string; currency: string; accepted_at: string | null };
  parties: { customer: Party | null; provider: Party | null };
  money: { paid_cents: number; refunded_cents: number; bid_cents: number; fee_cents: number; transferred_cents: number; reversed_cents: number; refundable_cents: number } | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  not_as_described: 'Not as described',
  incomplete: 'Incomplete',
  quality: 'Quality problems',
  late: 'Late delivery',
  not_delivered: 'Not delivered',
  other: 'Something else',
  qa_rejected: 'QA rejected',
  chargeback: 'Chargeback',
};

const SOURCE_LABELS: Record<Item['source'], string> = { customer: 'Customer', qa_rejected: 'QA rejected', chargeback: 'Chargeback' };
const OUTCOMES: Array<{ value: Outcome; label: string }> = [
  { value: 'release', label: 'Release payment to the provider' },
  { value: 'partial_refund', label: 'Partial refund' },
  { value: 'full_refund', label: 'Full refund' },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) throw new Error(body.message || body.error || `Request failed (${res.status})`);
  return body;
}

const partyName = (p: Party | null | undefined) => p?.name || p?.email || p?.user_id || '—';

/** "12.50" / "12,5" → 1250; anything else → NaN. */
function eurosToCents(input: string): number {
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : Number.NaN;
}

export function AdminDisputesView() {
  const [filter, setFilter] = useState<Filter>('open');
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async (f: Filter) => {
    setError('');
    try {
      setItems((await api<{ items: Item[] }>(`/api/admin/disputes?status=${f}`)).items);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Could not load the disputes');
    }
  }, []);

  useEffect(() => {
    setItems(null);
    void load(filter);
  }, [filter, load]);

  return (
    <div className="page">
      <header className="account-header">
        <h1>Disputes</h1>
        <p className="muted">Customer disputes and claims, rejected QA and chargebacks. Decide what happens to the money; both parties are told.</p>
      </header>

      <div className="radio-row" role="group" aria-label="Filter disputes" style={{ marginBottom: 'var(--space-4)' }}>
        {(['open', 'resolved'] as const).map((f) => (
          <button key={f} type="button" className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'open' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {items === null ? <p className="muted">Loading…</p> : null}
      {items && items.length === 0 && !error ? <p className="empty-state">{filter === 'open' ? 'No open disputes.' : 'No resolved disputes.'}</p> : null}

      {items && items.length > 0 ? (
        <section className="panel" aria-labelledby="disputes-list-title">
          <h2 id="disputes-list-title" className="visually-hidden">
            {filter === 'open' ? 'Open disputes' : 'Resolved disputes'}
          </h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  className={`btn ${selected === it.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap', height: 'auto', textAlign: 'left', gap: 'var(--space-2)' }}
                  aria-current={selected === it.id ? 'true' : undefined}
                  onClick={() => setSelected(it.id)}
                >
                  <span>{it.job_title ?? 'Untitled job'}</span>
                  <span className="muted" style={{ color: 'inherit' }}>
                    {[CATEGORY_LABELS[it.category] ?? it.category, it.source === 'customer' ? SOURCE_LABELS.customer : null, formatDate(it.created_at)].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selected ? (
        <DisputeDetail
          key={selected}
          id={selected}
          onResolved={() => {
            void load(filter);
          }}
        />
      ) : null}
    </div>
  );
}

function DisputeDetail({ id, onResolved }: { id: string; onResolved: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await api<Detail>(`/api/admin/disputes/${id}`);
        if (!alive) return;
        setDetail(d);
        if (d.dispute.default_resolution) setOutcome(d.dispute.default_resolution);
      } catch (err) {
        if (alive) setLoadError(err instanceof Error ? err.message : 'Could not load the dispute');
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loadError) return <p className="field-error">{loadError}</p>;
  if (!detail) return <p className="muted">Loading…</p>;
  const { dispute, contract, parties, money } = detail;
  const cur = contract.currency;
  const fmt = (c: number | undefined) => formatMoneyCents(c ?? 0, cur);
  const maxPartial = money ? money.refundable_cents - 1 : 0;
  const resolvable = dispute.status !== 'resolved' && dispute.source !== 'chargeback';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDone('');
    if (!outcome) {
      setFormError('Choose a decision.');
      return;
    }
    let refundCents: number | undefined;
    if (outcome === 'partial_refund') {
      refundCents = eurosToCents(amount);
      if (!Number.isInteger(refundCents) || refundCents < 1 || refundCents > maxPartial) {
        setFormError(`Enter an amount between €0.01 and ${formatMoneyCents(maxPartial, cur)}.`);
        return;
      }
    }
    if (note.trim().length < 3) {
      setFormError('Add a short note for both parties.');
      return;
    }
    setFormError('');
    setBusy(true);
    try {
      const body: { outcome: Outcome; note: string; refund_cents?: number } = { outcome, note: note.trim() };
      if (refundCents !== undefined) body.refund_cents = refundCents;
      await api(`/api/admin/disputes/${id}/resolve`, { method: 'POST', body: JSON.stringify(body) });
      setDone('Dispute resolved.');
      onResolved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not resolve the dispute');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="dispute-detail-title" style={{ marginTop: 'var(--space-5)' }}>
      <div className="panel-head">
        <div>
          <p className="eyebrow">{`${SOURCE_LABELS[dispute.source]} · ${dispute.phase === 'post_accept' ? 'after acceptance' : 'before acceptance'}`}</p>
          <h2 id="dispute-detail-title">{contract.job_title}</h2>
        </div>
      </div>
      <dl className="kv">
        <dt>Reason</dt>
        <dd>{dispute.reason}</dd>
        <dt>Evidence</dt>
        <dd>{dispute.evidence || '—'}</dd>
        <dt>Category</dt>
        <dd>{CATEGORY_LABELS[dispute.category] ?? dispute.category}</dd>
        <dt>Customer</dt>
        <dd>{partyName(parties.customer)}</dd>
        <dt>Provider</dt>
        <dd>{partyName(parties.provider)}</dd>
        <dt>Opened</dt>
        <dd>{formatDate(dispute.created_at)}</dd>
        <dt>Paid</dt>
        <dd>{fmt(money?.paid_cents)}</dd>
        <dt>Bid</dt>
        <dd>{fmt(money?.bid_cents)}</dd>
        <dt>Already refunded</dt>
        <dd>{fmt(money?.refunded_cents)}</dd>
        <dt>Paid out</dt>
        <dd>{fmt((money?.transferred_cents ?? 0) - (money?.reversed_cents ?? 0))}</dd>
        {dispute.stripe_dispute_status ? (
          <>
            <dt>Stripe status</dt>
            <dd>{dispute.stripe_dispute_status.replace(/_/g, ' ')}</dd>
          </>
        ) : null}
        {dispute.resolution ? (
          <>
            <dt>Decision</dt>
            <dd>{`${OUTCOMES.find((o) => o.value === dispute.resolution)?.label ?? dispute.resolution}${dispute.resolution_note ? `: ${dispute.resolution_note}` : ''}`}</dd>
          </>
        ) : null}
      </dl>

      <p className="notice" role="status">
        {done}
      </p>

      {dispute.source === 'chargeback' ? <p className="muted">Chargebacks are decided by the card network through Stripe.</p> : null}

      {resolvable && !done ? (
        <form onSubmit={submit} noValidate className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <fieldset className="radio-row">
            <legend>Decision</legend>
            {OUTCOMES.map((o) => (
              <label key={o.value} className="radio-option">
                <input type="radio" name="dispute-outcome" value={o.value} checked={outcome === o.value} onChange={() => setOutcome(o.value)} />
                {o.label}
              </label>
            ))}
          </fieldset>
          {outcome === 'partial_refund' ? (
            <div className="field">
              <label htmlFor="dispute-amount">Refund amount (EUR)</label>
              <input id="dispute-amount" className="input" type="number" inputMode="decimal" min={0.01} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="dispute-amount-hint" />
              <p id="dispute-amount-hint" className="muted">
                {`Up to ${formatMoneyCents(maxPartial, cur)}. The refund is shared between the provider's payout and the platform fee.`}
              </p>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="dispute-note">Note to both parties</label>
            <textarea id="dispute-note" className="input" rows={4} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="field-error" role="alert">
            {formError}
          </p>
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Resolving…' : 'Resolve dispute'}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
