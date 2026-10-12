import { describe, expect, it } from 'vitest';
import {
  LISTING_PAGE_SIZE,
  activeFilterCount,
  hasActiveQuery,
  listingHref,
  listingSearch,
  pagination,
  parseListingParams,
  resultCountLabel,
  toJobsApiParams,
  toOffersApiParams,
  type ListingState,
} from '@/src/lib/jobs/client/listing-query';

const base: ListingState = {
  tab: 'jobs',
  q: '',
  category: '',
  min: null,
  max: null,
  deadline: null,
  status: null,
  page: 1,
};

describe('parseListingParams', () => {
  it('gives the defaults for no params', () => {
    expect(parseListingParams({})).toEqual(base);
    expect(parseListingParams(new URLSearchParams())).toEqual(base);
  });

  it('reads every filter from URLSearchParams', () => {
    const p = new URLSearchParams('q=%20csv+import%20&category=development&min=100&max=900&deadline=30d&status=awarded&page=3');
    expect(parseListingParams(p)).toEqual({
      tab: 'jobs',
      q: 'csv import',
      category: 'development',
      min: 100,
      max: 900,
      deadline: '30d',
      status: 'awarded',
      page: 3,
    });
  });

  it('reads Next searchParams records and takes the first of repeated values', () => {
    expect(parseListingParams({ tab: 'offers', q: ['a', 'b'], min: '5' })).toEqual({ ...base, tab: 'offers', q: 'a', min: 5 });
  });

  it('drops invalid values instead of failing', () => {
    expect(
      parseListingParams({
        tab: 'nope',
        category: 'Bad Category!',
        min: '-1',
        max: '1.5',
        deadline: '1y',
        status: 'draft',
        page: '0',
      }),
    ).toEqual(base);
    expect(parseListingParams({ min: 'abc', max: '', page: '2.5' })).toEqual(base);
    expect(parseListingParams({ page: '-3' }).page).toBe(1);
  });

  it('accepts every deadline window and public status', () => {
    for (const d of ['7d', '30d', '90d'] as const) expect(parseListingParams({ deadline: d }).deadline).toBe(d);
    for (const s of ['open', 'awarded', 'in_progress', 'delivered', 'completed'] as const) {
      expect(parseListingParams({ status: s }).status).toBe(s);
    }
    for (const s of ['draft', 'cancelled', 'disputed']) expect(parseListingParams({ status: s }).status).toBeNull();
  });

  it('accepts category slugs with digits, dashes and underscores', () => {
    expect(parseListingParams({ category: 'web-3_ai' }).category).toBe('web-3_ai');
    expect(parseListingParams({ category: 'x'.repeat(101) }).category).toBe('');
  });

  it('swaps a reversed price range', () => {
    const s = parseListingParams({ min: '900', max: '100' });
    expect([s.min, s.max]).toEqual([100, 900]);
  });

  it('caps the search text at 200 characters', () => {
    expect(parseListingParams({ q: 'x'.repeat(300) }).q).toHaveLength(200);
  });

  it('ignores job-only filters on the offers tab', () => {
    expect(parseListingParams({ tab: 'offers', deadline: '7d', status: 'open' })).toEqual({ ...base, tab: 'offers' });
  });

  it('caps the page number', () => {
    expect(parseListingParams({ page: '99999999' }).page).toBe(10000);
  });
});

describe('listingSearch', () => {
  it('is empty for the defaults', () => {
    expect(listingSearch(base)).toBe('');
  });

  it('writes params in a fixed order and omits defaults', () => {
    expect(
      listingSearch({ tab: 'jobs', q: 'csv import', category: 'data', min: 0, max: 400, deadline: '7d', status: 'open', page: 2 }),
    ).toBe('?q=csv+import&category=data&min=0&max=400&deadline=7d&status=open&page=2');
  });

  it('writes tab=offers first and never job-only filters for offers', () => {
    expect(listingSearch({ ...base, tab: 'offers', q: 'x', deadline: '7d', status: 'open' })).toBe('?tab=offers&q=x');
  });

  it('round-trips through parseListingParams', () => {
    const s: ListingState = { tab: 'jobs', q: 'a&b=c', category: 'design', min: 10, max: 20, deadline: '90d', status: 'completed', page: 4 };
    expect(parseListingParams(new URLSearchParams(listingSearch(s).slice(1)))).toEqual(s);
  });
});

