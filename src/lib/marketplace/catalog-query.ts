/**
 * Catalog filter state <-> URL query string. Pure. The catalog keeps every filter in the URL so a
 * filtered page is shareable and crawlable: `?q=&kind=&category=&tag=&installed=1&sort=&page=`.
 */
import { isCategory, isPackageKind, slugify, type CategorySlug, type PackageKind } from './kinds';

export const CATALOG_SORTS = ['popular', 'new', 'top'] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const CATALOG_PAGE_SIZE = 12;
const MAX_PAGE = 1000;
const MAX_QUERY_LENGTH = 100;

export interface CatalogQuery {
  q: string;
  kind: PackageKind | null;
  category: CategorySlug | null;
  tag: string | null;
  installed: boolean;
  sort: CatalogSort;
  page: number;
}

type ParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

function first(params: ParamsInput, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseCatalogQuery(params: ParamsInput): CatalogQuery {
  const kind = first(params, 'kind');
  const category = first(params, 'category');
  const sort = first(params, 'sort');
  const installed = first(params, 'installed');
  const page = Math.floor(Number(first(params, 'page')));
  const tag = slugify(first(params, 'tag') ?? '');
  return {
    q: (first(params, 'q') ?? '').trim().slice(0, MAX_QUERY_LENGTH),
    kind: isPackageKind(kind) ? kind : null,
    category: isCategory(category) ? category : null,
    tag: tag || null,
    installed: installed === '1' || installed === 'true',
    sort: (CATALOG_SORTS as readonly unknown[]).includes(sort) ? (sort as CatalogSort) : 'popular',
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), MAX_PAGE) : 1,
  };
}

/**
 * The canonical query string (with a leading `?`, or '' for the defaults) for `query` with
 * `patch` applied. Changing anything other than the page goes back to page 1.
 */
export function catalogSearch(query: CatalogQuery, patch: Partial<CatalogQuery> = {}): string {
  const next: CatalogQuery = { ...query, ...patch };
  if (!('page' in patch) && Object.keys(patch).length > 0) next.page = 1;
  const out = new URLSearchParams();
  if (next.q) out.set('q', next.q);
  if (next.kind) out.set('kind', next.kind);
  if (next.category) out.set('category', next.category);
  if (next.tag) out.set('tag', next.tag);
  if (next.installed) out.set('installed', '1');
  if (next.sort !== 'popular') out.set('sort', next.sort);
  if (next.page > 1) out.set('page', String(next.page));
  const s = out.toString();
  return s ? `?${s}` : '';
}

/** True when anything narrows the result set (sort and page don't). */
export function hasActiveFilters(query: CatalogQuery): boolean {
  return !!(query.q || query.kind || query.category || query.tag || query.installed);
}

export function pageCount(total: number, pageSize: number = CATALOG_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
