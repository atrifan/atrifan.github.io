import { describe, expect, it } from 'vitest';
import { gigsBase, gigsHref } from '@/src/lib/jobs/ui/paths';

describe('gigs links', () => {
  it('drops the /gigs prefix only on the gigs surface', () => {
    expect(gigsBase('gigs')).toBe('');
    expect(gigsBase(null)).toBe('/gigs');
    expect(gigsBase('hub')).toBe('/gigs');
  });

  it('joins paths under the prefix', () => {
    expect(gigsHref('/gigs', '/jobs/1')).toBe('/gigs/jobs/1');
    expect(gigsHref('/gigs', 'post')).toBe('/gigs/post');
    expect(gigsHref('', '/jobs/1')).toBe('/jobs/1');
  });

  it('maps the home to the prefix (or /) and keeps queries on it', () => {
    expect(gigsHref('/gigs', '/')).toBe('/gigs');
    expect(gigsHref('/gigs', '/jobs?x=1')).toBe('/gigs/jobs?x=1');
    expect(gigsHref('', '/')).toBe('/');
    expect(gigsHref('/gigs', '/?tab=offers')).toBe('/gigs?tab=offers');
    expect(gigsHref('', '/?tab=offers')).toBe('/?tab=offers');
    expect(gigsHref('/gigs', '/#top')).toBe('/gigs#top');
    expect(gigsHref('/gigs', '/jobs/?x=1')).toBe('/gigs/jobs/?x=1');
  });
});
