'use client';

/**
 * Hub /admin/activity: marketplace installs and publishes, gigs payments with the commission
 * we earned, payouts, refunds and disputes for a date range (default: the last 30 days), with
 * totals. A thin client over GET /api/admin/activity (src/lib/activity/admin-activity-service.ts).
 */
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { formatDay, formatMoney } from '@/src/lib/activity/format';
import type { AdminActivity } from '@/src/lib/activity/admin-activity-service';
import '@/styles/activity.css';

interface Column<T> {
  label: string;
  num?: boolean;
  cell: (row: T) => ReactNode;
}

function Section<T extends { at: string }>({ id, title, rows, columns, rowKey }: { id: string; title: string; rows: T[]; columns: Column<T>[]; rowKey: (row: T, i: number) => string }) {
  return (
    <section className="act-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {rows.length === 0 ? (
        <p className="act-empty">Nothing in this range</p>
      ) : (
        <div className="act-table-wrap">
          <table className="act-table">
            <caption className="visually-hidden">{title}</caption>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} scope="col" className={c.num ? 'num' : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={rowKey(r, i)}>
                  {columns.map((c) => (
                    <td key={c.label} data-label={c.label} className={c.num ? 'num' : undefined}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const when = <T extends { at: string }>(): Column<T> => ({ label: 'Date', cell: (r) => <time dateTime={r.at}>{formatDay(r.at)}</time> });

export function AdminActivityView() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<AdminActivity | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (range: { from?: string; to?: string }) => {
    setLoading(true);
    setError('');
    const q = new URLSearchParams();
    if (range.from) q.set('from', range.from);
    if (range.to) q.set('to', range.to);
    try {
      const qs = q.toString();
      const res = await fetch(`/api/admin/activity${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as (AdminActivity & { message?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.message || "We couldn't load the activity. Try again.");
      setData(body);
      setFrom(body.range.from);
      setTo(body.range.to);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't load the activity. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load({});
  }, [load]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    void load({ from, to });
  };

  const t = data?.totals;

  return (
    <div className="page act-page">
      <header className="act-header">
        <h1>Activity</h1>
        <p className="act-lede">Installs, publishes and money across Tulzo for a date range (UTC days).</p>
      </header>

      <section className="act-section" aria-labelledby="aa-range">
        <h2 id="aa-range">Date range</h2>
        <form className="act-filters" onSubmit={apply}>
          <div className="act-field">
            <label htmlFor="aa-from">From</label>
            <input id="aa-from" type="date" className="act-input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="act-field">
            <label htmlFor="aa-to">To</label>
            <input id="aa-to" type="date" className="act-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="act-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              Apply
            </button>
          </div>
        </form>
        <p className="act-error" role="alert">
          {error}
        </p>
      </section>

      {!data && loading && <p className="act-note">Loading…</p>}

      {data && t && (
        <>
          <section className="act-section" aria-labelledby="aa-totals">
            <h2 id="aa-totals">Totals</h2>
            <dl className="act-stats">
              <div className="act-stat">
                <dt>Installs</dt>
                <dd>{t.installs}</dd>
              </div>
              <div className="act-stat">
                <dt>Publishes</dt>
                <dd>{t.publishes}</dd>
              </div>
              <div className="act-stat">
                <dt>Payments</dt>
                <dd>{formatMoney(t.paymentsCents)}</dd>
              </div>
              <div className="act-stat">
                <dt>Commission earned</dt>
                <dd>{formatMoney(t.commissionCents)}</dd>
              </div>
              <div className="act-stat">
                <dt>Payouts</dt>
                <dd>{formatMoney(t.payoutsCents)}</dd>
              </div>
              <div className="act-stat">
                <dt>Refunds</dt>
                <dd>{formatMoney(t.refundsCents)}</dd>
              </div>
              <div className="act-stat">
                <dt>Disputes</dt>
                <dd>{t.disputes}</dd>
              </div>
            </dl>
            <p className="act-note">
              {plural(t.paymentsCount, 'payment')}, {plural(t.payoutsCount, 'payout')} and {plural(t.refundsCount, 'refund')} from {formatDay(data.range.from)} to {formatDay(data.range.to)}.
            </p>
          </section>

          <Section
            id="aa-installs"
            title="Marketplace installs"
            rows={data.installs}
            rowKey={(r, i) => `${r.packageId}-${r.at}-${i}`}
            columns={[when(), { label: 'Package', cell: (r) => r.packageName }, { label: 'Version', cell: (r) => r.version ?? '—' }]}
          />
          <Section
            id="aa-publishes"
            title="Publishes"
            rows={data.publishes}
            rowKey={(r, i) => `${r.packageId}-${r.version}-${i}`}
            columns={[when(), { label: 'Package', cell: (r) => r.packageName }, { label: 'Version', cell: (r) => r.version ?? '—' }, { label: 'Status', cell: (r) => r.visibility }]}
          />
          <Section
            id="aa-payments"
            title="Payments"
            rows={data.payments}
            rowKey={(r) => r.id}
            columns={[
              when(),
              { label: 'Job', cell: (r) => r.jobTitle },
              { label: 'Amount', num: true, cell: (r) => formatMoney(r.amountCents) },
              { label: 'Commission', num: true, cell: (r) => formatMoney(r.feeCents) },
              { label: 'Status', cell: (r) => r.status },
            ]}
          />
          <Section
            id="aa-payouts"
            title="Payouts"
            rows={data.payouts}
            rowKey={(r) => r.id}
            columns={[when(), { label: 'Job', cell: (r) => r.jobTitle }, { label: 'Amount', num: true, cell: (r) => formatMoney(r.amountCents) }, { label: 'Status', cell: (r) => r.status }]}
          />
          <Section
            id="aa-refunds"
            title="Refunds"
            rows={data.refunds}
            rowKey={(r) => r.id}
            columns={[when(), { label: 'Job', cell: (r) => r.jobTitle }, { label: 'Amount', num: true, cell: (r) => formatMoney(r.amountCents) }, { label: 'Status', cell: (r) => r.status }]}
          />
          <Section
            id="aa-disputes"
            title="Disputes"
            rows={data.disputes}
            rowKey={(r) => r.id}
            columns={[when(), { label: 'Job', cell: (r) => r.jobTitle }, { label: 'Category', cell: (r) => r.category.replace(/_/g, ' ') }, { label: 'Status', cell: (r) => r.status }]}
          />
        </>
      )}
    </div>
  );
}
