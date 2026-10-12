import { describe, expect, it } from 'vitest';
import { AI_TABS, findTab, tabFromPathname, tabHref, tabTitle } from '@/src/lib/ai-tabs';

describe('links inside the ai surface', () => {
  it('tabHref prefixes /ai in path-prefix mode and nothing on the ai. host', () => {
    expect(tabHref(AI_TABS[0], '/ai')).toBe('/ai');
    expect(tabHref(findTab(['secrets'])!, '/ai')).toBe('/ai/secrets');
    expect(tabHref(AI_TABS[0], '')).toBe('/');
    expect(tabHref(findTab(['secrets'])!, '')).toBe('/secrets');
  });

  it('tabFromPathname finds the section for either URL form', () => {
    expect(tabFromPathname('/ai', '/ai')?.slug).toBe('');
    expect(tabFromPathname('/ai/', '/ai')?.slug).toBe('');
    expect(tabFromPathname('/ai/mcp', '/ai')?.slug).toBe('mcp');
    expect(tabFromPathname('/mcp', '')?.slug).toBe('mcp');
    expect(tabFromPathname('/', '')?.slug).toBe('');
    expect(tabFromPathname('/ai/nope', '/ai')).toBeNull();
    expect(tabFromPathname('/aimcp', '/ai')).toBeNull();
  });
});

describe('ai tabs', () => {
  it('lists the sections in nav order with unique slugs', () => {
    expect(AI_TABS.map((t) => t.label)).toEqual([
      'Overview',
      'Devices',
      'Usage',
      'Logs',
      'Packages',
      'MCP servers',
      'Schedules',
      'Secrets',
      'Allowlist',
      'A2A peers',
      'Fleet',
      'Notifications',
      'Providers',
      'Docs',
    ]);
    expect(new Set(AI_TABS.map((t) => t.slug)).size).toBe(AI_TABS.length);
  });

  it('resolves the optional catch-all segments', () => {
    expect(findTab(undefined)?.slug).toBe('');
    expect(findTab([])?.slug).toBe('');
    expect(findTab(['secrets'])?.heading).toBe('Secrets');
    expect(findTab(['a2a'])?.label).toBe('A2A peers');
    expect(findTab(['allowlist'])?.heading).toBe('Site allowlist');
    expect(findTab(['overview'])).toBeNull();
    expect(findTab(['secrets', 'x'])).toBeNull();
    expect(findTab(['Secrets'])).toBeNull();
    expect(findTab(['constructor'])).toBeNull();
  });

  it('titles name the section and the surface', () => {
    expect(tabTitle(findTab(['secrets'])!)).toBe('Secrets · AI · Tulzo');
    expect(tabTitle(AI_TABS[0])).toBe('Overview · AI · Tulzo');
  });

  it('marks which sections need the extension', () => {
    const device = AI_TABS.filter((t) => t.device).map((t) => t.slug);
    expect(device).toEqual(['packages', 'mcp', 'schedules', 'secrets', 'allowlist', 'a2a', 'fleet', 'notifications', 'providers']);
  });
});
