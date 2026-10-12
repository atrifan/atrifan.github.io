import { describe, expect, it } from 'vitest';
import {
  BRIDGE_COMMANDS,
  buildA2aPreview,
  buildUsageBreakdown,
  request,
} from '@/src/lib/bridge-commands';
import {
  MCP_STATUS_LABEL,
  describeDiscovery,
  eventLabel,
  isVersionOutdated,
  normalizeA2aAgents,
  normalizeAllowlist,
  normalizeFleet,
  normalizeInstalled,
  normalizeLogs,
  normalizeMcpServers,
  normalizeProviders,
  normalizeQueue,
  normalizeSchedules,
  normalizeSecrets,
  normalizeSkills,
  normalizeVersion,
  relativeTime,
  reloadSummary,
  setChannelEnabled,
  summarizeDeviceInfo,
  toNotificationConfig,
  toNotificationModel,
} from '@/src/lib/ai-device-data';
import { normalizeBreakdown, summarizeDeviceUsage } from '@/src/lib/ai-usage';
import { AI_TABS, findTab, tabFromPathname } from '@/src/lib/ai-tabs';

/**
 * Edge cases of the reply normalisers: the device is another program, so every field is read defensively.
 * A row without a usable id (missing, empty, not a string) is dropped rather than drawn as a blank row.
 */

const BAD_IDS = [{}, { id: '' }, { id: 5 }, null, 'x'];

describe('rows without a usable key are dropped everywhere', () => {
  it('secrets, allowlist, servers, agents, schedules, packages, skills, plugins', () => {
    expect(normalizeSecrets({ secrets: [{ name: '' }, { name: 5 }, null, 'x', { name: 'OK' }] }).map((s) => s.name)).toEqual(['OK']);
    expect(normalizeAllowlist({ entries: [{ host: '' }, { host: 5 }, null, { host: 'a.example' }] }).map((e) => e.host)).toEqual(['a.example']);
    expect(normalizeMcpServers({ servers: [...BAD_IDS, { id: 'ok' }] }).map((s) => s.id)).toEqual(['ok']);
    expect(normalizeA2aAgents({ agents: [...BAD_IDS, { id: 'ok' }] }).map((a) => a.id)).toEqual(['ok']);
    expect(normalizeSchedules({ schedules: [...BAD_IDS, { id: 'ok' }] }).map((s) => s.id)).toEqual(['ok']);
    expect(normalizeInstalled({ packages: [...BAD_IDS, { id: 'ok' }] }).map((p) => p.id)).toEqual(['ok']);
    const sk = normalizeSkills({
      skills: [...BAD_IDS, { id: 'ok', authConnectors: [{}, { connectorId: '' }, { connectorId: 7 }, { connectorId: 'c' }] }],
      plugins: [...BAD_IDS, { id: 'p' }],
    });
    expect(sk.skills.map((s) => s.id)).toEqual(['ok']);
    expect(sk.skills[0].connectors.map((c) => c.connectorId)).toEqual(['c']);
    expect(sk.plugins.map((p) => p.id)).toEqual(['p']);
  });
});

