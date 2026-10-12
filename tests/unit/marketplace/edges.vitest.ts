/** Edge cases of the pure marketplace modules (found by mutation testing). */
import { describe, expect, it } from 'vitest';
import { buildInstallCommand, cliInstallCommand, mcpTools, packagePermissions, type InstallTarget } from '@/src/lib/marketplace/install-plan';
import { validatePublishInput } from '@/src/lib/marketplace/publish-validation';
import { toCatalogItem, toDiscoverResult, type PackageRecord } from '@/src/lib/marketplace/wire-format';
import { ratingAriaLabel } from '@/src/lib/marketplace/format';
import { softwareApplicationJsonLd } from '@/src/lib/marketplace/json-ld';

const pkg: InstallTarget = { id: 'p', name: 'P', type: 'skill', blobUrl: 'https://b/p.zip', config: null };

describe('install-plan edges', () => {
  it('treats whitespace-only artifact fields as missing', () => {
    expect(buildInstallCommand({ ...pkg, blobUrl: '   ' })).toMatchObject({ ok: false });
    expect(buildInstallCommand({ ...pkg, type: 'a2a', config: { card_url: '  ' } })).toMatchObject({ ok: false });
    expect(buildInstallCommand({ ...pkg, type: 'a2a', config: null })).toMatchObject({ ok: false });
    expect(buildInstallCommand({ ...pkg, type: 'mcp', config: {} })).toMatchObject({ ok: false });
  });

  it('forwards only the connection fields that are set', () => {
    const r = buildInstallCommand({ ...pkg, type: 'mcp', config: { transport: 'sse', url: 'https://s' } });
    expect(r).toStrictEqual({
      ok: true,
      command: 'MCP_ADD_SERVER',
      params: { id: 'marketplace__p', name: 'P', transport: 'sse', url: 'https://s', source: 'marketplace', packageId: 'p' },
    });
  });

  it('has no CLI command for unknown transports or stdio without a command', () => {
    expect(cliInstallCommand({ ...pkg, type: 'mcp', config: { transport: 'ws', command: 'x' } })).toBeNull();
    expect(cliInstallCommand({ ...pkg, type: 'mcp', config: { transport: 'stdio' } })).toBeNull();
    expect(cliInstallCommand({ ...pkg, type: 'a2a', config: { transport: 'stdio', command: 'x', card_url: 'https://a' } })).toBeNull();
  });

  it('ignores malformed env and non-string args', () => {
    expect(cliInstallCommand({ ...pkg, name: 'F', type: 'mcp', config: { transport: 'stdio', command: 'run', args: ['-y', 3], env: 'A' } })).toBe(
      'claude mcp add f -- run -y',
    );
    expect(cliInstallCommand({ ...pkg, name: 'F', type: 'mcp', config: { transport: 'stdio', command: 'run', args: 'x' } })).toBe(
      'claude mcp add f -- run',
    );
    expect(cliInstallCommand({ ...pkg, name: '!!', id: 'my-id', type: 'mcp', config: { transport: 'http', url: 'https://u' } })).toBe(
      'claude mcp add --transport http my-id https://u',
    );
  });

  it('lists only the permissions that apply', () => {
    expect(packagePermissions({ ...pkg, type: 'mcp', config: { transport: 'http', url: 'https://h.example', command: 'x', env: {} } })).toEqual([
      'Connects to h.example',
    ]);
    expect(packagePermissions({ ...pkg, type: 'a2a', config: { card_url: 'https://a.example', transport: 'stdio', command: 'x' } })).toEqual([
      'Connects to a.example',
    ]);
    expect(packagePermissions({ ...pkg, type: 'mcp', config: { transport: 'stdio', command: '  ', env: 'A', permissions: ['  Reads mail  ', ''] } })).toEqual([
      'Reads mail',
    ]);
    expect(packagePermissions({ ...pkg, type: 'archive' as never, config: { url: 'https://x' } })).toEqual([]);
    expect(packagePermissions({ ...pkg, config: { url: 'https://x' } })).toEqual([]);
  });

  it('skips null and nameless tools', () => {
    expect(mcpTools({ tools: [null, { name: 3 }, { name: 'ok', description: 4 }] })).toEqual([{ name: 'ok', description: '' }]);
  });
});

describe('publish-validation edges', () => {
  const mcp = { id: 'm', name: 'M', type: 'mcp', config_json: { transport: 'http', url: 'https://m' } };
  it('rejects config that is not an object', () => {
    expect(validatePublishInput({ ...mcp, config_json: [{ transport: 'http', url: 'x' }] })).toEqual({ ok: false, error: 'MCP type requires config_json' });
    expect(validatePublishInput({ ...mcp, config_json: 'http' })).toEqual({ ok: false, error: 'MCP type requires config_json' });
  });

  it('allows a full description of exactly 20000 characters', () => {
    expect(validatePublishInput({ ...mcp, long_description: 'l'.repeat(20_000) }).ok).toBe(true);
  });

  it('never keeps a blob URL for config kinds', () => {
    const r = validatePublishInput({ ...mcp, blob_url: 'https://b/x.zip' });
    expect(r.ok && r.value.blob_url).toBe('');
  });

  it('rejects a card URL that is not a string', () => {
    expect(validatePublishInput({ id: 'a', name: 'A', type: 'a2a', config_json: { card_url: 42 } }).ok).toBe(false);
  });
});

const row: PackageRecord = {
  id: 'r', name: 'R', description: 'd', type: 'mcp', latest_version: '1.0.0', blob_url: '',
  config_json: { transport: 'http', url: 'https://r' }, install_count: 1, created_at: 'c', updated_at: 'u',
  owner_user_id: null, visibility: 'public',
};

describe('wire-format edges', () => {
  it('keeps a null rating null', () => {
    expect(toDiscoverResult({ ...row, avg_rating: null, rating_count: 0 }).rating).toBeNull();
    expect(toDiscoverResult(row, { avg_rating: null, rating_count: 0 }).rating).toBeNull();
    expect(toCatalogItem({ ...row, avg_rating: null }).rating).toBeNull();
  });

  it('ignores non-string URLs and stdio URLs', () => {
    expect(toDiscoverResult({ ...row, config_json: { transport: 'http', url: 5 } }).install_url).toBeNull();
    expect(toDiscoverResult({ ...row, config_json: { transport: 'stdio', url: 'https://r', command: 'x' } }).install_url).toBeNull();
  });

  it('passes config through to the card', () => {
    expect(toCatalogItem(row).config).toEqual({ transport: 'http', url: 'https://r' });
  });

  it('ignores non-object provenance', () => {
    expect(toDiscoverResult({ ...row, provenance: 'claude-code:x' })).not.toHaveProperty('provenance');
  });
});

describe('rating edges', () => {
  it('says no ratings when the average is missing', () => {
    expect(ratingAriaLabel(null, 3)).toBe('No ratings yet');
    expect(
      softwareApplicationJsonLd(
        { name: 'n', description: 'd', type: 'skill', version: '1', publisher: 'p', rating: null, ratingCount: 3, updatedAt: 'u' },
        'url',
      ),
    ).not.toHaveProperty('aggregateRating');
  });
});
