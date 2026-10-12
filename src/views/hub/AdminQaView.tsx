'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate, formatMoneyCents } from '@/src/lib/format';
import { ArrowRightIcon } from '@/src/components/brand/UiIcons';

/**
 * Hub /admin/qa: queue → detail drawer → reveal credentials (confirmed, audited) → verdict.
 * A thin client over app/api/admin/qa/*, which wrap src/lib/qa/qa-review-service.ts.
 */

type QueueStatus = 'awaiting_qa' | 'in_review' | 'validated' | 'requires_changes' | 'rejected';
const STATUSES: { value: QueueStatus; label: string }[] = [
  { value: 'awaiting_qa', label: 'Awaiting QA' },
  { value: 'in_review', label: 'In review' },
  { value: 'validated', label: 'Validated' },
  { value: 'requires_changes', label: 'Requires changes' },
  { value: 'rejected', label: 'Rejected' },
];

interface Party {
  user_id: string;
  name: string | null;
  email: string | null;
  plan: string;
}

interface QueueItem {
  submission_id: string;
  job_title: string | null;
  attempt: number;
  status: string;
  submitted_at: string;
  provider?: Party;
  customer?: Party;
  price_cents: number | null;
  commission_cents: number | null;
  currency: string | null;
  checks: string[];
}

interface Detail {
  submission?: { id: string; status: string; attempt: number; repo_full_name?: string; commit_sha?: string };
  job?: { title?: string; description?: string; category?: string } | null;
  spec?: { requirements?: unknown; deliverables?: unknown; acceptance_criteria?: unknown; constraints?: unknown } | null;
  contract_version?: { price_cents?: number; fee_cents?: number; currency?: string; deadline?: string } | null;
  qa?: { checks?: string[]; reserved_credits?: number; used_credits?: number; status?: string };
  previous_reviews?: Array<{ id: string; attempt: number | null; verdict: string; reason: string | null }>;
}

interface Credentials {
  repo_url: string;
  commit_sha: string;
  pat_token: string;
  pat_expires_at: string | null;
  review_key: { key: string; expires_at: string; cap_credits: number; chat_url: string };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) throw new Error(body.message || body.error || `Request failed (${res.status})`);
  return body;
}

const partyName = (p?: Party) => p?.name || p?.email || p?.user_id || '—';

export function AdminQaView() {
  const [status, setStatus] = useState<QueueStatus>('awaiting_qa');
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<QueueItem | null>(null);

  const load = useCallback(async (s: QueueStatus) => {
    setError('');
    try {
      const body = await api<{ items: QueueItem[] }>(`/api/admin/qa/queue?status=${s}`);
      setItems(body.items);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Could not load the queue');
    }
  }, []);

  useEffect(() => {
    setItems(null);
    void load(status);
  }, [status, load]);

  return (
    <div className="page">
      <header className="account-header">
        <h1>QA review</h1>
        <p className="muted">
          Review gig submissions. Clone the pinned commit on your own machine; never run submitted code on Tulzo.
        </p>
      </header>

      <div className="form-row" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="field">
          <label htmlFor="qa-status">Status</label>
          <select id="qa-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as QueueStatus)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {items === null && <p className="muted">Loading…</p>}
      {items && items.length === 0 && !error && (
        <p className="empty-state">{status === 'awaiting_qa' ? 'Nothing waiting for QA.' : 'No submissions with this status.'}</p>
      )}
      {items && items.length > 0 && (
        <div className="table-wrap">
          <table className="data-table stack-sm">
            <caption>QA queue</caption>
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">From <ArrowRightIcon /> To</th>
                <th scope="col" className="num">Price</th>
                <th scope="col" className="num">Commission</th>
                <th scope="col">Plans</th>
                <th scope="col" className="num">Attempt</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.submission_id}>
                  <td data-label="Job">
                    {it.job_title ?? 'Untitled job'}
                    <br />
                    <span className="muted">
                      {formatDate(it.submitted_at)} · {it.checks.join(', ')}
                    </span>
                  </td>
                  <td data-label="From / To">
                    {partyName(it.provider)} <ArrowRightIcon /> {partyName(it.customer)}
                  </td>
                  <td data-label="Price" className="num">
                    {formatMoneyCents(it.price_cents, it.currency)}
                  </td>
                  <td data-label="Commission" className="num">
                    {formatMoneyCents(it.commission_cents, it.currency)}
                  </td>
                  <td data-label="Plans">
                    {it.provider?.plan ?? '—'} <ArrowRightIcon /> {it.customer?.plan ?? '—'}
                  </td>
                  <td data-label="Attempt" className="num">
                    {it.attempt}
                  </td>
                  <td data-label="">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(it)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <ReviewDrawer
          item={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            void load(status);
          }}
        />
      )}
    </div>
  );
}

