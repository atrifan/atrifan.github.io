'use client';

import { useCallback, useRef, useState } from 'react';
import { CATALOG_KINDS, CATEGORIES, installMode, kindLabel, type PackageKind } from '@/src/lib/marketplace/kinds';
import { ratingValue } from '@/src/lib/marketplace/format';
import type { PublisherPackageStats } from '@/src/lib/marketplace-service';
import { surfaceUrl } from '@/src/lib/surface-url';

/**
 * Publisher page: publish a package or a new version (type-specific fields; every publish lands
 * pending review), and the publisher's packages with installs, ratings and status. Posts to
 * /api/marketplace/publish with the signed-in session; reads /api/marketplace/publisher.
 */

type Transport = 'http' | 'sse' | 'stdio';

interface FormState {
  id: string;
  name: string;
  description: string;
  type: PackageKind;
  version: string;
  category: string;
  tags: string;
  longDescription: string;
  transport: Transport;
  url: string;
  command: string;
  args: string;
  tools: string;
  cardUrl: string;
}

const EMPTY: FormState = {
  id: '',
  name: '',
  description: '',
  type: 'mcp',
  version: '1.0.0',
  category: '',
  tags: '',
  longDescription: '',
  transport: 'http',
  url: '',
  command: '',
  args: '',
  tools: '',
  cardUrl: '',
};

const STATUS_LABEL: Record<string, string> = { pending: 'Pending', public: 'Public', private: 'Private' };

function bumpPatch(v: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : '';
}

function parseTools(text: string): Array<{ name: string; description: string }> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(':');
      return i === -1 ? { name: line, description: '' } : { name: line.slice(0, i).trim(), description: line.slice(i + 1).trim() };
    })
    .filter((t) => t.name);
}

function formFromPackage(p: PublisherPackageStats): FormState {
  const cfg = (p.config_json ?? {}) as Record<string, unknown>;
  const tools = Array.isArray(cfg.tools) ? (cfg.tools as Array<{ name?: string; description?: string }>) : [];
  return {
    ...EMPTY,
    id: p.id,
    name: p.name,
    description: p.description,
    type: p.type,
    version: bumpPatch(p.latest_version),
    category: p.category ?? '',
    tags: p.tags.join(', '),
    longDescription: p.long_description ?? '',
    transport: (['http', 'sse', 'stdio'].includes(String(cfg.transport)) ? cfg.transport : 'http') as Transport,
    url: typeof cfg.url === 'string' ? cfg.url : '',
    command: typeof cfg.command === 'string' ? cfg.command : '',
    args: Array.isArray(cfg.args) ? (cfg.args as string[]).join(' ') : '',
    tools: tools.map((t) => (t.description ? `${t.name}: ${t.description}` : t.name ?? '')).join('\n'),
    cardUrl: typeof cfg.card_url === 'string' ? cfg.card_url : '',
  };
}

/** Client-side checks for the type-specific fields; the server validates everything again. */
function localError(f: FormState, file: File | null, isNewVersion: boolean): string | null {
  if (!f.id.trim()) return 'Package id is required';
  if (!f.name.trim()) return 'Name is required';
  const mode = installMode(f.type);
  if (mode === 'mcp' && f.transport !== 'stdio' && !f.url.trim()) return 'Server URL is required';
  if (mode === 'mcp' && f.transport === 'stdio' && !f.command.trim()) return 'Command is required';
  if (mode === 'a2a' && !f.cardUrl.trim()) return 'Agent card URL is required';
  if (mode === 'archive' && !file) return isNewVersion ? 'Choose the new package archive (.zip)' : 'Choose a package archive (.zip)';
  return null;
}

