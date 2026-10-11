import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  bytesFilesHash,
  canonicalJson,
  configFilesHash,
  provenanceOf,
  publisherName,
  toCatalogItem,
  toDiscoverResult,
  type PackageRecord,
} from '@/src/lib/marketplace/wire-format';

const base: PackageRecord = {
  id: 'pdf',
  name: 'PDF Summarizer',
  description: 'Summarise PDFs',
  type: 'skill',
  latest_version: '1.2.0',
  blob_url: 'https://blob.example.com/pdf/1.2.0.zip',
  config_json: null,
  install_count: 12,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  owner_user_id: 'user_1',
  visibility: 'public',
};

describe('toDiscoverResult (legacy fields)', () => {
  it('keeps the original discover shape for an archive package', () => {
    const r = toDiscoverResult(base, { avg_rating: 4.5, rating_count: 2 });
    expect(r).toMatchObject({
      id: 'pdf',
      name: 'PDF Summarizer',
      description: 'Summarise PDFs',
      type: 'skill',
      version: '1.2.0',
      rating: 4.5,
      rating_count: 2,
      install_count: 12,
      install: { source_type: 'archive', blob_url: 'https://blob.example.com/pdf/1.2.0.zip' },
      updated_at: '2026-02-01T00:00:00Z',
    });
    expect(r.install).not.toHaveProperty('config_json');
  });

  it('gives MCP servers their config instead of a blob', () => {
    const cfg = { transport: 'http', url: 'https://mcp.example.com' };
    const r = toDiscoverResult({ ...base, type: 'mcp', blob_url: '', config_json: cfg });
    expect(r.install).toEqual({ source_type: 'mcp', config_json: cfg });
  });

  it('marks A2A agents as config installs', () => {
    const cfg = { card_url: 'https://a.example.com/card.json' };
    const r = toDiscoverResult({ ...base, type: 'a2a', blob_url: '', config_json: cfg });
    expect(r.install).toEqual({ source_type: 'a2a', config_json: cfg });
  });

  it('defaults missing stats and counts', () => {
    const r = toDiscoverResult({ ...base, install_count: undefined as unknown as number, description: undefined as unknown as null });
    expect(r.rating).toBeNull();
    expect(r.rating_count).toBe(0);
    expect(r.install_count).toBe(0);
    expect(r.description).toBeNull();
  });

  it('prefers the stats argument, then the row (catalog view) values', () => {
    expect(toDiscoverResult({ ...base, avg_rating: 3, rating_count: 1 }).rating).toBe(3);
    expect(toDiscoverResult({ ...base, avg_rating: 3, rating_count: 1 }, { avg_rating: 5, rating_count: 9 }).rating_count).toBe(9);
  });

  it('turns numeric strings from Postgres numerics into numbers', () => {
    expect(toDiscoverResult({ ...base, avg_rating: '4.50' as unknown as number, rating_count: 2 }).rating).toBe(4.5);
  });
});

describe('toDiscoverResult (catalog wire format)', () => {
  it('adds kind, title, capabilities, files_hash, install_url and badges', () => {
    const r = toDiscoverResult({ ...base, tags: ['pdf', 'docs'], files_hash: 'sha256:abc', verified_at: '2026-02-02T00:00:00Z' });
    expect(r.kind).toBe('skill');
    expect(r.title).toBe('PDF Summarizer');
    expect(r.capabilities).toEqual(['pdf', 'docs']);
    expect(r.files_hash).toBe('sha256:abc');
    expect(r.install_url).toBe('https://blob.example.com/pdf/1.2.0.zip');
    expect(r.badges).toEqual(['verified']);
    expect(r).not.toHaveProperty('provenance');
  });

  it('spells sub-agents the way the assistant expects', () => {
    expect(toDiscoverResult({ ...base, type: 'subagent' }).kind).toBe('sub-agent');
  });

  it('carries translated provenance and a translated badge', () => {
    const r = toDiscoverResult({ ...base, provenance: { translated_from: 'claude-code:feature-dev' } });
    expect(r.provenance).toEqual({ translated_from: 'claude-code:feature-dev' });
    expect(r.badges).toEqual(['translated']);
  });

  it('lists verified before translated', () => {
    const r = toDiscoverResult({ ...base, verified_at: 'x', provenance: { translated_from: 'claude-code:a' } });
    expect(r.badges).toEqual(['verified', 'translated']);
  });

  it('uses null for a missing hash and empty capabilities before the migration', () => {
    const r = toDiscoverResult(base);
    expect(r.files_hash).toBeNull();
    expect(r.capabilities).toEqual([]);
    expect(r.badges).toEqual([]);
  });

  it('points install_url at the MCP endpoint, the A2A card, or nothing', () => {
    expect(toDiscoverResult({ ...base, type: 'mcp', config_json: { transport: 'sse', url: 'https://m/sse' } }).install_url).toBe('https://m/sse');
    expect(toDiscoverResult({ ...base, type: 'mcp', config_json: { transport: 'stdio', command: 'npx' } }).install_url).toBeNull();
    expect(toDiscoverResult({ ...base, type: 'a2a', config_json: { card_url: 'https://a/card' } }).install_url).toBe('https://a/card');
    expect(toDiscoverResult({ ...base, type: 'a2a', config_json: null }).install_url).toBeNull();
    expect(toDiscoverResult({ ...base, blob_url: '' }).install_url).toBeNull();
  });
});