describe('listingHref', () => {
  const state: ListingState = { ...base, q: 'csv', category: 'data', page: 3 };

  it('keeps the page when only the page changes', () => {
    expect(listingHref('/gigs', state, { page: 4 })).toBe('/gigs?q=csv&category=data&page=4');
  });

  it('resets the page when a filter changes', () => {
    expect(listingHref('/gigs', state, { category: 'design' })).toBe('/gigs?q=csv&category=design');
    expect(listingHref('/gigs', state, { q: 'pdf' })).toBe('/gigs?q=pdf&category=data');
  });

  it('switching tabs clears the job-only filters and the page', () => {
    expect(listingHref('/gigs', { ...state, status: 'open', deadline: '7d' }, { tab: 'offers' })).toBe('/gigs?tab=offers&q=csv&category=data');
  });

  it('returns the bare path when everything is default', () => {
    expect(listingHref('/gigs', state, { q: '', category: '' })).toBe('/gigs');
  });
});

describe('toJobsApiParams', () => {
  const now = new Date('2026-10-12T12:00:00.000Z');

  it('maps defaults to the first page', () => {
    expect(toJobsApiParams(base, now)).toEqual({ limit: String(LISTING_PAGE_SIZE), offset: '0' });
  });

  it('maps euros to cents, the page to an offset and the deadline window to a range from now', () => {
    expect(toJobsApiParams({ ...base, q: 'csv', category: 'data', min: 100, max: 900, deadline: '7d', status: 'awarded', page: 3 }, now)).toEqual({
      q: 'csv',
      category: 'data',
      min_price_cents: '10000',
      max_price_cents: '90000',
      status: 'awarded',
      deadline_after: '2026-10-12T12:00:00.000Z',
      deadline_before: '2026-10-19T12:00:00.000Z',
      limit: '12',
      offset: '24',
    });
  });

  it('supports 30 and 90 day windows and a zero minimum', () => {
    expect(toJobsApiParams({ ...base, deadline: '30d', min: 0 }, now)).toMatchObject({
      min_price_cents: '0',
      deadline_before: '2026-11-11T12:00:00.000Z',
    });
    expect(toJobsApiParams({ ...base, deadline: '90d' }, now).deadline_before).toBe('2027-01-10T12:00:00.000Z');
  });

  it('uses a custom page size', () => {
    expect(toJobsApiParams({ ...base, page: 2 }, now, 5)).toEqual({ limit: '5', offset: '5' });
  });
});

describe('toOffersApiParams', () => {
  it('maps search, category, price and page only', () => {
    expect(toOffersApiParams({ ...base, tab: 'offers', q: 'x', category: 'design', min: 5, max: 50, page: 2 })).toEqual({
      q: 'x',
      category: 'design',
      min_price_cents: '500',
      max_price_cents: '5000',
      limit: '12',
      offset: '12',
    });
  });
});

describe('filter counts', () => {
  it('counts the sheet filters, not the search text', () => {
    expect(activeFilterCount(base)).toBe(0);
    expect(activeFilterCount({ ...base, q: 'x' })).toBe(0);
    expect(activeFilterCount({ ...base, category: 'data', min: 0, max: 5, deadline: '7d', status: 'open' })).toBe(5);
    expect(activeFilterCount({ ...base, min: 0 })).toBe(1);
  });

  it('knows when anything narrows the list', () => {
    expect(hasActiveQuery(base)).toBe(false);
    expect(hasActiveQuery({ ...base, q: 'x' })).toBe(true);
    expect(hasActiveQuery({ ...base, max: 10 })).toBe(true);
    expect(hasActiveQuery({ ...base, page: 2 })).toBe(false);
  });
});

describe('pagination', () => {
  it('has one page for an empty or short list', () => {
    expect(pagination(0, 1)).toEqual({ page: 1, pages: 1, hasPrev: false, hasNext: false });
    expect(pagination(12, 1)).toEqual({ page: 1, pages: 1, hasPrev: false, hasNext: false });
  });

  it('pages through longer lists', () => {
    expect(pagination(13, 1)).toEqual({ page: 1, pages: 2, hasPrev: false, hasNext: true });
    expect(pagination(13, 2)).toEqual({ page: 2, pages: 2, hasPrev: true, hasNext: false });
    expect(pagination(30, 2)).toEqual({ page: 2, pages: 3, hasPrev: true, hasNext: true });
  });

  it('clamps a page past the end', () => {
    expect(pagination(13, 9)).toEqual({ page: 2, pages: 2, hasPrev: true, hasNext: false });
  });

  it('uses a custom page size', () => {
    expect(pagination(10, 2, 5)).toEqual({ page: 2, pages: 2, hasPrev: true, hasNext: false });
  });
});

describe('resultCountLabel', () => {
  it('pluralises', () => {
    expect(resultCountLabel(0, 'jobs')).toBe('0 jobs');
    expect(resultCountLabel(1, 'jobs')).toBe('1 job');
    expect(resultCountLabel(1250, 'jobs')).toBe('1,250 jobs');
    expect(resultCountLabel(1, 'offers')).toBe('1 offer');
    expect(resultCountLabel(2, 'offers')).toBe('2 offers');
  });
});