describe('defaults and flags', () => {
  it('an allowlist entry with no source is the user’s and removable', () => {
    expect(normalizeAllowlist({ entries: [{ host: 'a.example' }] })).toEqual([{ host: 'a.example', source: 'user', reason: null, removable: true }]);
  });

  it('MCP numbers, errors and the enabled flag', () => {
    const [a, b] = normalizeMcpServers({
      servers: [
        { id: 'a', toolCount: Infinity, lastError: '', enabled: false, connected: true },
        { id: 'b', toolCount: Number.NaN, lastError: 5 },
      ],
    });
    expect(a).toMatchObject({ toolCount: 0, lastError: null, enabled: false, status: 'disabled' });
    expect(b).toMatchObject({ toolCount: 0, lastError: null, enabled: true, status: 'disconnected' });
    expect(MCP_STATUS_LABEL).toEqual({ connected: 'Connected', disconnected: 'Disconnected', disabled: 'Disabled', auth_required: 'Sign-in needed' });
  });

  it('discovery needs a successful reply with an authorization endpoint', () => {
    expect(describeDiscovery({ ok: true })).toBe('No sign-in found');
    expect(describeDiscovery({ ok: false, authorization_endpoint: 'https://a' })).toBe('No sign-in found');
    expect(describeDiscovery('Sign-in')).toBe('No sign-in found');
    expect(describeDiscovery({ authorization_endpoint: 'https://a' })).toBe('Sign-in required');
  });

  it('reload summary reads each count', () => {
    expect(reloadSummary({ added: 1, updated: 2, removed: 3 })).toBe('Reloaded: 1 added, 2 updated, 3 removed');
  });

  it('skill settings file, connector and plugin flags', () => {
    const r = normalizeSkills({
      skills: [
        { id: 'a', settingsFile: '' },
        { id: 'b', settingsFile: 5, authConnectors: [{ connectorId: 'c', authenticated: false, refreshable: true }] },
      ],
      plugins: [{ id: 'p', disabled: true, deletable: true }],
    });
    expect(r.skills.map((s) => s.settingsFile)).toEqual([null, null]);
    expect(r.skills[1].connectors[0]).toMatchObject({ authenticated: false, refreshable: true });
    expect(r.plugins[0]).toMatchObject({ enabled: false, deletable: true });
  });

  it('a sub-agent with no state is running; queue jobs need an id (0 is one)', () => {
    expect(normalizeFleet({ data: { subAgents: [{ agentId: 'a' }] } }).subAgents[0].state).toBe('running');
    const q = normalizeQueue({ jobs: [{ id: 0 }, { id: null }, { kind: 'x' }], running: 5 });
    expect(q.jobs).toEqual([{ id: '0', kind: '', status: 'pending', prompt: '' }]);
    expect(q.running).toBe(5);
    expect(q.pending).toBe(1);
  });
});

describe('notifications', () => {
  it('a channel whose settings are not an object is off; invalid available entries are ignored', () => {
    const m = toNotificationModel({
      config: {
        channels: { chrome: { enabled: true }, telegram: 'weird' },
        availableChannels: [{ id: '' }, { id: 3 }, null, { id: 'telegram', name: 'Telegram' }, { id: 'chrome', name: 'Chrome' }],
      },
    });
    expect(m.channels.map((c) => [c.id, c.enabled])).toEqual([
      ['telegram', false],
      ['chrome', true],
    ]);
    expect(toNotificationConfig(m).channels).toEqual({ chrome: { enabled: true }, telegram: { enabled: false } });
  });

  it('channels given as a list are ignored; setChannelEnabled leaves the others alone', () => {
    const m = toNotificationModel({ config: { channels: [{ enabled: true }], availableChannels: [{ id: 'chrome' }, { id: 'slack' }] } });
    expect(m.channelSettings).toEqual({ chrome: { enabled: false } });
    const on = setChannelEnabled(m, 'slack', true);
    expect(on.channels.map((c) => c.enabled)).toEqual([false, true]);
  });
});

describe('providers, version, device info', () => {
  it('sorts the active provider first, then by name; ignores non-string models', () => {
    const p = normalizeProviders({
      providers: { b: { models: { x: 'm1', y: 5 } }, z: { models: 'nope' }, a: 'not an object' },
      activeProvider: 'z',
    });
    expect(p.providers.map((x) => x.name)).toEqual(['z', 'a', 'b']);
    expect(p.providers.map((x) => x.models)).toEqual([[], [], ['m1']]);
  });

  it('version must be a non-empty string; the bare payload is read too', () => {
    expect(normalizeVersion({ data: { version: 5 } })).toBeNull();
    expect(normalizeVersion({ data: { version: '' } })).toBeNull();
    expect(normalizeVersion(null)).toBeNull();
    expect(normalizeVersion({ version: '2.0.0' })?.version).toBe('2.0.0');
  });

  it('counts only servers that report connected === true', () => {
    expect(summarizeDeviceInfo({ data: { mcpServers: [{ connected: 'yes' }, { connected: true }, { connected: true }] } })?.mcpConnected).toBe(2);
  });

  it('version comparison strips only a leading v and compares three parts', () => {
    expect(isVersionOutdated('1.v2', '1.1')).toBe(true);
    expect(isVersionOutdated('1.0.0.1', '1.0.0.2')).toBe(false);
  });
});