export function Publisher({ canPublish, initial }: { canPublish: boolean; initial: PublisherPackageStats[] }) {
  const [packages, setPackages] = useState(initial);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const versionRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/marketplace/publisher', { cache: 'no-store' });
      if (res.ok) setPackages(((await res.json()) as { packages: PublisherPackageStats[] }).packages);
    } catch {
      /* keep the list we have */
    }
  }, []);

  const startNewVersion = (p: PublisherPackageStats) => {
    setForm(formFromPackage(p));
    setEditing(p.id);
    setStatus(null);
    setError(null);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => versionRef.current?.focus(), 0);
  };

  const reset = () => {
    setForm(EMPTY);
    setEditing(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    const problem = localError(form, file, !!editing);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    const mode = installMode(form.type);
    const common = {
      id: form.id.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.type,
      version: form.version.trim() || '1.0.0',
      category: form.category,
      tags: form.tags,
      long_description: form.longDescription,
    };
    let config: Record<string, unknown> | null = null;
    if (mode === 'mcp') {
      const tools = parseTools(form.tools);
      config =
        form.transport === 'stdio'
          ? { transport: 'stdio', command: form.command.trim(), args: form.args.trim() ? form.args.trim().split(/\s+/) : [] }
          : { transport: form.transport, url: form.url.trim() };
      if (tools.length) config.tools = tools;
    } else if (mode === 'a2a') {
      config = { card_url: form.cardUrl.trim() };
    }
    let res: Response;
    try {
      if (mode === 'archive') {
        const fd = new FormData();
        for (const [k, v] of Object.entries(common)) fd.set(k, String(v));
        fd.set('file', file!);
        res = await fetch('/api/marketplace/publish', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/marketplace/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...common, config_json: config }),
        });
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; version?: string };
      if (!res.ok) {
        setError(
          body.error === 'plan_required'
            ? 'Publishing needs a paid plan.'
            : body.error === 'not_owner'
              ? 'That package id belongs to another publisher.'
              : body.error || 'Publishing failed.',
        );
      } else {
        setStatus(`Submitted for review: ${common.name} ${body.version ?? common.version} is pending review.`);
        reset();
        await reload();
      }
    } catch {
      setError('Publishing failed. Check your connection and try again.');
    }
    setBusy(false);
  };

  const totals = packages.reduce(
    (acc, p) => ({ installs: acc.installs + p.install_count, ratings: acc.ratings + p.rating_count }),
    { installs: 0, ratings: 0 },
  );
  const mode = installMode(form.type);

  return (
    <div className="page mp-page mp-publish">
      <header className="mp-hero">
        <div>
          <h1 className="mp-title">Publish a package</h1>
          <p className="mp-lede">
            Share an MCP server, skill, plugin, A2A agent, sub-agent or workflow. Every new package and version is
            reviewed by a Tulzo admin before it appears in the catalog.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <a className="btn btn-secondary btn-sm" href={surfaceUrl('marketplace', '/publisher/activity')}>
            Install activity
          </a>
          <a className="btn btn-secondary btn-sm" href={surfaceUrl('marketplace', '/')}>
            Back to the catalog
          </a>
        </div>
      </header>

      {!canPublish ? (
        <div className="mp-side-card mp-plan-note">
          <h2 className="mp-h3">Publishing needs a paid plan</h2>
          <p className="muted">Pro, Plus and Super subscribers can publish to the marketplace.</p>
          <a className="btn btn-primary btn-sm" href={surfaceUrl('hub', '/pricing')}>
            See plans
          </a>
        </div>
      ) : (
        <form ref={formRef} className="mp-form mp-side-card" onSubmit={submit} noValidate aria-labelledby="mp-form-title">
          <h2 id="mp-form-title" className="mp-h2">
            {editing ? `New version of ${form.name}` : 'New package'}
          </h2>
          <div className="mp-form-grid">
            <div className="mp-field">
              <label htmlFor="pub-id">Package id</label>
              <input
                id="pub-id"
                value={form.id}
                readOnly={!!editing}
                aria-describedby="pub-id-hint"
                onChange={(e) => set('id', e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <span id="pub-id-hint" className="mp-hint">
                Letters, numbers, dots and dashes. Used in the package URL.
              </span>
            </div>
            <div className="mp-field">
              <label htmlFor="pub-name">Name</label>
              <input id="pub-name" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
            </div>
            <div className="mp-field mp-field-wide">
              <label htmlFor="pub-desc">Short description</label>
              <input id="pub-desc" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={280} />
            </div>
            <div className="mp-field">
              <label htmlFor="pub-kind">Kind</label>
              <select id="pub-kind" value={form.type} disabled={!!editing} onChange={(e) => set('type', e.target.value as PackageKind)}>
                {CATALOG_KINDS.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mp-field">
              <label htmlFor="pub-version">Version</label>
              <input id="pub-version" ref={versionRef} value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="1.0.0" />
            </div>
            <div className="mp-field">
              <label htmlFor="pub-category">Category</label>
              <select id="pub-category" value={form.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">Choose a category</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mp-field">
              <label htmlFor="pub-tags">Tags</label>
              <input id="pub-tags" value={form.tags} onChange={(e) => set('tags', e.target.value)} aria-describedby="pub-tags-hint" />
              <span id="pub-tags-hint" className="mp-hint">
                Comma separated, e.g. github, review
              </span>
            </div>

            {mode === 'mcp' && (
              <fieldset className="mp-fieldset mp-field-wide">
                <legend>MCP server</legend>
                <div className="mp-form-grid">
                  <div className="mp-field">
                    <label htmlFor="pub-transport">Transport</label>
                    <select id="pub-transport" value={form.transport} onChange={(e) => set('transport', e.target.value as Transport)}>
                      <option value="http">HTTP</option>
                      <option value="sse">SSE</option>
                      <option value="stdio">stdio</option>
                    </select>
                  </div>
                  {form.transport === 'stdio' ? (
                    <>
                      <div className="mp-field">
                        <label htmlFor="pub-command">Command</label>
                        <input id="pub-command" value={form.command} onChange={(e) => set('command', e.target.value)} placeholder="npx" spellCheck={false} />
                      </div>
                      <div className="mp-field mp-field-wide">
                        <label htmlFor="pub-args">Arguments</label>
                        <input id="pub-args" value={form.args} onChange={(e) => set('args', e.target.value)} placeholder="-y @acme/mcp-server" spellCheck={false} />
                      </div>
                    </>
                  ) : (
                    <div className="mp-field mp-field-wide">
                      <label htmlFor="pub-url">Server URL</label>
                      <input id="pub-url" type="url" value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://mcp.example.com/mcp" spellCheck={false} />
                    </div>
                  )}
                  <div className="mp-field mp-field-wide">
                    <label htmlFor="pub-tools">Tools</label>
                    <textarea id="pub-tools" rows={3} value={form.tools} onChange={(e) => set('tools', e.target.value)} aria-describedby="pub-tools-hint" spellCheck={false} />
                    <span id="pub-tools-hint" className="mp-hint">
                      One per line, as name: description
                    </span>
                  </div>
                </div>
              </fieldset>
            )}
            {mode === 'a2a' && (
              <div className="mp-field mp-field-wide">
                <label htmlFor="pub-card">Agent card URL</label>
                <input id="pub-card" type="url" value={form.cardUrl} onChange={(e) => set('cardUrl', e.target.value)} placeholder="https://agent.example.com/.well-known/agent-card.json" spellCheck={false} />
              </div>
            )}
            {mode === 'archive' && (
              <div className="mp-field mp-field-wide">
                <label htmlFor="pub-file">Package archive (.zip)</label>
                <input id="pub-file" ref={fileRef} type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            )}
            <div className="mp-field mp-field-wide">
              <label htmlFor="pub-long">Full description (Markdown)</label>
              <textarea id="pub-long" rows={5} value={form.longDescription} onChange={(e) => set('longDescription', e.target.value)} />
            </div>
          </div>
          <div role="alert" className="mp-notice-slot">{error && <p className="mp-notice mp-notice-error">{error}</p>}</div>
          <div className="mp-form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}>
              {busy ? 'Publishing…' : 'Publish'}
            </button>
            {editing && (
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
      <div role="status" aria-live="polite" className="mp-notice-slot">
        {status && <p className="mp-notice mp-notice-ok">{status}</p>}
      </div>

      <section aria-labelledby="mp-yours" className="mp-section">
        <h2 id="mp-yours" className="mp-h2">
          Your packages
        </h2>
        <dl className="mp-stats">
          <div className="mp-stat">
            <dt>Total installs</dt>
            <dd>{totals.installs}</dd>
          </div>
          <div className="mp-stat">
            <dt>Ratings</dt>
            <dd>{totals.ratings}</dd>
          </div>
          <div className="mp-stat">
            <dt>Packages</dt>
            <dd>{packages.length}</dd>
          </div>
        </dl>
        {packages.length === 0 ? (
          <p className="muted">You haven&apos;t published any packages yet.</p>
        ) : (
          <div className="mp-table-wrap" role="region" aria-labelledby="mp-yours" tabIndex={0}>
            <table className="mp-table">
              <thead>
                <tr>
                  <th scope="col">Package</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Version</th>
                  <th scope="col">Installs</th>
                  <th scope="col">Rating</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      {p.visibility === 'public' ? (
                        <a href={surfaceUrl('marketplace', `/${encodeURIComponent(p.id)}`)}>{p.name}</a>
                      ) : (
                        p.name
                      )}
                      <span className="mp-meta mp-table-id">{p.id}</span>
                    </th>
                    <td>{kindLabel(p.type)}</td>
                    <td>{p.latest_version}</td>
                    <td>{p.install_count}</td>
                    <td>{p.avg_rating !== null ? `${ratingValue(p.avg_rating)} (${p.rating_count})` : '—'}</td>
                    <td>
                      <span className={`mp-status mp-status-${p.visibility}`}>{STATUS_LABEL[p.visibility] ?? p.visibility}</span>
                    </td>
                    <td>
                      {canPublish && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => startNewVersion(p)} aria-label={`New version of ${p.name}`}>
                          New version
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