function List({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="muted">—</p>;
    return (
      <ul className="bullets">
        {value.map((v, i) => (
          <li key={i}>{typeof v === 'string' ? v : JSON.stringify(v)}</li>
        ))}
      </ul>
    );
  }
  if (value === null || value === undefined || value === '') return <p className="muted">—</p>;
  return <p>{typeof value === 'string' ? value : JSON.stringify(value)}</p>;
}

type Verdict = 'validated' | 'requires_changes' | 'rejected';

function ReviewDrawer({ item, onClose, onDone }: { item: QueueItem; onClose: () => void; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [credsError, setCredsError] = useState('');
  const [verdict, setVerdict] = useState<Verdict | ''>('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const title = item.job_title ?? 'Untitled job';
  const base = `/api/admin/qa/submissions/${item.submission_id}`;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d?.addEventListener('cancel', onCancel);
    return () => d?.removeEventListener('cancel', onCancel);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const body = await api<Detail>(base);
        if (alive) setDetail(body);
      } catch (err) {
        if (alive) setDetailError(err instanceof Error ? err.message : 'Could not load the submission');
      }
    })();
    return () => {
      alive = false;
    };
  }, [base]);

  const reveal = async () => {
    setConfirming(false);
    setCredsError('');
    setBusy(true);
    try {
      setCreds(await api<Credentials>(`${base}/credentials`, { method: 'POST' }));
    } catch (err) {
      setCredsError(err instanceof Error ? err.message : 'Could not reveal the credentials');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved('');
    if (!verdict) {
      setFormError('Choose a verdict.');
      return;
    }
    if (verdict !== 'validated' && !reason.trim()) {
      setFormError('A reason is required for this verdict.');
      return;
    }
    setFormError('');
    setBusy(true);
    try {
      const body: { verdict: Verdict; reason?: string } = { verdict };
      if (reason.trim()) body.reason = reason.trim();
      const res = await api<{ submission_status: string }>(`${base}/verdict`, { method: 'POST', body: JSON.stringify(body) });
      setSaved(`Verdict saved. The submission is now ${res.submission_status.replace(/_/g, ' ')}.`);
      onDone();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the verdict');
    } finally {
      setBusy(false);
    }
  };

  const cv = detail?.contract_version;
  return (
    <dialog ref={ref} className="drawer" aria-labelledby="qa-drawer-title">
      <div className="drawer-inner">
        <div className="drawer-head">
          <div>
            <p className="eyebrow">Attempt {item.attempt}</p>
            <h2 id="qa-drawer-title">{title}</h2>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {detailError && <p className="field-error">{detailError}</p>}
        {!detail && !detailError && <p className="muted">Loading…</p>}
        {detail && (
          <>
            <section className="panel" aria-labelledby="qa-job">
              <h3 id="qa-job">Job</h3>
              <List value={detail.job?.description} />
              <dl className="kv">
                <dt>From <ArrowRightIcon /> To</dt>
                <dd>
                  {partyName(item.provider)} <ArrowRightIcon /> {partyName(item.customer)}
                </dd>
                <dt>Price</dt>
                <dd>{formatMoneyCents(cv?.price_cents ?? item.price_cents, cv?.currency ?? item.currency)}</dd>
                <dt>Commission</dt>
                <dd>{formatMoneyCents(cv?.fee_cents ?? item.commission_cents, cv?.currency ?? item.currency)}</dd>
                <dt>Repository</dt>
                <dd>
                  {detail.submission?.repo_full_name ?? '—'} @ <code>{detail.submission?.commit_sha?.slice(0, 12) ?? '—'}</code>
                </dd>
                <dt>QA checks</dt>
                <dd>
                  {(detail.qa?.checks ?? item.checks).join(', ')} · {detail.qa?.used_credits ?? 0} of {detail.qa?.reserved_credits ?? 0}{' '}
                  reserved credits used
                </dd>
              </dl>
            </section>
            <section className="panel" aria-labelledby="qa-spec">
              <h3 id="qa-spec">Spec</h3>
              <p className="field-label">Requirements</p>
              <List value={detail.spec?.requirements} />
              <p className="field-label">Acceptance criteria</p>
              <List value={detail.spec?.acceptance_criteria} />
              {detail.spec?.deliverables !== undefined && (
                <>
                  <p className="field-label">Deliverables</p>
                  <List value={detail.spec.deliverables} />
                </>
              )}
            </section>
            {detail.previous_reviews && detail.previous_reviews.length > 0 && (
              <section className="panel" aria-labelledby="qa-prev">
                <h3 id="qa-prev">Earlier reviews</h3>
                <ul className="bullets">
                  {detail.previous_reviews.map((r) => (
                    <li key={r.id}>
                      Attempt {r.attempt ?? '?'}: {r.verdict.replace(/_/g, ' ')}
                      {r.reason ? `: ${r.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section className="panel" aria-labelledby="qa-creds">
          <h3 id="qa-creds">Credentials</h3>
          {!creds && !confirming && (
            <div>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)} disabled={busy}>
                Reveal credentials
              </button>
            </div>
          )}
          {confirming && (
            <div className="notice" role="group" aria-label="Confirm reveal">
              <p>
                This shows the provider&apos;s GitHub token and issues a review key on the customer&apos;s QA credits. It is
                recorded in the audit log and starts the review.
              </p>
              <div className="actions" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="btn btn-primary" onClick={() => void reveal()}>
                  Reveal
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {credsError && <p className="field-error">{credsError}</p>}
          {creds && (
            <dl className="kv">
              <dt>Repository</dt>
              <dd>
                <a href={creds.repo_url} target="_blank" rel="noreferrer">
                  {creds.repo_url}
                </a>
              </dd>
              <dt>Commit</dt>
              <dd>
                <code className="secret">{creds.commit_sha}</code>
              </dd>
              <dt>GitHub token</dt>
              <dd>
                <code className="secret">{creds.pat_token}</code>
              </dd>
              <dt>Review key</dt>
              <dd>
                <code className="secret">{creds.review_key.key}</code>
                <span className="muted">
                  {creds.review_key.cap_credits} credits, expires {formatDate(creds.review_key.expires_at)}. Use it with{' '}
                  {creds.review_key.chat_url}.
                </span>
              </dd>
            </dl>
          )}
        </section>

        <form className="panel" aria-labelledby="qa-verdict" onSubmit={(e) => void submit(e)} noValidate>
          <h3 id="qa-verdict">Verdict</h3>
          <fieldset className="radio-row" role="radiogroup" aria-label="Verdict">
            {(
              [
                ['validated', 'Validated'],
                ['requires_changes', 'Requires changes'],
                ['rejected', 'Rejected'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="radio-option">
                <input type="radio" name="verdict" value={value} checked={verdict === value} onChange={() => setVerdict(value)} />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="qa-reason">Reason</label>
            <textarea
              id="qa-reason"
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby="qa-reason-help"
            />
            <span id="qa-reason-help" className="muted">
              Required for Requires changes and Rejected. Both parties see it.
            </span>
          </div>
          <p className="field-error" role="alert">
            {formError}
          </p>
          <p className="notice" role="status">
            {saved}
          </p>
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy || !!saved}>
              Submit verdict
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
