import { describe, expect, it } from 'vitest';
import { validatePublishInput } from '@/src/lib/marketplace/publish-validation';

const mcp = { id: 'weather', name: 'Weather', type: 'mcp', config_json: { transport: 'http', url: 'https://w.example.com/mcp' } };
const skill = { id: 'pdf', name: 'PDF', type: 'skill', blob_url: 'https://blob.example.com/pdf.zip' };

function err(input: Record<string, unknown>): string {
  const r = validatePublishInput(input);
  if (r.ok) throw new Error('expected an error');
  return r.error;
}

describe('validatePublishInput', () => {
  it('requires id, name and type', () => {
    expect(err({ name: 'x', type: 'skill' })).toBe('Missing required fields: id, name, type');
    expect(err({ id: 'x', type: 'skill' })).toBe('Missing required fields: id, name, type');
    expect(err({ id: 'x', name: 'x' })).toBe('Missing required fields: id, name, type');
    expect(err({ id: '  ', name: 'x', type: 'skill' })).toBe('Missing required fields: id, name, type');
  });

  it('rejects unknown kinds and lists the valid ones', () => {
    expect(err({ ...skill, type: 'rocket' })).toBe(
      'Invalid type. Must be one of: plugin, skill, practitioner, mcp, a2a, subagent, workflow',
    );
  });

  it('accepts every kind', () => {
    for (const type of ['plugin', 'skill', 'practitioner', 'subagent', 'workflow']) {
      expect(validatePublishInput({ ...skill, type }).ok).toBe(true);
    }
    expect(validatePublishInput(mcp).ok).toBe(true);
    expect(validatePublishInput({ id: 'a', name: 'A', type: 'a2a', config_json: { card_url: 'https://a.example.com/card.json' } }).ok).toBe(true);
  });

  it('checks the id format and reserved ids', () => {
    expect(err({ ...skill, id: 'has space' })).toBe('Package id may only use letters, numbers, dots, dashes and underscores');
    expect(err({ ...skill, id: '-leading' })).toBe('Package id may only use letters, numbers, dots, dashes and underscores');
    expect(err({ ...skill, id: 'x'.repeat(101) })).toBe('Package id may only use letters, numbers, dots, dashes and underscores');
    expect(validatePublishInput({ ...skill, id: 'x'.repeat(100) }).ok).toBe(true);
    expect(err({ ...skill, id: 'publish' })).toBe('That package id is reserved');
    expect(err({ ...skill, id: 'Admin' })).toBe('That package id is reserved');
    expect(validatePublishInput({ ...skill, id: 'My_Pkg.v2-x' }).ok).toBe(true);
  });

  it('defaults the version and checks its shape', () => {
    const r = validatePublishInput(skill);
    expect(r.ok && r.value.version).toBe('1.0.0');
    expect(err({ ...skill, version: 'v1' })).toBe('Version must look like 1.0.0');
    expect(err({ ...skill, version: '1.0' })).toBe('Version must look like 1.0.0');
    for (const v of ['0.0.1', '10.20.30', '1.0.0-beta.1', '1.0.0+build.5']) {
      expect(validatePublishInput({ ...skill, version: v }).ok).toBe(true);
    }
  });

  it('limits the name and short description', () => {
    expect(err({ ...skill, name: 'n'.repeat(81) })).toBe('Name must be at most 80 characters');
    expect(validatePublishInput({ ...skill, name: 'n'.repeat(80) }).ok).toBe(true);
    expect(err({ ...skill, description: 'd'.repeat(281) })).toBe('Short description must be at most 280 characters');
    expect(validatePublishInput({ ...skill, description: 'd'.repeat(280) }).ok).toBe(true);
    expect(err({ ...skill, long_description: 'l'.repeat(20_001) })).toBe('Full description must be at most 20000 characters');
  });

  it('keeps the MCP transport rules', () => {
    expect(err({ ...mcp, config_json: null })).toBe('MCP type requires config_json');
    expect(err({ ...mcp, config_json: { transport: 'ws' } })).toBe('config_json must include transport (http, sse, or stdio)');
    expect(err({ ...mcp, config_json: { transport: 'http' } })).toBe('config_json must include url for http/sse transport');
    expect(err({ ...mcp, config_json: { transport: 'sse' } })).toBe('config_json must include url for http/sse transport');
    expect(err({ ...mcp, config_json: { transport: 'stdio' } })).toBe('config_json must include command for stdio transport');
    expect(validatePublishInput({ ...mcp, config_json: { transport: 'stdio', command: 'npx' } }).ok).toBe(true);
  });

  it('needs an http(s) agent card URL for A2A agents', () => {
    const a2a = { id: 'a', name: 'A', type: 'a2a' };
    const msg = 'A2A agents need config_json.card_url (an http or https URL)';
    expect(err({ ...a2a })).toBe(msg);
    expect(err({ ...a2a, config_json: { card_url: 'ftp://x/card' } })).toBe(msg);
    expect(err({ ...a2a, config_json: { card_url: 'not a url' } })).toBe(msg);
    expect(validatePublishInput({ ...a2a, config_json: { card_url: 'http://localhost:4000/card' } }).ok).toBe(true);
  });

  it('needs an archive for archive kinds', () => {
    expect(err({ ...skill, blob_url: undefined })).toBe('Missing package archive (blob_url)');
    expect(err({ ...skill, type: 'workflow', blob_url: '' })).toBe('Missing package archive (blob_url)');
  });

  it('checks the category and normalises tags', () => {
    expect(err({ ...skill, category: 'cooking' })).toBe('Unknown category');
    const r = validatePublishInput({ ...skill, category: 'data', tags: 'PDF, Docs' });
    expect(r.ok && r.value.category).toBe('data');
    expect(r.ok && r.value.tags).toEqual(['pdf', 'docs']);
    const none = validatePublishInput({ ...skill, category: '' });
    expect(none.ok && none.value.category).toBeNull();
  });

  it('returns the normalised value', () => {
    const r = validatePublishInput({
      ...mcp,
      id: ' weather ',
      name: ' Weather ',
      description: ' Forecasts ',
      version: '2.0.0',
      long_description: '  **Hi**  ',
      provenance: { translated_from: 'claude-code:weather', junk: true },
      files_hash: 'sha256:abc',
    });
    expect(r).toEqual({
      ok: true,
      value: {
        id: 'weather',
        name: 'Weather',
        description: 'Forecasts',
        type: 'mcp',
        version: '2.0.0',
        config_json: { transport: 'http', url: 'https://w.example.com/mcp' },
        blob_url: '',
        tags: [],
        category: null,
        long_description: '**Hi**',
        provenance: { translated_from: 'claude-code:weather' },
        files_hash: 'sha256:abc',
      },
    });
  });

  it('drops config for archive kinds and empty extras', () => {
    const r = validatePublishInput({ ...skill, config_json: { transport: 'http' }, long_description: '  ', provenance: {} });
    expect(r.ok && r.value.config_json).toBeNull();
    expect(r.ok && r.value.long_description).toBeNull();
    expect(r.ok && r.value.provenance).toBeNull();
    expect(r.ok && r.value.files_hash).toBeNull();
    expect(r.ok && r.value.blob_url).toBe('https://blob.example.com/pdf.zip');
  });
});
