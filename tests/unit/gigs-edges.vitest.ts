/** Edge cases for the gigs UI helpers (boundaries, trimming, one-field-at-a-time errors). */
import { describe, expect, it } from 'vitest';
import { categoryLabel, formatDate } from '@/src/lib/jobs/client/format';
import { listingHref, parseListingParams, resultCountLabel, type ListingState } from '@/src/lib/jobs/client/listing-query';
import { qaCheckLabel } from '@/src/lib/jobs/client/qa-checks';
import { sortBids } from '@/src/lib/jobs/client/bids-sort';
import { RoomApiError, createRoomClient } from '@/src/lib/jobs/client/room';
import { jobsMcpUrl, serializeJsonLd } from '@/src/lib/jobs/client/seo';
import { dateInputToIso, specToForm, splitLines, validateBid, validateDescribe, validateOffer, validateSpec } from '@/src/lib/jobs/client/validation';

const base: ListingState = { tab: 'jobs', q: '', category: '', min: null, max: null, deadline: null, status: null, page: 1 };

describe('format edges', () => {
  it('names every month', () => {
    const months = Array.from({ length: 12 }, (_, i) => formatDate(new Date(Date.UTC(2027, i, 15)).toISOString()).split(' ')[1]);
    expect(months).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  });
  it('collapses runs of separators and trims unknown categories', () => {
    expect(categoryLabel('web--scraping_')).toBe('Web scraping');
  });
});

describe('listing edges', () => {
  it('trims numbers and the category', () => {
    expect(parseListingParams({ page: ' 2 ', min: ' 5 ', category: ' design ' })).toMatchObject({ page: 2, min: 5, category: 'design' });
  });
  it('keeps a one-sided price range as given', () => {
    expect(parseListingParams({ min: '5' })).toMatchObject({ min: 5, max: null });
    expect(parseListingParams({ max: '5' })).toMatchObject({ min: null, max: 5 });
  });
  it('keeps the page for an empty patch and uses an explicit page with a filter change', () => {
    expect(listingHref('/gigs', { ...base, page: 3 }, {})).toBe('/gigs?page=3');
    expect(listingHref('/gigs', { ...base, page: 3 }, { q: 'x', page: 2 })).toBe('/gigs?q=x&page=2');
  });
  it('groups every thousand', () => {
    expect(resultCountLabel(1234567, 'jobs')).toBe('1,234,567 jobs');
  });
});

describe('qa and bids edges', () => {
  it('labels a check', () => {
    expect(qaCheckLabel('code_review')).toBe('Code review');
    expect(qaCheckLabel('basic')).toBe('Basic QA');
  });
  it('ranks a zero trust score above an unknown one', () => {
    const bids = [
      { id: 'n', price_cents: 1, eta_days: 1, trust_score: null, created_at: '2026-01-01' },
      { id: 'z', price_cents: 2, eta_days: 1, trust_score: 0, created_at: '2026-01-02' },
    ];
    expect(sortBids(bids, 'trust').map((b) => b.id)).toEqual(['z', 'n']);
  });
});

describe('room client edges', () => {
  it('names its error and passes the messages cursor', async () => {
    expect(new RoomApiError(400, 'x', 'y').name).toBe('RoomApiError');
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response('{"messages":[],"next_cursor":"3"}', { status: 200 });
    }) as unknown as typeof fetch;
    await createRoomClient({ fetch: fetchImpl }).messages('c1', '3');
    expect(urls).toEqual(['/api/contracts/c1/messages?since=3']);
  });
});

describe('seo edges', () => {
  it('treats a blank root domain as unset', () => {
    expect(jobsMcpUrl({ NEXT_PUBLIC_ROOT_DOMAIN: '  ', PORT: '3100' })).toBe('http://localhost:3100/api/jobs/mcp');
  });
  it('escapes the paragraph separator too', () => {
    const out = serializeJsonLd({ t: String.fromCharCode(0x2029) });
    expect(out).toContain('\\u2029');
    expect(out.includes(String.fromCharCode(0x2029))).toBe(false);
  });
});

