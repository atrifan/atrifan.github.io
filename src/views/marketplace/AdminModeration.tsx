'use client';

import { useState } from 'react';
import { installMode, kindLabel } from '@/src/lib/marketplace/kinds';
import type { CatalogItem } from '@/src/lib/marketplace/wire-format';
import { surfaceUrl } from '@/src/lib/surface-url';
import { KindIcon } from './KindIcon';
import { PackageBadges } from './PackageCard';

/**
 * Marketplace moderation (admin only): the Pending / Public / Private lists, and per package
 * Approve (public + verified), Hide (private) and Delete (with a confirm step). Uses
 * PATCH / DELETE /api/packages/[id] (marketplace-service moderatePackage / deletePackage).
 * Replaces the moderation part of src/views/PackageAdminPage.tsx.
 */

type Visibility = 'pending' | 'public' | 'private';
const TABS: Array<{ id: Visibility; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'public', label: 'Public' },
  { id: 'private', label: 'Private' },
];
const DATE = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

function source(item: CatalogItem): { label: string; value: string } | null {
  const mode = installMode(item.type);
  const cfg = item.config ?? {};
  if (mode === 'archive') return item.blobUrl ? { label: 'Archive', value: item.blobUrl } : null;
  if (mode === 'a2a') return typeof cfg.card_url === 'string' ? { label: 'Agent card', value: cfg.card_url } : null;
  if (typeof cfg.url === 'string') return { label: `MCP (${String(cfg.transport)})`, value: cfg.url };
  if (typeof cfg.command === 'string') return { label: 'MCP (stdio)', value: [cfg.command, ...((cfg.args as string[]) ?? [])].join(' ') };
  return null;
}

export function AdminModeration({
  visibility,
  initial,
  counts: initialCounts,
}: {
  visibility: Visibility;
  initial: CatalogItem[];
  counts: Record<Visibility, number>;
}) {
  const [items, setItems] = useState(initial);
  const [counts, setCounts] = useState(initialCounts);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const removeFromList = (item: CatalogItem, to: Visibility | null) => {
    setItems((list) => list.filter((i) => i.id !== item.id));
    setCounts((c) => ({ ...c, [visibility]: Math.max(0, c[visibility] - 1), ...(to ? { [to]: c[to] + 1 } : {}) }));
  };

  const moderate = async (item: CatalogItem, to: Visibility) => {
    setBusy(item.id);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/packages/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: to }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || String(res.status));
      removeFromList(item, to);
      setStatus(`${to === 'public' ? 'Approved' : to === 'private' ? 'Hidden' : 'Back to pending:'} ${item.name}`);
    } catch (e) {
      setError(`Could not update ${item.name}: ${e instanceof Error ? e.message : 'error'}`);
    }
    setBusy(null);
  };

  const remove = async (item: CatalogItem) => {
    setBusy(item.id);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/packages/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || String(res.status));
      removeFromList(item, null);
      setStatus(`Deleted ${item.name}`);
    } catch (e) {
      setError(`Could not delete ${item.name}: ${e instanceof Error ? e.message : 'error'}`);
    }
    setConfirming(null);
    setBusy(null);
  };

  return (
    <div className="page mp-page mp-admin">
      <header className="mp-hero">
        <div>
          <h1 className="mp-title">Moderation</h1>
          <p className="mp-lede">Review what publishers submit. Approved packages go public with a Verified badge.</p>
        </div>
      </header>

      <nav aria-label="Moderation lists" className="mp-kinds">
        <ul role="list">
          {TABS.map((t) => (
            <li key={t.id}>
              <a
                className="mp-chip"
                href={surfaceUrl('marketplace', t.id === 'pending' ? '/admin' : `/admin?status=${t.id}`)}
                aria-current={visibility === t.id ? 'true' : undefined}
              >
                {t.label}
                <span className="mp-chip-count" aria-hidden="true">
                  {counts[t.id]}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div role="status" aria-live="polite" className="mp-notice-slot">
        {status && <p className="mp-notice mp-notice-ok">{status}</p>}
      </div>
      <div role="alert" className="mp-notice-slot">{error && <p className="mp-notice mp-notice-error">{error}</p>}</div>

      {items.length === 0 ? (
        <div className="mp-empty">
          <h2 className="mp-empty-title">Nothing here</h2>
          <p className="muted">{visibility === 'pending' ? 'No packages are waiting for review.' : `No ${visibility} packages.`}</p>
        </div>
      ) : (
        <div className="mp-admin-list">
          {items.map((item) => {
            const src = source(item);
            const headingId = `mod-${item.id}`;
            const isBusy = busy === item.id;
            return (
              <article key={item.id} className="mp-card mp-admin-card" aria-labelledby={headingId}>
                <div className="mp-card-top">
                  <span className="mp-kind-icon">
                    <KindIcon kind={item.type} />
                  </span>
                  <span className="mp-pill">{kindLabel(item.type)}</span>
                  <PackageBadges verified={item.verified} translatedFrom={item.translatedFrom} />
                </div>
                <div className="mp-card-head">
                  <h2 id={headingId} className="mp-card-title">
                    {item.name}
                  </h2>
                  <p className="mp-publisher">
                    by {item.publisher} · <span className="mp-mono">{item.id}</span> · v{item.version}
                  </p>
                </div>
                {item.description && <p className="mp-card-desc">{item.description}</p>}
                <dl className="mp-facts">
                  {src && (
                    <>
                      <dt>{src.label}</dt>
                      <dd className="mp-mono mp-break">{src.value}</dd>
                    </>
                  )}
                  <dt>Owner</dt>
                  <dd className="mp-mono">{item.ownerUserId ?? 'admin upload'}</dd>
                  <dt>Updated</dt>
                  <dd>{DATE.format(new Date(item.updatedAt))}</dd>
                </dl>
                <div className="mp-admin-actions">
                  {visibility !== 'public' && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={isBusy} onClick={() => void moderate(item, 'public')} aria-label={`Approve ${item.name}`}>
                      Approve
                    </button>
                  )}
                  {visibility !== 'private' && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={isBusy} onClick={() => void moderate(item, 'private')} aria-label={`Hide ${item.name}`}>
                      Hide
                    </button>
                  )}
                  {confirming === item.id ? (
                    <>
                      <button type="button" className="btn btn-sm mp-btn-danger" disabled={isBusy} onClick={() => void remove(item)} aria-label={`Confirm delete ${item.name}`}>
                        Confirm delete
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm mp-btn-danger-quiet" disabled={isBusy} onClick={() => setConfirming(item.id)} aria-label={`Delete ${item.name}`}>
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
