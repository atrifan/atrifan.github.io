'use client';

/**
 * Search box and filters for the gigs listing. All state goes into the URL
 * (src/lib/jobs/client/listing-query.ts). From 960px the filters sit in a sidebar;
 * below that they open in a bottom sheet (native <dialog>: focus trap and Escape).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { GIG_CATEGORIES } from '@/src/lib/jobs/client/format';
import {
  activeFilterCount,
  listingHref,
  type DeadlineWindow,
  type ListingState,
  type PublicJobStatus,
} from '@/src/lib/jobs/client/listing-query';

const DEADLINES: Array<{ value: '' | DeadlineWindow; label: string }> = [
  { value: '', label: 'Any time' },
  { value: '7d', label: 'Within 7 days' },
  { value: '30d', label: 'Within 30 days' },
  { value: '90d', label: 'Within 90 days' },
];

const STATUSES: Array<{ value: PublicJobStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'awarded', label: 'Awarded' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'completed', label: 'Completed' },
];

interface Draft {
  category: string;
  min: string;
  max: string;
  deadline: string;
  status: string;
}

function toDraft(s: ListingState): Draft {
  return {
    category: s.category,
    min: s.min == null ? '' : String(s.min),
    max: s.max == null ? '' : String(s.max),
    deadline: s.deadline ?? '',
    status: s.status ?? '',
  };
}

function euros(v: string): number | null {
  const t = v.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

function patchFrom(d: Draft): Partial<ListingState> {
  return {
    category: d.category,
    min: euros(d.min),
    max: euros(d.max),
    deadline: (d.deadline || null) as DeadlineWindow | null,
    status: (d.status || null) as PublicJobStatus | null,
  };
}

function FilterFields({ state, draft, setDraft, idPrefix }: { state: ListingState; draft: Draft; setDraft: (d: Draft) => void; idPrefix: string }) {
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });
  const jobs = state.tab === 'jobs';
  return (
    <>
      <div className="gigs-field">
        <label htmlFor={`${idPrefix}-category`}>Category</label>
        <select id={`${idPrefix}-category`} value={draft.category} onChange={set('category')}>
          <option value="">All categories</option>
          {GIG_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="gigs-filter-row">
        <div className="gigs-field">
          <label htmlFor={`${idPrefix}-min`}>Min price (€)</label>
          <input id={`${idPrefix}-min`} type="number" inputMode="numeric" min={0} step={1} value={draft.min} onChange={set('min')} />
        </div>
        <div className="gigs-field">
          <label htmlFor={`${idPrefix}-max`}>Max price (€)</label>
          <input id={`${idPrefix}-max`} type="number" inputMode="numeric" min={0} step={1} value={draft.max} onChange={set('max')} />
        </div>
      </div>
      {jobs ? (
        <>
          <div className="gigs-field">
            <label htmlFor={`${idPrefix}-deadline`}>Deadline</label>
            <select id={`${idPrefix}-deadline`} value={draft.deadline} onChange={set('deadline')}>
              {DEADLINES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="gigs-field">
            <label htmlFor={`${idPrefix}-status`}>Status</label>
            <select id={`${idPrefix}-status`} value={draft.status || 'open'} onChange={set('status')}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
    </>
  );
}

function useFilters(state: ListingState, basePath: string) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(state));
  // A new URL (back/forward, clear filters) resets the form.
  const key = JSON.stringify(state);
  useEffect(() => setDraft(toDraft(state)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = () => {
    // An untouched Status select (it shows "Open", the default list) adds nothing to the URL.
    router.push(listingHref(basePath, state, patchFrom(draft)));
  };
  const clearHref = listingHref(basePath, state, { q: '', category: '', min: null, max: null, deadline: null, status: null });
  return { draft, setDraft, apply, clearHref };
}

/** Desktop sidebar form. */
export function FilterSidebar({ state, basePath }: { state: ListingState; basePath: string }) {
  const { draft, setDraft, apply, clearHref } = useFilters(state, basePath);
  const id = useId().replace(/:/g, '');
  const hasAny = activeFilterCount(state) > 0 || state.q !== '';
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    apply();
  };
  return (
    <form className="gigs-filters" aria-label="Filters" onSubmit={onSubmit}>
      <h2 className="gigs-filters-title">Filters</h2>
      <FilterFields state={state} draft={draft} setDraft={setDraft} idPrefix={`side${id}`} />
      <div className="gigs-filter-actions">
        <button type="submit" className="btn btn-primary btn-sm">
          Apply filters
        </button>
        {hasAny ? <a href={clearHref}>Clear filters</a> : null}
      </div>
    </form>
  );
}

/** Mobile "Filters" button and bottom sheet. */
export function FilterSheet({ state, basePath }: { state: ListingState; basePath: string }) {
  const { draft, setDraft, apply, clearHref } = useFilters(state, basePath);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId().replace(/:/g, '');
  const count = activeFilterCount(state);
  const hasAny = count > 0 || state.q !== '';
  const close = () => dialogRef.current?.close();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    close();
    apply();
  };
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary gigs-filter-button"
        aria-haspopup="dialog"
        onClick={() => {
          setDraft(toDraft(state));
          dialogRef.current?.showModal();
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        {count > 0 ? `Filters (${count})` : 'Filters'}
      </button>
      <dialog ref={dialogRef} className="gigs-dialog gigs-sheet" aria-labelledby={`sheet${id}-title`}>
        <form className="gigs-dialog-inner gigs-filters" onSubmit={onSubmit}>
          <div className="gigs-dialog-head">
            <h2 id={`sheet${id}-title`} className="gigs-dialog-title">
              Filters
            </h2>
            <button type="button" className="gigs-icon-button" aria-label="Close filters" onClick={close}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <FilterFields state={state} draft={draft} setDraft={setDraft} idPrefix={`sheet${id}`} />
          <div className="gigs-filter-actions">
            <button type="submit" className="btn btn-primary">
              Apply filters
            </button>
            {hasAny ? <a href={clearHref}>Clear filters</a> : null}
          </div>
        </form>
      </dialog>
    </>
  );
}

export function SearchBar({ state, basePath }: { state: ListingState; basePath: string }) {
  const router = useRouter();
  const [q, setQ] = useState(state.q);
  useEffect(() => setQ(state.q), [state.q]);
  const label = state.tab === 'jobs' ? 'Search jobs' : 'Search offers';
  const id = useId().replace(/:/g, '');
  return (
    <form
      role="search"
      className="gigs-search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(listingHref(basePath, state, { q: q.trim() }));
      }}
    >
      <label htmlFor={`q${id}`} className="visually-hidden">
        {label}
      </label>
      <input
        id={`q${id}`}
        type="search"
        className="gigs-input"
        placeholder={state.tab === 'jobs' ? 'Search jobs, e.g. CSV import' : 'Search offers, e.g. Next.js'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={200}
      />
      <button type="submit" className="btn btn-secondary">
        Search
      </button>
    </form>
  );
}
