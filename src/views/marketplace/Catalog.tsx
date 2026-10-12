'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATALOG_KINDS, CATEGORIES } from '@/src/lib/marketplace/kinds';
import {
  catalogSearch,
  hasActiveFilters,
  parseCatalogQuery,
  type CatalogQuery,
  type CatalogSort,
} from '@/src/lib/marketplace/catalog-query';
import { surfaceUrl } from '@/src/lib/surface-url';
import type { CatalogItem } from '@/src/lib/marketplace/wire-format';
import { MarketplaceBridgeProvider, useMarketplaceBridge } from './MarketplaceBridge';
import { InstallFeedback } from './InstallControls';
import { PackageCard } from './PackageCard';

/**
 * The public catalog: search, filters (kind, category, tag, installed, sort) that live in the URL,
 * a card grid and paging. The server renders the first result (SEO); "Installed only" is resolved
 * in the browser because only the device knows what is installed.
 *
 * Below 768px the filters fold into a "Filters" sheet (a modal dialog with Show results).
 */

export interface CatalogPageData {
  items: CatalogItem[];
  total: number;
  page: number;
  pages: number;
}

const SORT_LABELS: Record<CatalogSort, string> = { popular: 'Most popular', new: 'Newest', top: 'Top rated' };
const MOBILE_QUERY = '(max-width: 767px)';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled])';

const href = (query: CatalogQuery, patch?: Partial<CatalogQuery>) =>
  surfaceUrl('marketplace', `/${catalogSearch(query, patch)}`);

function countText(total: number): string {
  return `${total} ${total === 1 ? 'package' : 'packages'}`;
}

function SearchForm({ query, onNavigate }: { query: CatalogQuery; onNavigate: (url: string) => void }) {
  const [q, setQ] = useState(query.q);
  useEffect(() => setQ(query.q), [query.q]);
  return (
    <form
      role="search"
      className="mp-search"
      action={surfaceUrl('marketplace', '/')}
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        onNavigate(href(query, { q: q.trim() }));
      }}
    >
      <label htmlFor="mp-q" className="visually-hidden">
        Search the marketplace
      </label>
      <svg className="mp-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        id="mp-q"
        name="q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search packages"
        autoComplete="off"
        enterKeyHint="search"
      />
      <button type="submit" className="btn btn-primary btn-sm">
        Search
      </button>
    </form>
  );
}

