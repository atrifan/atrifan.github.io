import { describe, expect, it } from 'vitest';
import {
  CATALOG_KINDS,
  CATEGORIES,
  PACKAGE_KINDS,
  categoryLabel,
  installMode,
  isCategory,
  isPackageKind,
  kindLabel,
  normalizeTags,
  slugify,
  wireKind,
} from '@/src/lib/marketplace/kinds';

describe('package kinds', () => {
  it('lists the legacy and new kinds', () => {
    expect([...PACKAGE_KINDS].sort()).toEqual(['a2a', 'mcp', 'plugin', 'practitioner', 'skill', 'subagent', 'workflow']);
  });

  it('offers the six catalog kinds in display order', () => {
    expect(CATALOG_KINDS.map((k) => k.kind)).toEqual(['mcp', 'skill', 'plugin', 'a2a', 'subagent', 'workflow']);
    expect(CATALOG_KINDS.map((k) => k.plural)).toEqual([
      'MCP servers', 'Skills', 'Plugins', 'A2A agents', 'Sub-agents', 'Workflows',
    ]);
  });

  it('labels each kind', () => {
    expect(kindLabel('mcp')).toBe('MCP server');
    expect(kindLabel('skill')).toBe('Skill');
    expect(kindLabel('plugin')).toBe('Plugin');
    expect(kindLabel('a2a')).toBe('A2A agent');
    expect(kindLabel('subagent')).toBe('Sub-agent');
    expect(kindLabel('workflow')).toBe('Workflow');
    expect(kindLabel('practitioner')).toBe('Practitioner');
  });

  it('recognises kinds', () => {
    expect(isPackageKind('workflow')).toBe(true);
    expect(isPackageKind('practitioner')).toBe(true);
    expect(isPackageKind('Workflow')).toBe(false);
    expect(isPackageKind(undefined)).toBe(false);
    expect(isPackageKind(3)).toBe(false);
  });

  it('installs MCP servers and A2A agents from config and everything else from an archive', () => {
    expect(installMode('mcp')).toBe('mcp');
    expect(installMode('a2a')).toBe('a2a');
    for (const k of ['skill', 'plugin', 'practitioner', 'subagent', 'workflow'] as const) {
      expect(installMode(k)).toBe('archive');
    }
  });

  it('uses the assistant wire spelling for sub-agents', () => {
    expect(wireKind('subagent')).toBe('sub-agent');
    expect(wireKind('skill')).toBe('skill');
    expect(wireKind('a2a')).toBe('a2a');
  });
});

describe('categories', () => {
  it('has fixed slugs and labels', () => {
    expect(CATEGORIES.map((c) => c.slug)).toEqual([
      'developer-tools', 'productivity', 'communication', 'data', 'research', 'design', 'security', 'other',
    ]);
    expect(categoryLabel('developer-tools')).toBe('Developer tools');
    expect(categoryLabel('nope')).toBeNull();
    expect(categoryLabel(null)).toBeNull();
  });

  it('recognises categories', () => {
    expect(isCategory('data')).toBe(true);
    expect(isCategory('Data')).toBe(false);
    expect(isCategory(null)).toBe(false);
  });
});

describe('normalizeTags', () => {
  it('splits a comma list, lower-cases, slugs and dedupes', () => {
    expect(normalizeTags(' GitHub, git ,GITHUB,, Code Review ')).toEqual(['github', 'git', 'code-review']);
  });

  it('accepts an array and ignores non-strings', () => {
    expect(normalizeTags(['A', 3, 'b'] as unknown[])).toEqual(['a', 'b']);
  });

  it('keeps at most eight tags of at most 32 characters', () => {
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(8);
    expect(normalizeTags(['x'.repeat(40)])[0]).toHaveLength(32);
  });

  it('is empty for nothing usable', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags('')).toEqual([]);
    expect(normalizeTags(42)).toEqual([]);
  });
});

describe('slugify', () => {
  it('makes a URL slug from a name', () => {
    expect(slugify('GitHub Tools')).toBe('github-tools');
    expect(slugify('  PDF -- Summarizer!! ')).toBe('pdf-summarizer');
    expect(slugify('Café Déjà vu')).toBe('cafe-deja-vu');
    expect(slugify('***')).toBe('');
  });
});
