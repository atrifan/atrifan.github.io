/**
 * The gigs listing's URL state (tab, search, filters, page) and its mapping to the
 * /api/jobs and /api/offers list queries. Pure. All filter state lives in the URL, so a
 * link or a reload shows the same list.
 *
 * URL params: tab (offers; jobs is the default), q, category, min, max (whole euros),
 * deadline (7d|30d|90d, jobs only), status (jobs only), page (1-based; omitted on page 1).
 */

import { pluralize } from '../../format';

export const LISTING_PAGE_SIZE = 12;
const MAX_PAGE = 10_000;
const DAY_MS = 86_400_000;

export type ListingTab = 'jobs' | 'offers';
export const DEADLINE_WINDOWS = ['7d', '30d', '90d'] as const;
export type DeadlineWindow = (typeof DEADLINE_WINDOWS)[number];
export const PUBLIC_JOB_STATUSES = ['open', 'awarded', 'in_progress', 'delivered', 'completed'] as const;
export type PublicJobStatus = (typeof PUBLIC_JOB_STATUSES)[number];

export interface ListingState {
  tab: ListingTab;
  q: string;
  category: string;
  min: number | null;
  max: number | null;
  deadline: DeadlineWindow | null;
  status: PublicJobStatus | null;
  page: number;
}

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: RawParams, key: string): string {
  if (params instanceof URLSearchParams) return params.get(key) ?? '';
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

function wholeNumber(raw: string): number | null {
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

function oneOf<T extends string>(list: readonly T[], raw: string): T | null {
  return (list as readonly string[]).includes(raw) ? (raw as T) : null;
}

export function parseListingParams(params: RawParams): ListingState {
  const tab: ListingTab = read(params, 'tab') === 'offers' ? 'offers' : 'jobs';
  const category = read(params, 'category').trim();
  let min = wholeNumber(read(params, 'min'));
  let max = wholeNumber(read(params, 'max'));
  if (min != null && max != null && min > max) [min, max] = [max, min];
  const page = wholeNumber(read(params, 'page'));
  const jobs = tab === 'jobs';
  return {
    tab,
    q: read(params, 'q').trim().slice(0, 200),
    category: /^[a-z0-9_-]{1,100}$/.test(category) ? category : '',
    min,
    max,
    deadline: jobs ? oneOf(DEADLINE_WINDOWS, read(params, 'deadline')) : null,
    status: jobs ? oneOf(PUBLIC_JOB_STATUSES, read(params, 'status')) : null,
    page: page && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The query string for a state ('' or '?…'), defaults omitted, keys in a fixed order. */
export function listingSearch(state: ListingState): string {
  const p = new URLSearchParams();
  if (state.tab === 'offers') p.set('tab', 'offers');
  if (state.q) p.set('q', state.q);
  if (state.category) p.set('category', state.category);
  if (state.min != null) p.set('min', String(state.min));
  if (state.max != null) p.set('max', String(state.max));
  if (state.tab === 'jobs') {
    if (state.deadline) p.set('deadline', state.deadline);
    if (state.status) p.set('status', state.status);
  }
  if (state.page > 1) p.set('page', String(state.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** A link to `path` with `patch` applied. Changing anything but the page goes back to page 1. */
export function listingHref(path: string, state: ListingState, patch: Partial<ListingState>): string {
  const next: ListingState = { ...state, ...patch };
  const keys = Object.keys(patch) as Array<keyof ListingState>;
  if (keys.some((k) => k !== 'page')) next.page = patch.page ?? 1;
  // listingSearch never writes the job-only filters for the offers tab.
  return path + listingSearch(next);
}

function common(state: ListingState): Record<string, string> {
  const out: Record<string, string> = {};
  if (state.q) out.q = state.q;
  if (state.category) out.category = state.category;
  if (state.min != null) out.min_price_cents = String(state.min * 100);
  if (state.max != null) out.max_price_cents = String(state.max * 100);
  return out;
}

function pageParams(state: ListingState, pageSize: number): Record<string, string> {
  return { limit: String(pageSize), offset: String((state.page - 1) * pageSize) };
}

/** Query for listJobs / GET /api/jobs. The deadline window runs from `now`. */
export function toJobsApiParams(state: ListingState, now: Date, pageSize: number = LISTING_PAGE_SIZE): Record<string, string> {
  const out = common(state);
  if (state.status) out.status = state.status;
  if (state.deadline) {
    const days = Number(state.deadline.slice(0, -1));
    out.deadline_after = now.toISOString();
    out.deadline_before = new Date(now.getTime() + days * DAY_MS).toISOString();
  }
  return { ...out, ...pageParams(state, pageSize) };
}

/** Query for listOffers / GET /api/offers. */
export function toOffersApiParams(state: ListingState, pageSize: number = LISTING_PAGE_SIZE): Record<string, string> {
  return { ...common(state), ...pageParams(state, pageSize) };
}

/** Filters in the filter sheet (the search box is separate). */
export function activeFilterCount(state: ListingState): number {
  return [state.category !== '', state.min != null, state.max != null, state.deadline != null, state.status != null].filter(Boolean).length;
}

export function hasActiveQuery(state: ListingState): boolean {
  return state.q !== '' || activeFilterCount(state) > 0;
}

export interface PageInfo {
  page: number;
  pages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function pagination(total: number, page: number, pageSize: number = LISTING_PAGE_SIZE): PageInfo {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return { page: current, pages, hasPrev: current > 1, hasNext: current < pages };
}

export function resultCountLabel(n: number, tab: ListingTab): string {
  const noun = tab === 'jobs' ? 'job' : 'offer';
  return pluralize(n, noun);
}