describe('logs and time', () => {
  it('dates must be strings in a list; timestamps must be numbers or strings', () => {
    expect(normalizeLogs({ dates: ['2026-10-12', 5, null] }).dates).toEqual(['2026-10-12']);
    expect(normalizeLogs({ dates: '2026-10-12' }).dates).toEqual([]);
    expect(normalizeLogs({ logs: [{ ts: {}, message: 'obj' }, { ts: true, message: 'bool' }] }).logs).toEqual([]);
  });

  it('relative time boundaries', () => {
    const now = new Date('2026-10-12T10:00:00Z').getTime();
    expect(relativeTime('2026-10-12T09:59:00Z', now)).toBe('1m ago');
    expect(relativeTime('2026-10-12T09:00:00Z', now)).toBe('1h ago');
    expect(relativeTime('2026-10-11T10:00:00Z', now)).toBe('1d ago');
  });

  it('every event label', () => {
    expect(['request', 'verify', 'config_fetch', 'marketplace_discover', 'marketplace_publish'].map(eventLabel)).toEqual([
      'API request',
      'Key verified',
      'Config fetch',
      'Marketplace search',
      'Package published',
    ]);
  });
});

describe('usage edges', () => {
  it('non-finite numbers are zero', () => {
    expect(summarizeDeviceUsage({ totalCost: Number.NaN })?.totalCost).toBe(0);
    expect(summarizeDeviceUsage({ totalCost: '3' })?.totalCost).toBe(0);
    expect(normalizeMcpServers({ servers: [{ id: 'a', toolCount: '5' }] })[0].toolCount).toBe(0);
    expect(normalizeBreakdown('session', { data: { rows: [{ key: 'k', totalCost: Infinity }] } }).rows[0].totalCost).toBe(0);
  });

  it('month rows need an object with a month', () => {
    expect(normalizeBreakdown('month', { data: { rows: [null, { totalCost: 1 }, { month: 5 }, { month: '2026-01', totalCost: 1 }] } }).rows.map((r) => r.key)).toEqual(['2026-01']);
  });

  it('a difference that rounds to a whole cent is reported, less than that is not', () => {
    const rows = [{ key: 'a', totalCost: 1, calls: 1 }];
    expect(normalizeBreakdown('session', { data: { rows, attribution: { capsTotalCost: 1.01 } } }).unattributed).toBeCloseTo(0.01);
    expect(normalizeBreakdown('session', { data: { rows, attribution: { capsTotalCost: 1.004 } } }).unattributed).toBe(0);
  });
});

describe('tabs and commands edges', () => {
  it('every slug and heading', () => {
    expect(AI_TABS.map((t) => [t.slug, t.heading])).toEqual([
      ['', 'Overview'],
      ['devices', 'Devices and API keys'],
      ['usage', 'Usage'],
      ['logs', 'Logs'],
      ['packages', 'Packages and skills'],
      ['mcp', 'MCP servers'],
      ['schedules', 'Schedules'],
      ['secrets', 'Secrets'],
      ['allowlist', 'Site allowlist'],
      ['a2a', 'A2A peers'],
      ['fleet', 'Fleet'],
      ['notifications', 'Notifications'],
      ['providers', 'Providers'],
      ['docs', 'Docs'],
    ]);
    expect(findTab([''])).toBeNull();
    expect(tabFromPathname('/ai//mcp', '/ai')?.slug).toBe('mcp');
  });

  it('error messages list every field', () => {
    expect(() => request('SECRETS_ADD', {})).toThrow('SECRETS_ADD needs name, value');
    expect(() => request('LIST_FLEET', { a: 1, b: 2 })).toThrow('LIST_FLEET does not read a, b');
    expect(BRIDGE_COMMANDS.LIST_FLEET).toEqual({ required: [], optional: [] });
  });

  it('period and URL inputs are anchored and trimmed', () => {
    expect(buildUsageBreakdown('month', { month: '', year: '12026' }).ok).toBe(false);
    expect(buildUsageBreakdown('session', { month: '2026-101', year: '' }).ok).toBe(false);
    const b = buildA2aPreview('  https://a.example/card  ');
    expect(b.ok && b.request.params).toEqual({ cardUrl: 'https://a.example/card' });
  });
});
