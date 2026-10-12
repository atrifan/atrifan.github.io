'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { connectCard, connectNotice, type ConnectReturn } from '@/src/lib/connect-view';
import { CONNECT_COUNTRIES } from '@/src/lib/connect-countries';
import { groupPreferences } from '@/src/lib/notify/preference-groups';
import { ProfileReputation } from './ProfileReputation';

interface ConnectStatusView {
  connected: boolean;
  connect_status: string;
  country: string | null;
}

interface Preference {
  type: string;
  label: string;
  emailEnabled: boolean;
  inAppEnabled?: boolean;
}

/** Hub /profile: identity, Stripe Connect, email notifications, reviews and trust (Phase 5). */
export function ProfileView({ connectParam }: { connectParam: ConnectReturn }) {
  return (
    <div className="page account-page">
      <header className="account-header">
        <h1>Profile</h1>
        <p className="muted">Your account, payouts and the emails we send you.</p>
      </header>
      <AccountPanel />
      <ConnectPanel connectParam={connectParam} />
      <NotificationsPanel />
      <ProfileReputation />
    </div>
  );
}

function AccountPanel() {
  const { user, isLoaded } = useUser();
  const name = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—';
  const email = user?.primaryEmailAddress?.emailAddress ?? '—';
  return (
    <section className="panel" aria-labelledby="account-title" aria-busy={!isLoaded}>
      <div className="panel-head">
        <h2 id="account-title">Account</h2>
        <a href="/profile/account" className="btn btn-secondary btn-sm">
          Manage account
        </a>
      </div>
      <dl className="kv">
        <dt>Name</dt>
        <dd>{isLoaded ? name : 'Loading…'}</dd>
        <dt>Email</dt>
        <dd>{isLoaded ? email : 'Loading…'}</dd>
      </dl>
    </section>
  );
}

