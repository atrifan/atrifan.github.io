import { describe, expect, it } from 'vitest';
import { LEGACY_PACKAGE_COLUMNS, isMissingColumnError, legacyRow } from '@/src/lib/marketplace/db-compat';

describe('isMissingColumnError', () => {
  it('spots PostgREST and Postgres missing-column errors', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'tags' column of 'packages' in the schema cache" })).toBe(true);
    expect(isMissingColumnError({ code: '42703', message: 'column packages.tags does not exist' })).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isMissingColumnError({ code: '23514', message: 'violates check constraint' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError(undefined)).toBe(false);
    expect(isMissingColumnError({ message: 'boom' })).toBe(false);
  });
});

describe('legacyRow', () => {
  it('keeps only columns that exist before the 20261205 migration', () => {
    expect(LEGACY_PACKAGE_COLUMNS).toContain('config_json');
    expect(
      legacyRow({ id: 'a', name: 'A', tags: ['x'], files_hash: 'h', visibility: 'pending', provenance: null, config_json: {} }),
    ).toEqual({ id: 'a', name: 'A', visibility: 'pending', config_json: {} });
  });
});
