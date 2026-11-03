'use client';

/**
 * Hub /admin/relay: where the chat relay's three values come from (table, environment or
 * missing), the broker JWT expiry, the allowed origins, and a button that generates and stores
 * new values. A thin client over GET/POST /api/admin/relay (src/lib/chat-v2/relay-settings.ts).
 * It never shows a secret value.
 */
import { useState } from 'react';
import type { RelayStatus } from '@/src/lib/chat-v2/relay-settings';
import { formatDate } from '@/src/lib/format';
import '@/styles/activity.css';
import { AdminSubNav } from '@/src/components/admin/AdminSubNav';

const SOURCE_LABEL = { table: 'table', env: 'env', missing: 'missing' } as const;

function daysLeft(iso: string | null): string {
  if (!iso) return '—';
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
  return days < 0 ? `expired ${-days} days ago` : `${days} days left`;
}

export function AdminRelayView({ initial }: { initial: RelayStatus }) {
  const [status, setStatus] = useState<RelayStatus>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const refresh = async () => {
    const res = await fetch('/api/admin/relay', { cache: 'no-store' });
    const body = (await res.json().catch(() => null)) as RelayStatus | null;
    if (!res.ok || !body) throw new Error("We couldn't load the relay status. Try again.");
    setStatus(body);
  };

  const generate = async () => {
    if (!confirm('Generate new relay secrets? Short-lived tokens in use may fail until clients reconnect.')) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/relay', { method: 'POST' });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; expiresAt?: string } | null;
      if (!res.ok || !body?.ok) throw new Error("We couldn't generate the secrets. Check the server settings and try again.");
      await refresh();
      setSuccess(`New secrets stored. The broker JWT expires ${formatDate(body.expiresAt ?? '')}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't generate the secrets. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    { label: 'Token secret', source: status.tokenSecret },
    { label: 'Realtime anon key', source: status.realtimeAnonKey },
    { label: 'Broker JWT', source: status.brokerJwt },
  ];

  const warnings: string[] = [];
  if (!status.canGenerate.jwtSecret) warnings.push('STORAGE_SUPABASE_JWT_SECRET (or SUPABASE_JWT_SECRET) is not set, so the broker JWT cannot be signed.');
  if (!status.canGenerate.publicKey) warnings.push('STORAGE_SUPABASE_PUBLISHABLE_KEY (or STORAGE_SUPABASE_ANON_KEY) is not set, so the realtime anon key cannot be filled.');
  if (!status.canGenerate.serviceRole) warnings.push('The service role key is not set, so the values cannot be stored in the table.');

  return (
    <div className="page act-page">
      <AdminSubNav />
      <header className="act-header">
        <h1>Chat relay</h1>
        <p className="act-lede">The server-wide values the chat relay needs. Values are never shown here.</p>
      </header>

      <section className="act-section" aria-labelledby="ar-values">
        <h2 id="ar-values">Values</h2>
        <div className="act-table-wrap">
          <table className="act-table">
            <caption className="visually-hidden">Relay values</caption>
            <thead>
              <tr>
                <th scope="col">Value</th>
                <th scope="col">Source</th>
                <th scope="col">Expiry</th>
                <th scope="col">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td data-label="Value">{r.label}</td>
                  <td data-label="Source">{SOURCE_LABEL[r.source]}</td>
                  <td data-label="Expiry">
                    {r.label === 'Broker JWT' ? (
                      <>
                        {status.brokerJwtExpiresAt ? formatDate(status.brokerJwtExpiresAt) : '—'} ({daysLeft(status.brokerJwtExpiresAt)})
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Last updated">
                    {status.updatedAt ? `${formatDate(status.updatedAt)}${status.updatedBy ? ` by ${status.updatedBy}` : ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="act-section" aria-labelledby="ar-origins">
        <h2 id="ar-origins">Allowed origins</h2>
        {status.allowedOrigins.length === 0 ? (
          <p className="act-empty">No origins listed in NEXT_PUBLIC_APP_URL or CHAT_ALLOWED_ORIGINS</p>
        ) : (
          <ul>
            {status.allowedOrigins.map((o) => (
              <li key={o}>
                <code>{o}</code>
              </li>
            ))}
          </ul>
        )}
        <p className="muted">The host a request reached is always allowed.</p>
      </section>

      {warnings.length > 0 && (
        <section className="act-section" aria-labelledby="ar-warnings">
          <h2 id="ar-warnings">Warnings</h2>
          <ul role="list">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="act-section" aria-labelledby="ar-generate">
        <h2 id="ar-generate">Generate / rotate secrets</h2>
        <p className="muted">Creates a new token secret and broker JWT, and fills the realtime anon key.</p>
        <div className="act-actions">
          <button type="button" className="btn btn-primary" onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : 'Generate / rotate secrets'}
          </button>
        </div>
        <p className="act-error" role="alert">
          {error}
        </p>
        {success && <p role="status">{success}</p>}
      </section>
    </div>
  );
}
