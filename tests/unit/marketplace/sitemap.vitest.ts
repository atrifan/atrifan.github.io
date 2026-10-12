import { describe, expect, it } from 'vitest';
import { marketplaceSitemapEntries } from '@/src/lib/marketplace/sitemap';

const live = { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online', TULZO_LINKS: 'host' };
const pathLinks = { NEXT_PUBLIC_ROOT_DOMAIN: 'tulzo.online' };

describe('marketplaceSitemapEntries', () => {
  it('lists public packages at their canonical detail URL with their last change', () => {
    expect(
      marketplaceSitemapEntries(
        [
          { id: 'github-tools', visibility: 'public', updatedAt: '2026-10-01T10:00:00.000Z' },
          { id: 'code reviewer/x', visibility: 'public', updatedAt: '2026-10-02T10:00:00.000Z' },
        ],
        live,
      ),
    ).toEqual([
      { url: 'https://marketplace.tulzo.online/github-tools', lastModified: '2026-10-01T10:00:00.000Z', changeFrequency: 'weekly' },
      { url: 'https://marketplace.tulzo.online/code%20reviewer%2Fx', lastModified: '2026-10-02T10:00:00.000Z', changeFrequency: 'weekly' },
    ]);
  });

  it('path links put packages under /marketplace on the apex', () => {
    expect(marketplaceSitemapEntries([{ id: 'p1', visibility: 'public', updatedAt: '2026-10-01T10:00:00.000Z' }], pathLinks)[0].url).toBe(
      'https://tulzo.online/marketplace/p1',
    );
  });

  it('path-prefix mode uses /marketplace on the local origin', () => {
    expect(marketplaceSitemapEntries([{ id: 'p1', visibility: 'public', updatedAt: '2026-10-01T10:00:00.000Z' }], { PORT: '3100' })[0].url).toBe(
      'http://localhost:3100/marketplace/p1',
    );
  });

  it('never lists packages that are not public, and drops duplicates', () => {
    const rows = ['private', 'unlisted', 'public', 'pending', 'public'].map((visibility, i) => ({ id: i === 4 ? 'p2' : `p${i}`, visibility, updatedAt: '2026-10-01T10:00:00.000Z' }));
    expect(marketplaceSitemapEntries(rows, live).map((e) => e.url)).toEqual(['https://marketplace.tulzo.online/p2']);
  });

  it('an empty catalog has no entries', () => {
    expect(marketplaceSitemapEntries([], live)).toEqual([]);
  });
});
