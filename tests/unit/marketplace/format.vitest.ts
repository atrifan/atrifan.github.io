import { describe, expect, it } from 'vitest';
import { formatInstalls, ratingAriaLabel, ratingCountText, ratingValue } from '@/src/lib/marketplace/format';
import { serializeJsonLd, softwareApplicationJsonLd } from '@/src/lib/marketplace/json-ld';

describe('formatInstalls', () => {
  it('pluralises small counts', () => {
    expect(formatInstalls(0)).toBe('0 installs');
    expect(formatInstalls(1)).toBe('1 install');
    expect(formatInstalls(999)).toBe('999 installs');
  });

  it('abbreviates thousands and millions', () => {
    expect(formatInstalls(1000)).toBe('1k installs');
    expect(formatInstalls(1520)).toBe('1.5k installs');
    expect(formatInstalls(1960)).toBe('2k installs');
    expect(formatInstalls(25_400)).toBe('25.4k installs');
    expect(formatInstalls(999_999)).toBe('1000k installs');
    expect(formatInstalls(1_000_000)).toBe('1M installs');
    expect(formatInstalls(2_340_000)).toBe('2.3M installs');
  });

  it('treats bad input as zero', () => {
    expect(formatInstalls(-5)).toBe('0 installs');
    expect(formatInstalls(Number.NaN)).toBe('0 installs');
  });
});

describe('ratings', () => {
  it('shows one decimal', () => {
    expect(ratingValue(4.5)).toBe('4.5');
    expect(ratingValue(5)).toBe('5.0');
    expect(ratingValue(4.333)).toBe('4.3');
  });

  it('counts ratings', () => {
    expect(ratingCountText(0)).toBe('No ratings yet');
    expect(ratingCountText(1)).toBe('1 rating');
    expect(ratingCountText(2)).toBe('2 ratings');
  });

  it('labels the rating for screen readers', () => {
    expect(ratingAriaLabel(4.5, 2)).toBe('Rated 4.5 out of 5 from 2 ratings');
    expect(ratingAriaLabel(3, 1)).toBe('Rated 3.0 out of 5 from 1 rating');
    expect(ratingAriaLabel(null, 0)).toBe('No ratings yet');
    expect(ratingAriaLabel(4, 0)).toBe('No ratings yet');
  });
});

describe('softwareApplicationJsonLd', () => {
  const pkg = {
    id: 'gh',
    name: 'GitHub Tools',
    description: 'Issues and PRs',
    type: 'mcp' as const,
    version: '2.1.0',
    publisher: 'Tulzo Labs',
    rating: 4.5,
    ratingCount: 2,
    updatedAt: '2026-09-01T10:00:00Z',
  };

  it('describes the package as a free SoftwareApplication', () => {
    expect(softwareApplicationJsonLd(pkg, 'https://marketplace.tulzo.online/gh')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'GitHub Tools',
      description: 'Issues and PRs',
      url: 'https://marketplace.tulzo.online/gh',
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'MCP server',
      operatingSystem: 'Any',
      softwareVersion: '2.1.0',
      dateModified: '2026-09-01T10:00:00Z',
      author: { '@type': 'Organization', name: 'Tulzo Labs' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.5, ratingCount: 2, bestRating: 5, worstRating: 1 },
    });
  });

  it('leaves out the rating when there is none', () => {
    expect(softwareApplicationJsonLd({ ...pkg, rating: null, ratingCount: 0 }, 'u')).not.toHaveProperty('aggregateRating');
    expect(softwareApplicationJsonLd({ ...pkg, rating: 4, ratingCount: 0 }, 'u')).not.toHaveProperty('aggregateRating');
  });

  it('serialises safely for a script tag', () => {
    expect(serializeJsonLd({ name: '</script><script>alert(1)</script>' })).toBe(
      '{"name":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}',
    );
  });
});