describe('validation edges', () => {
  const now = new Date('2026-10-12T12:00:00.000Z');

  it('strips only a leading bullet and the space after it', () => {
    expect(splitLines('-   a\na - b\n*b')).toEqual(['a', 'a - b', '*b']);
  });

  it('rejects dates with junk around them, short years and rolled-over months', () => {
    expect(dateInputToIso('x2027-03-01')).toBeUndefined();
    expect(dateInputToIso('2027-03-01x')).toBeUndefined();
    expect(dateInputToIso('0050-01-01')).toBeUndefined();
    expect(dateInputToIso('2027-13-01')).toBeUndefined();
  });

  it('rejects a deadline at exactly now', () => {
    const at = new Date('2027-03-01T23:59:59.000Z');
    const d = { title: 'abc', description: 'x'.repeat(10), category: '', minBudget: '', maxBudget: '', deadline: '2027-03-01' };
    expect(validateDescribe(d, at)).toEqual({ ok: false, errors: { deadline: 'Pick a deadline in the future' } });
  });

  it('trims the description and category before checking them', () => {
    const r = validateDescribe({ title: 'abc', description: `   ${'x'.repeat(9)}   `, category: '  ', minBudget: '', maxBudget: '', deadline: '' }, now);
    expect(r).toEqual({ ok: false, errors: { description: 'Describe the outcome in at least 10 characters' } });
    const ok = validateDescribe({ title: 'abc', description: 'x'.repeat(10), category: ' data ', minBudget: '', maxBudget: '', deadline: '' }, now);
    expect(ok.ok && ok.value.category).toBe('data');
    const blank = validateDescribe({ title: 'abc', description: 'x'.repeat(10), category: '  ', minBudget: '', maxBudget: '', deadline: '' }, now);
    expect(blank.ok && blank.value.category).toBeNull();
  });

  const spec = {
    requirements: 'r',
    deliverables: 'd',
    acceptanceCriteria: 'a',
    constraints: '',
    permittedTools: '',
    deadline: '',
    minBudget: '',
    maxBudget: '',
    dataSensitivity: 'public' as const,
    secretsAllowed: false,
    securityNotes: 'n'.repeat(2000),
  };

  it('accepts every data sensitivity and 2,000-character notes', () => {
    expect(validateSpec(spec, now).ok).toBe(true);
    expect(validateSpec({ ...spec, dataSensitivity: 'confidential' }, now).ok).toBe(true);
  });

  it('joins every list with newlines', () => {
    const f = specToForm({
      requirements: ['a'],
      deliverables: ['b', 'c'],
      acceptance_criteria: ['d', 'e'],
      constraints: ['f', 'g'],
      permitted_tools: ['h', 'i'],
      deadline: null,
      budget_min_cents: null,
      budget_max_cents: null,
      security: { data_sensitivity: 'public', secrets_allowed: false, notes: '' },
    });
    expect([f.deliverables, f.acceptanceCriteria, f.constraints, f.permittedTools]).toEqual(['b\nc', 'd\ne', 'f\ng', 'h\ni']);
  });

  const offer = { title: 'abc', description: 'd'.repeat(10), labels: '', category: '', price: '5', deliveryDays: '1' };

  it('checks one offer field at a time', () => {
    expect(validateOffer(offer).ok).toBe(true);
    expect(validateOffer({ ...offer, title: '  ab  ' })).toEqual({ ok: false, errors: { title: 'Give your offer a title of at least 3 characters' } });
    expect(validateOffer({ ...offer, title: `  ${'t'.repeat(200)}  `, description: `  ${'d'.repeat(5000)}  ` }).ok).toBe(true);
    expect(validateOffer({ ...offer, description: `   ${'d'.repeat(9)}   ` }).ok).toBe(false);
    expect(validateOffer({ ...offer, labels: Array.from({ length: 20 }, (_, i) => `l${i}`).join(',') }).ok).toBe(true);
    expect(validateOffer({ ...offer, price: 'abc' })).toEqual({ ok: false, errors: { price: 'Set a price of at least €5' } });
    expect(validateOffer({ ...offer, deliveryDays: 'abc' })).toEqual({ ok: false, errors: { deliveryDays: 'Delivery time must be between 1 and 365 days' } });
    expect(validateOffer({ ...offer, deliveryDays: '' })).toEqual({ ok: false, errors: { deliveryDays: 'Delivery time must be between 1 and 365 days' } });
    const cat = validateOffer({ ...offer, category: ' data ' });
    expect(cat.ok && cat.value.category).toBe('data');
  });

  const bounds = { minCents: 500, maxCents: 5_000_000 };
  const bid = { price: '5', etaDays: '1', plan: '', deliverables: '', steering: '', assumptions: '' };

  it('checks one bid field at a time', () => {
    expect(validateBid(bid, bounds).ok).toBe(true);
    expect(validateBid({ ...bid, price: 'abc' }, bounds)).toEqual({ ok: false, errors: { price: 'Bids start at €5' } });
    expect(validateBid({ ...bid, etaDays: 'abc' }, bounds)).toEqual({ ok: false, errors: { etaDays: 'Delivery estimate must be between 1 and 365 days' } });
    expect(validateBid({ ...bid, etaDays: '' }, bounds)).toEqual({ ok: false, errors: { etaDays: 'Delivery estimate must be between 1 and 365 days' } });
    const many = Array.from({ length: 51 }, (_, i) => `d${i}`).join('\n');
    expect(validateBid({ ...bid, deliverables: many }, bounds)).toEqual({ ok: false, errors: { deliverables: 'Keep it to 50 lines or fewer' } });
    expect(validateBid({ ...bid, assumptions: 'a'.repeat(2001) }, bounds)).toEqual({
      ok: false,
      errors: { assumptions: 'Keep each line under 2,000 characters' },
    });
    expect(validateBid({ ...bid, deliverables: 'd'.repeat(2001) }, bounds)).toEqual({
      ok: false,
      errors: { deliverables: 'Keep each line under 2,000 characters' },
    });
  });
});
