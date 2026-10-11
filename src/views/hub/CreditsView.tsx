'use client';

import { useEffect, useState } from 'react';
import { MAX_TOP_UP_USD, MIN_TOP_UP_USD, TOP_UP_PRESETS_USD, balanceCredits, creditsForUsd, validateTopUp } from '@/src/lib/credits';
import { formatCredits, formatDate, formatSignedCredits, formatUsd } from '@/src/lib/format';
import { planInfo } from '@/src/lib/plan-catalog';
import { surfaceUrl } from '@/src/lib/surface-url';
import type { PlanKey } from '@/src/lib/plans';

interface Transaction {
  id: number | string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

interface PaidStats {
  remainingBalance: number;
  totalSpent: number;
  totalDeposited: number;
  purchaseHistory: Transaction[];
}

export type TopUpResultParam = 'success' | 'canceled' | null;

/** Deposits add credits; everything else (QA reserves, charges) takes them away. */
const signedUsd = (tx: Transaction) => (tx.type === 'deposit' || tx.type === 'refund' || tx.type === 'release' ? 1 : -1) * Math.abs(tx.amount);

async function checkout(amountUsd: number): Promise<string> {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountUsd }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error || 'Checkout could not start. Try again.');
  return body.url;
}

export function CreditsView({ plan, topup }: { plan: PlanKey; topup: TopUpResultParam }) {
  const [stats, setStats] = useState<PaidStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const info = planInfo(plan);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/paid-stats', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as PaidStats;
        if (alive) setStats(body);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const buy = async (raw: number) => {
    const v = validateTopUp(raw);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError('');
    setBusy(v.amountUsd);
    try {
      window.location.assign(await checkout(v.amountUsd));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout could not start. Try again.');
      setBusy(null);
    }
  };

  const notice =
    topup === 'success'
      ? 'Payment received. Your credits appear here in a moment.'
      : topup === 'canceled'
        ? 'Checkout canceled. Nothing was charged.'
        : '';

  return (
    <div className="page account-page">
      <header className="account-header">
        <h1>Credits</h1>
        <p className="muted">One balance for everything AI on Tulzo: your assistant&apos;s chats and QA on gigs. 1 credit = $0.01.</p>
      </header>

      <p className="notice" role="status">
        {notice}
      </p>

      <section className="panel" aria-labelledby="balance-title">
        <h2 id="balance-title">Balance</h2>
        {failed && <p className="field-error">We couldn&apos;t load your balance. Refresh to try again.</p>}
        {!stats && !failed && <p className="muted">Loading…</p>}
        {stats && (
          <div className="balance">
            <span className="balance-value">{formatCredits(balanceCredits(stats.remainingBalance))}</span>
            <span className="muted">{formatUsd(stats.remainingBalance)}</span>
          </div>
        )}
        <p>
          <strong>{info.name} plan</strong>: {formatCredits(info.monthlyCredits)} a month.{' '}
          <span className="muted">
            Monthly credits don&apos;t roll over; credits you buy never expire.{' '}
            <a href={surfaceUrl('hub', '/pricing')}>Compare plans</a>
          </span>
        </p>
      </section>

      <section className="panel" aria-labelledby="topup-title">
        <h2 id="topup-title">Buy credits</h2>
        <p className="muted">
          You pay exactly the amount you choose. No processing fee: usage is metered at cost plus 30%, which covers
          payment fees.
        </p>
        <div className="topups">
          {TOP_UP_PRESETS_USD.map((usd) => (
            <button
              key={usd}
              type="button"
              className="btn btn-secondary topup-btn"
              onClick={() => void buy(usd)}
              disabled={busy !== null}
            >
              <span>Buy ${usd}</span>
              <small>{formatCredits(creditsForUsd(usd))}</small>
            </button>
          ))}
        </div>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault();
            void buy(custom.trim() === '' ? Number.NaN : Number(custom));
          }}
          noValidate
        >
          <div className="field">
            <label htmlFor="topup-custom">Custom amount (USD)</label>
            <input
              id="topup-custom"
              className="input"
              type="number"
              inputMode="numeric"
              min={MIN_TOP_UP_USD}
              max={MAX_TOP_UP_USD}
              step={1}
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                setError('');
              }}
              aria-describedby="topup-error topup-help"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            Buy credits
          </button>
        </form>
        <p id="topup-help" className="muted">
          From ${MIN_TOP_UP_USD} to ${MAX_TOP_UP_USD}, whole dollars. You&apos;ll pay on Stripe and come back here.
        </p>
        <p id="topup-error" className="field-error" role="alert">
          {error}
        </p>
      </section>

      <section className="panel" aria-labelledby="history-title">
        <h2 id="history-title">Transaction history</h2>
        {stats && stats.purchaseHistory.length === 0 && <p className="empty-state">No transactions yet.</p>}
        {stats && stats.purchaseHistory.length > 0 && (
          <div className="table-wrap">
            <table className="data-table stack-sm">
              <caption className="visually-hidden">Transaction history</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="num">
                    Credits
                  </th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.purchaseHistory.map((tx) => {
                  const usd = signedUsd(tx);
                  return (
                    <tr key={tx.id}>
                      <td data-label="Date">{formatDate(tx.createdAt)}</td>
                      <td data-label="Description">{tx.description || tx.type}</td>
                      <td data-label="Credits" className={`num${usd > 0 ? ' amount-plus' : ''}`}>
                        {formatSignedCredits(creditsForUsd(usd))}
                      </td>
                      <td data-label="Amount" className="num">
                        {formatUsd(Math.abs(usd))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