function FilterPanel({ query, onNavigate }: { query: CatalogQuery; onNavigate: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const sync = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setOpen(false);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus();
  }, []);

  // Sheet: focus inside on open, Escape closes, Tab stays inside.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const items = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === list[0]) {
        e.preventDefault();
        list[list.length - 1].focus();
      } else if (!e.shiftKey && active === list[list.length - 1]) {
        e.preventDefault();
        list[0].focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const fromForm = (): Partial<CatalogQuery> => {
    const data = new FormData(formRef.current!);
    const parsed = parseCatalogQuery({
      category: (data.get('category') as string) || undefined,
      sort: (data.get('sort') as string) || undefined,
      installed: data.get('installed') ? '1' : undefined,
    });
    return { category: parsed.category, sort: parsed.sort, installed: parsed.installed };
  };

  // Desktop applies each change at once; the mobile sheet applies on "Show results".
  const onChange = () => {
    if (!isMobile) onNavigate(href(query, fromForm()));
  };

  const sheet = isMobile && open;
  return (
    <>
      <div className="mp-filter-bar">
        <button
          ref={toggleRef}
          type="button"
          className="btn btn-secondary btn-sm mp-filters-toggle"
          aria-expanded={open}
          aria-controls="mp-filters"
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          Filters
        </button>
      </div>
      {sheet && <div className="mp-backdrop" onClick={close} aria-hidden="true" />}
      <div
        id="mp-filters"
        ref={panelRef}
        className="mp-filters"
        data-open={open ? 'true' : undefined}
        {...(sheet ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Filters' } : {})}
      >
        <div className="mp-sheet-head">
          <h2 className="mp-sheet-title">Filters</h2>
          <button type="button" className="mp-icon-button" onClick={close}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            <span className="visually-hidden">Close filters</span>
          </button>
        </div>
        <nav aria-label="Kind" className="mp-kinds">
          <ul role="list">
            <li>
              <a href={href(query, { kind: null })} aria-current={query.kind === null ? 'true' : undefined} className="mp-chip">
                All
              </a>
            </li>
            {CATALOG_KINDS.map((k) => (
              <li key={k.kind}>
                <a href={href(query, { kind: k.kind })} aria-current={query.kind === k.kind ? 'true' : undefined} className="mp-chip">
                  {k.plural}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <form
          ref={formRef}
          className="mp-filter-fields"
          action={surfaceUrl('marketplace', '/')}
          method="get"
          onSubmit={(e) => {
            e.preventDefault();
            setOpen(false);
            onNavigate(href(query, fromForm()));
          }}
        >
          {query.q && <input type="hidden" name="q" value={query.q} />}
          {query.kind && <input type="hidden" name="kind" value={query.kind} />}
          {query.tag && <input type="hidden" name="tag" value={query.tag} />}
          <div className="mp-field">
            <label htmlFor="mp-category">Category</label>
            <select id="mp-category" name="category" defaultValue={query.category ?? ''} key={`c-${query.category}`} onChange={onChange}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mp-field">
            <label htmlFor="mp-sort">Sort by</label>
            <select id="mp-sort" name="sort" defaultValue={query.sort} key={`s-${query.sort}`} onChange={onChange}>
              {(Object.keys(SORT_LABELS) as CatalogSort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <label className="mp-check">
            <input type="checkbox" name="installed" value="1" defaultChecked={query.installed} key={`i-${query.installed}`} onChange={onChange} />
            Installed only
          </label>
          <button type="submit" className="btn btn-primary mp-apply">
            Show results
          </button>
        </form>
      </div>
    </>
  );
}

function Pager({ query, page, pages }: { query: CatalogQuery; page: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <nav className="mp-pager" aria-label="Pages">
      {page > 1 ? (
        <a className="btn btn-secondary btn-sm" rel="prev" href={href(query, { page: page - 1 })}>
          Previous page
        </a>
      ) : (
        <span />
      )}
      <span className="mp-meta">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <a className="btn btn-secondary btn-sm" rel="next" href={href(query, { page: page + 1 })}>
          Next page
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

function Results({ query, initial }: { query: CatalogQuery; initial: CatalogPageData | null }) {
  const { status, installed } = useMarketplaceBridge();
  const [data, setData] = useState<CatalogPageData | null>(initial);
  const [failed, setFailed] = useState(false);

  // "Installed only": ask the catalog for exactly the ids the device reported.
  useEffect(() => {
    if (!query.installed) {
      setData(initial);
      return;
    }
    if (status !== 'connected' || installed === null) return;
    const ids = [...installed].join(',');
    let cancelled = false;
    fetch(`/api/marketplace/catalog${catalogSearch(query)}${catalogSearch(query) ? '&' : '?'}ids=${encodeURIComponent(ids)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: CatalogPageData) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [query, initial, status, installed]);

  if (query.installed && status === 'disconnected') {
    return (
      <div className="mp-empty">
        <h2 className="mp-empty-title">Connect the assistant to see what&apos;s installed</h2>
        <p className="muted">The installed filter reads the packages on this device through the Tulzo assistant.</p>
        <a className="btn btn-primary" href={surfaceUrl('ai', '/')}>
          Get the assistant
        </a>
      </div>
    );
  }
  if (failed || (!query.installed && !initial)) {
    return (
      <div className="mp-empty" role="alert">
        <h2 className="mp-empty-title">The catalog didn&apos;t load</h2>
        <p className="muted">Try again in a moment.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <p className="mp-meta" role="status">
        Loading…
      </p>
    );
  }
  if (data.items.length === 0) {
    const filtered = hasActiveFilters(query);
    return (
      <div className="mp-empty">
        <h2 className="mp-empty-title">{filtered ? 'No packages match your filters' : 'No packages yet'}</h2>
        <p className="muted">
          {filtered ? 'Try a different search or fewer filters.' : 'Be the first to publish a skill, MCP server or agent.'}
        </p>
        <a className="btn btn-secondary" href={filtered ? surfaceUrl('marketplace', '/') : surfaceUrl('marketplace', '/publish')}>
          {filtered ? 'Clear filters' : 'Publish a package'}
        </a>
      </div>
    );
  }
  return (
    <>
      <p className="mp-count" aria-live="polite">
        {countText(data.total)}
      </p>
      <div className="mp-grid">
        {data.items.map((item) => (
          <PackageCard key={item.id} item={item} />
        ))}
      </div>
      <Pager query={query} page={data.page} pages={data.pages} />
    </>
  );
}

export function Catalog({ query, initial }: { query: CatalogQuery; initial: CatalogPageData | null }) {
  const router = useRouter();
  const navigate = useCallback((url: string) => router.push(url), [router]);
  return (
    <MarketplaceBridgeProvider>
      <div className="page mp-page">
        <header className="mp-hero">
          <div>
            <h1 className="mp-title">Marketplace</h1>
            <p className="mp-lede">Skills, MCP servers, A2A agents, sub-agents, plugins and workflows for your assistant.</p>
          </div>
          <a className="btn btn-secondary btn-sm" href={surfaceUrl('marketplace', '/publish')}>
            Publish a package
          </a>
        </header>
        <SearchForm query={query} onNavigate={navigate} />
        <FilterPanel query={query} onNavigate={navigate} />
        {query.tag && (
          // A real GET form, so the button works before hydration too.
          <form
            className="mp-active-tag"
            action={surfaceUrl('marketplace', '/')}
            method="get"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(href(query, { tag: null }));
            }}
          >
            <span>
              Tag: <strong>{query.tag}</strong>
            </span>
            {Array.from(new URLSearchParams(catalogSearch(query, { tag: null, page: 1 })).entries()).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <button type="submit" className="btn btn-secondary btn-sm">
              Remove tag filter
            </button>
          </form>
        )}
        <InstallFeedback />
        <Results query={query} initial={initial} />
      </div>
    </MarketplaceBridgeProvider>
  );
}