describe('provenanceOf', () => {
  it('accepts only a non-empty translated_from string', () => {
    expect(provenanceOf({ translated_from: 'claude-code:x' })).toEqual({ translated_from: 'claude-code:x' });
    expect(provenanceOf({ translated_from: '' })).toBeUndefined();
    expect(provenanceOf({ translated_from: 3 })).toBeUndefined();
    expect(provenanceOf(null)).toBeUndefined();
    expect(provenanceOf('claude-code:x')).toBeUndefined();
  });
});

describe('publisherName', () => {
  it('uses the stored name, else Tulzo for admin uploads, else a community label', () => {
    expect(publisherName({ publisher_name: 'Doc Wizards', owner_user_id: 'u' })).toBe('Doc Wizards');
    expect(publisherName({ publisher_name: '  ', owner_user_id: null })).toBe('Tulzo');
    expect(publisherName({ owner_user_id: 'u' })).toBe('Community publisher');
  });
});

describe('toCatalogItem', () => {
  it('maps a catalog view row for the cards', () => {
    const item = toCatalogItem({
      ...base,
      publisher_name: 'Doc Wizards',
      category: 'productivity',
      tags: ['pdf'],
      avg_rating: 4.5,
      rating_count: 2,
      verified_at: '2026-02-02T00:00:00Z',
      provenance: { translated_from: 'claude-code:pdf' },
      long_description: '**hi**',
      files_hash: 'sha256:1',
    });
    expect(item).toEqual({
      id: 'pdf',
      name: 'PDF Summarizer',
      description: 'Summarise PDFs',
      longDescription: '**hi**',
      type: 'skill',
      version: '1.2.0',
      publisher: 'Doc Wizards',
      ownerUserId: 'user_1',
      category: 'productivity',
      tags: ['pdf'],
      rating: 4.5,
      ratingCount: 2,
      installs: 12,
      verified: true,
      translatedFrom: 'claude-code:pdf',
      blobUrl: 'https://blob.example.com/pdf/1.2.0.zip',
      config: null,
      filesHash: 'sha256:1',
      visibility: 'public',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    });
  });

  it('fills safe defaults for legacy rows', () => {
    const item = toCatalogItem({ ...base, description: null });
    expect(item.description).toBe('');
    expect(item.longDescription).toBeNull();
    expect(item.category).toBeNull();
    expect(item.tags).toEqual([]);
    expect(item.rating).toBeNull();
    expect(item.ratingCount).toBe(0);
    expect(item.verified).toBe(false);
    expect(item.translatedFrom).toBeNull();
    expect(item.filesHash).toBeNull();
  });
});

describe('files hashes', () => {
  it('serialises JSON canonically (sorted keys, nested)', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
    expect(canonicalJson('x')).toBe('"x"');
  });

  it('hashes config independent of key order', () => {
    const h = configFilesHash({ url: 'u', transport: 'http' });
    expect(h).toBe(configFilesHash({ transport: 'http', url: 'u' }));
    expect(h).toBe(`sha256:${createHash('sha256').update('{"transport":"http","url":"u"}').digest('hex')}`);
  });

  it('hashes archive bytes', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(bytesFilesHash(bytes)).toBe(`sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  });
});
