'use client';

/**
 * Gigs /activity ("My activity"): what you bought and sold, and when. A customer summary
 * (jobs, bids received, contracts, payments, deliveries), a provider summary (bids, contracts
 * won, payouts, reviews) and one ledger with client-side filters and a CSV export of what the
 * filters show. A thin client over GET /api/activity/gigs.
 */
import { useEffect, useMemo, useState } from 'react';
import { ledgerCsv } from '@/src/lib/activity/csv';
import { formatDay, formatMoney } from '@/src/lib/activity/format';
import { LEDGER_KINDS, LEDGER_KIND_LABELS, filterLedger, type CustomerSummary, type LedgerEntry, type LedgerFilter, type ProviderSummary } from '@/src/lib/activity/ledger';
import '@/styles/activity.css';

interface Activity {
  currency: string;
  customer: CustomerSummary;
  provider: ProviderSummary;
  ledger: LedgerEntry[];
}

const money = (cents: number | null) => (cents === null ? '—' : formatMoney(cents));

function Stat({ term, value }: { term: string; value: string | number }) {
  return (
    <div className="act-stat">
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function GigsActivity() {
  const [data, setData] = useState<Activity | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Required<LedgerFilter>>({ role: '', kind: '', from: '', to: '' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/activity/gigs', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Activity;
        if (alive) setData(body);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo(() => filterLedger(data?.ledger ?? [], filter), [data, filter]);
  const set = (patch: Partial<LedgerFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <div className="page act-page">
      <header className="act-header">
        <h1>My activity</h1>
        <p className="act-lede">Everything you bought and sold on Gigs, and when.</p>
      </header>

      {failed && <p className="act-error">We couldn&apos;t load your activity. Refresh to try again.</p>}
      {!data && !failed && <p className="act-note">Loading…</p>}

      {data && (
        <>
          <section className="act-section" aria-labelledby="ga-customer">
            <h2 id="ga-customer">As a customer</h2>
            <dl className="act-stats">
              <Stat term="Jobs posted" value={data.customer.jobsPosted} />
              <Stat term="Bids received" value={data.customer.bidsReceived} />
              <Stat term="Contracts" value={data.customer.contracts} />
              <Stat term="Payments made" value={formatMoney(data.customer.paymentsCents)} />
              <Stat term="Deliveries" value={data.customer.deliveries} />
            </dl>
            <p className="act-note">Payments include the Tulzo fee of {formatMoney(data.customer.commissionCents)}.</p>
          </section>

          <section className="act-section" aria-labelledby="ga-provider">
            <h2 id="ga-provider">As a provider</h2>
            <dl className="act-stats">
              <Stat term="Bids placed" value={data.provider.bidsPlaced} />
              <Stat term="Contracts won" value={data.provider.contractsWon} />
              <Stat term="Payouts received" value={formatMoney(data.provider.payoutsCents)} />
              <Stat term="Reviews" value={data.provider.reviews} />
            </dl>
          </section>

          <section className="act-section" aria-labelledby="ga-ledger">
            <div className="act-section-head">
              <h2 id="ga-ledger">Ledger</h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => download('gigs-activity.csv', ledgerCsv(rows, data.currency))}
                disabled={rows.length === 0}
              >
                Export CSV
              </button>
            </div>
            <div className="act-filters">
              <div className="act-field">
                <label htmlFor="ga-role">Role</label>
                <select id="ga-role" className="act-input" value={filter.role} onChange={(e) => set({ role: e.target.value as LedgerFilter['role'] })}>
                  <option value="">All roles</option>
                  <option value="customer">Customer</option>
                  <option value="provider">Provider</option>
                </select>
              </div>
              <div className="act-field">
                <label htmlFor="ga-kind">Event</label>
                <select id="ga-kind" className="act-input" value={filter.kind} onChange={(e) => set({ kind: e.target.value as LedgerFilter['kind'] })}>
                  <option value="">All events</option>
                  {LEDGER_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {LEDGER_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="act-field">
                <label htmlFor="ga-from">From</label>
                <input id="ga-from" type="date" className="act-input" value={filter.from} onChange={(e) => set({ from: e.target.value })} />
              </div>
              <div className="act-field">
                <label htmlFor="ga-to">To</label>
                <input id="ga-to" type="date" className="act-input" value={filter.to} onChange={(e) => set({ to: e.target.value })} />
              </div>
            </div>

            {data.ledger.length === 0 ? (
              <p className="act-empty">No activity yet</p>
            ) : rows.length === 0 ? (
              <p className="act-empty">Nothing matches these filters</p>
            ) : (
              <div className="act-table-wrap">
                <table className="act-table">
                  <caption className="visually-hidden">Activity ledger</caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Role</th>
                      <th scope="col">Event</th>
                      <th scope="col">Job</th>
                      <th scope="col" className="num">
                        Amount
                      </th>
                      <th scope="col" className="num">
                        Commission
                      </th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td data-label="Date">
                          <time dateTime={e.at}>{formatDay(e.at)}</time>
                        </td>
                        <td data-label="Role">{e.role === 'customer' ? 'Customer' : 'Provider'}</td>
                        <td data-label="Event">{LEDGER_KIND_LABELS[e.kind] ?? e.kind}</td>
                        <td data-label="Job">{e.jobTitle}</td>
                        <td data-label="Amount" className="num">
                          {money(e.amountCents)}
                        </td>
                        <td data-label="Commission" className="num">
                          {money(e.commissionCents)}
                        </td>
                        <td data-label="Status">{e.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
