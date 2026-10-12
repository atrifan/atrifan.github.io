import { describe, expect, it } from 'vitest';
import {
  CATALOG_PAGE_SIZE,
  catalogSearch,
  hasActiveFilters,
  pageCount,
  parseCatalogQuery,
  type CatalogQuery,
} from '@/src/lib/marketplace/catalog-query';

const DEFAULTS: CatalogQuery = { q: '', kind: null, category: null, tag: null, installed: false, sort: 'popular', page: 1 };

describe('parseCatalogQuery', () => {
  it('gives the defaults for an empty query', () => {
    expect(parseCatalogQuery({})).toEqual(DEFAULTS);
    expect(parseCatalogQuery(new URLSearchParams(''))).toEqual(DEFAULTS);
  });

  it('reads every filter from URLSearchParams', () => {
    const q = parseCatalogQuery(
      new URLSearchParams('q=github&kind=mcp&category=developer-tools&tag=git&installed=1&sort=top&page=3'),
    );
    expect(q).toEqual({
      q: 'github',
      kind: 'mcp',
      category: 'developer-tools',
      tag: 'git',
      installed: true,
      sort: 'top',
      page: 3,
    });
  });

  it('reads Next.js searchParams records, taking the first of repeated values', () => {
    expect(parseCatalogQuery({ kind: ['skill', 'mcp'], sort: 'new', q: undefined })).toEqual({
      ...DEFAULTS,
      kind: 'skill',
      sort: 'new',
    });
  });

  it('trims and caps the search text', () => {
    expect(parseCatalogQuery({ q: '  pdf  ' }).q).toBe('pdf');
    expect(parseCatalogQuery({ q: 'x'.repeat(200) }).q).toHaveLength(100);
  });

  it('drops unknown kinds, categories and sorts', () => {
    expect(parseCatalogQuery({ kind: 'spaceship' }).kind).toBeNull();
    expect(parseCatalogQuery({ category: 'cooking' }).category).toBeNull();
    expect(parseCatalogQuery({ sort: 'random' }).sort).toBe('popular');
  });

  it('accepts every catalog kind, including the new ones', () => {
    for (const kind of ['mcp', 'skill', 'plugin', 'a2a', 'subagent', 'workflow']) {
      expect(parseCatalogQuery({ kind }).kind).toBe(kind);
    }
  });

  it('normalises the tag to a lower-case slug and drops an empty one', () => {
    expect(parseCatalogQuery({ tag: ' GitHub ' }).tag).toBe('github');
    expect(parseCatalogQuery({ tag: '   ' }).tag).toBeNull();
    expect(parseCatalogQuery({ tag: '<b>' }).tag).toBe('b');
    expect(parseCatalogQuery({ tag: '<>' }).tag).toBeNull();
  });

  it('treats only installed=1 or true as on', () => {
    expect(parseCatalogQuery({ installed: '1' }).installed).toBe(true);
    expect(parseCatalogQuery({ installed: 'true' }).installed).toBe(true);
    expect(parseCatalogQuery({ installed: '0' }).installed).toBe(false);
    expect(parseCatalogQuery({ installed: 'yes' }).installed).toBe(false);
  });

  it('clamps the page to a positive integer', () => {
    expect(parseCatalogQuery({ page: '0' }).page).toBe(1);
    expect(parseCatalogQuery({ page: '-4' }).page).toBe(1);
    expect(parseCatalogQuery({ page: 'abc' }).page).toBe(1);
    expect(parseCatalogQuery({ page: '2.7' }).page).toBe(2);
    expect(parseCatalogQuery({ page: '1000' }).page).toBe(1000);
    expect(parseCatalogQuery({ page: '100000' }).page).toBe(1000);
  });
});

describe('catalogSearch', () => {
  it('is empty for the default query', () => {
    expect(catalogSearch(DEFAULTS)).toBe('');
  });

  it('writes only non-default values, in a stable order', () => {
    expect(
      catalogSearch({ q: 'git hub', kind: 'mcp', category: 'data', tag: 'git', installed: true, sort: 'new', page: 2 }),
    ).toBe('?q=git+hub&kind=mcp&category=data&tag=git&installed=1&sort=new&page=2');
  });

  it('omits the popular sort and page 1', () => {
    expect(catalogSearch({ ...DEFAULTS, kind: 'skill', sort: 'popular', page: 1 })).toBe('?kind=skill');
  });

  it('applies a patch and resets the page when a filter changes', () => {
    const base: CatalogQuery = { ...DEFAULTS, q: 'pdf', page: 3 };
    expect(catalogSearch(base, { kind: 'skill' })).toBe('?q=pdf&kind=skill');
    expect(catalogSearch(base, { sort: 'top' })).toBe('?q=pdf&sort=top');
    expect(catalogSearch(base, { tag: null })).toBe('?q=pdf');
  });

  it('keeps the page when only the page changes', () => {
    expect(catalogSearch({ ...DEFAULTS, kind: 'mcp' }, { page: 2 })).toBe('?kind=mcp&page=2');
  });

  it('round-trips through parseCatalogQuery', () => {
    const q: CatalogQuery = { q: 'a&b=c', kind: 'a2a', category: 'security', tag: 'ops', installed: true, sort: 'top', page: 4 };
    expect(parseCatalogQuery(new URLSearchParams(catalogSearch(q)))).toEqual(q);
  });
});

describe('hasActiveFilters', () => {
  it('is false for the defaults and for sort/page alone', () => {
    expect(hasActiveFilters(DEFAULTS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULTS, sort: 'top', page: 2 })).toBe(false);
  });

  it('is true for any filter', () => {
    expect(hasActiveFilters({ ...DEFAULTS, q: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULTS, kind: 'mcp' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULTS, category: 'data' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULTS, tag: 'git' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULTS, installed: true })).toBe(true);
  });
});

describe('pageCount', () => {
  it('rounds up and never goes below one', () => {
    expect(CATALOG_PAGE_SIZE).toBe(12);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(12)).toBe(1);
    expect(pageCount(13)).toBe(2);
    expect(pageCount(25, 5)).toBe(5);
  });
});