async function startOnboarding(country: string): Promise<string> {
  const res = await fetch('/api/connect/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country }),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !body.url) throw new Error(body.message || 'Stripe could not be reached. Try again.');
  return body.url;
}

function ConnectPanel({ connectParam }: { connectParam: ConnectReturn }) {
  const [view, setView] = useState<ConnectStatusView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [country, setCountry] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const url = connectParam ? '/api/connect/status?refresh=1' : '/api/connect/status';
    (async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as ConnectStatusView;
        if (alive) setView(body);
      } catch {
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [connectParam]);

  const card = connectCard(view);
  const notice = view ? connectNotice(connectParam, card.status) : null;

  const go = useCallback(async (code: string) => {
    setError('');
    setBusy(true);
    try {
      window.location.assign(await startOnboarding(code));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }, []);

  const onLink = () => {
    if (!country) {
      setError('Choose your country first.');
      return;
    }
    void go(country);
  };

  return (
    <section className="panel" aria-labelledby="connect-title">
      <div className="panel-head">
        <h2 id="connect-title">Stripe payouts</h2>
        {view && (
          <span className="status-pill" data-tone={card.tone}>
            {card.label}
          </span>
        )}
      </div>
      <p>
        You need a linked Stripe account to bid on gigs and get paid. You are paid your full bid amount; Tulzo&apos;s
        commission is added on top of the price the customer pays.
      </p>
      <p className="notice" role="status">
        {notice ?? ''}
      </p>
      {loadError && <p className="field-error">We couldn&apos;t load your Stripe status. Refresh to try again.</p>}
      {!view && !loadError && <p className="muted">Checking your Stripe account…</p>}
      {view && (
        <>
          <p className="muted">{card.description}</p>
          {card.action === 'link' && (
            <div className="form-row">
              <div className="field">
                <label htmlFor="connect-country">Country</label>
                <select
                  id="connect-country"
                  className="input"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setError('');
                  }}
                  aria-describedby="connect-country-help"
                >
                  <option value="">Choose your country</option>
                  {CONNECT_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-primary" onClick={onLink} disabled={busy}>
                Link Stripe account
              </button>
            </div>
          )}
          {card.action === 'link' && (
            <p id="connect-country-help" className="muted">
              Payouts are available in the EEA, the UK and Switzerland for now.
            </p>
          )}
          {card.action === 'continue' && (
            <div className="form-row">
              <button type="button" className="btn btn-primary" onClick={() => void go(view.country ?? '')} disabled={busy}>
                Continue on Stripe
              </button>
            </div>
          )}
          {card.action === 'dashboard' && (
            <div className="form-row">
              <button type="button" className="btn btn-secondary" onClick={() => void go(view.country ?? '')} disabled={busy}>
                Open Stripe dashboard
              </button>
            </div>
          )}
        </>
      )}
      <p className="field-error" role="alert">
        {error}
      </p>
    </section>
  );
}

function NotificationsPanel() {
  const [prefs, setPrefs] = useState<Preference[] | null>(null);
  // The server says whether the admin-only group applies (src/lib/admin.ts); hidden unless it does.
  const [admin, setAdmin] = useState(false);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/notifications/preferences', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { preferences: Preference[]; admin?: boolean };
        if (alive) {
          setAdmin(body.admin === true);
          setPrefs(body.preferences);
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async (change: Record<string, unknown>, optimistic: (p: Preference[]) => Preference[]) => {
    const before = prefs;
    setPrefs((p) => (p ? optimistic(p) : p));
    setStatus('Saving…');
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json().catch(() => null)) as { preferences?: Preference[] } | null;
      if (body?.preferences) setPrefs(body.preferences);
      setStatus('Saved');
    } catch {
      setPrefs(before);
      setStatus("Couldn't save. Try again.");
    }
  };

  const toggle = (type: string, enabled: boolean) =>
    save({ preferences: { [type]: enabled } }, (p) => p.map((x) => (x.type === type ? { ...x, emailEnabled: enabled } : x)));

  const toggleInApp = (groupId: string, types: string[], enabled: boolean) =>
    save({ inApp: { [groupId]: enabled } }, (p) => p.map((x) => (types.includes(x.type) ? { ...x, inAppEnabled: enabled } : x)));

  return (
    <>
    <section className="panel" aria-labelledby="inapp-title">
      <div className="panel-head">
        <h2 id="inapp-title">In-app notifications</h2>
      </div>
      <p className="muted">What shows up under the bell and on your notifications page. Each group is on unless you switch it off.</p>
      {failed && <p className="field-error">We couldn&apos;t load your preferences. Refresh to try again.</p>}
      {!prefs && !failed && <p className="muted">Loading…</p>}
      {prefs && (
        <ul className="switch-list" role="list">
          {groupPreferences(prefs, { admin }).map((group) => {
            const id = `inapp-${group.id}`;
            return (
              <li key={group.id} className="switch-row">
                <label htmlFor={id}>{group.title}</label>
                <input
                  id={id}
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={group.inAppEnabled}
                  aria-checked={group.inAppEnabled}
                  onChange={(e) => void toggleInApp(group.id, group.items.map((i) => i.type), e.target.checked)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
    <section className="panel" aria-labelledby="notify-title">
      <div className="panel-head">
        <h2 id="notify-title">Email notifications</h2>
        <span className="muted" role="status">
          {status}
        </span>
      </div>
      <p className="muted">Choose which emails we send you. Account and security emails always go out.</p>
      {failed && <p className="field-error">We couldn&apos;t load your preferences. Refresh to try again.</p>}
      {!prefs && !failed && <p className="muted">Loading…</p>}
      {prefs &&
        groupPreferences(prefs, { admin }).map((group) => (
          <div key={group.id} className="switch-group" role="group" aria-labelledby={`notify-group-${group.id}`}>
            <h3 id={`notify-group-${group.id}`} className="switch-group-title">
              {group.title}
            </h3>
            <ul className="switch-list" role="list">
              {group.items.map((p) => {
                const id = `notify-${p.type}`;
                return (
                  <li key={p.type} className="switch-row">
                    <label htmlFor={id}>{p.label}</label>
                    <input
                      id={id}
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={p.emailEnabled}
                      aria-checked={p.emailEnabled}
                      onChange={(e) => void toggle(p.type, e.target.checked)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
    </section>
    </>
  );
}
