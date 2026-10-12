import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_EVENTS,
  allowlistSourceLabel,
  describeDiscovery,
  eventLabel,
  filterLogs,
  isVersionOutdated,
  mcpStatus,
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
  toggleRule,
} from '@/src/lib/ai-device-data';

describe('secrets', () => {
  it('never keeps the secret value', () => {
    const list = normalizeSecrets({
      secrets: [{ id: 1, name: 'GH_TOKEN', description: 'GitHub', value: 'sk-live-x', created_at: 'a', updated_at: '2026-10-01' }],
    });
    expect(list).toEqual([{ name: 'GH_TOKEN', description: 'GitHub', updatedAt: '2026-10-01' }]);
    expect(JSON.stringify(list)).not.toContain('sk-live-x');
  });

  it('drops rows without a name and tolerates missing fields', () => {
    expect(normalizeSecrets({ secrets: [{ value: 'x' }, { name: 'A' }] })).toEqual([{ name: 'A', description: '', updatedAt: null }]);
    expect(normalizeSecrets(null)).toEqual([]);
    expect(normalizeSecrets({ secrets: 'x' })).toEqual([]);
  });
});

describe('allowlist', () => {
  it('only user rows are removable; each source has a label', () => {
    expect(
      normalizeAllowlist({
        entries: [
          { host: 'a.example', source: 'user' },
          { host: 'b.example', source: 'skill', reason: 'saga' },
          { host: 'c.example', source: 'session' },
          { source: 'user' },
        ],
      }),
    ).toEqual([
      { host: 'a.example', source: 'user', reason: null, removable: true },
      { host: 'b.example', source: 'skill', reason: 'saga', removable: false },
      { host: 'c.example', source: 'session', reason: null, removable: false },
    ]);
    expect(allowlistSourceLabel('user')).toBe('Added by you');
    expect(allowlistSourceLabel('skill')).toBe('From a skill');
    expect(allowlistSourceLabel('plugin')).toBe('From a plugin');
    expect(allowlistSourceLabel('session')).toBe('This session only');
    expect(allowlistSourceLabel('other')).toBe('other');
  });
});

describe('MCP servers', () => {
  it('status: disabled wins, then sign-in, then connection', () => {
    expect(mcpStatus({ enabled: false, connected: true, authStatus: 'auth_required' })).toBe('disabled');
    expect(mcpStatus({ enabled: true, connected: false, authStatus: 'auth_required' })).toBe('auth_required');
    expect(mcpStatus({ enabled: true, connected: true, authStatus: 'ok' })).toBe('connected');
    expect(mcpStatus({ connected: false })).toBe('disconnected');
  });

  it('normalises the server list', () => {
    expect(
      normalizeMcpServers({
        servers: [
          { id: 'gh', name: 'GitHub', transport: 'http', connected: true, enabled: true, authStatus: 'ok', toolCount: 12, hasOAuth: true, source: 'user', clientAuthMethod: 'none' },
          { id: 'k8s', name: 'Kube', transport: 'stdio', connected: false, enabled: true, authStatus: 'none', source: 'skill', lastError: 'spawn ENOENT' },
          { name: 'no id' },
        ],
      }),
    ).toEqual([
      { id: 'gh', name: 'GitHub', transport: 'http', status: 'connected', toolCount: 12, hasOAuth: true, source: 'user', clientAuthMethod: 'none', lastError: null, enabled: true },
      { id: 'k8s', name: 'Kube', transport: 'stdio', status: 'disconnected', toolCount: 0, hasOAuth: false, source: 'skill', clientAuthMethod: '', lastError: 'spawn ENOENT', enabled: true },
    ]);
    expect(normalizeMcpServers(undefined)).toEqual([]);
  });

  it('describes a sign-in discovery', () => {
    expect(describeDiscovery({ ok: true, authorization_endpoint: 'https://a/authorize', dcrSupported: true })).toBe(
      'Sign-in required · the server registers clients automatically',
    );
    expect(describeDiscovery({ ok: true, authorization_endpoint: 'https://a/authorize' })).toBe('Sign-in required');
    expect(describeDiscovery({ ok: false, error: 'no metadata' })).toBe('No sign-in found');
    expect(describeDiscovery(null)).toBe('No sign-in found');
  });
});

describe('A2A agents', () => {
  it('normalises agents with a skill count', () => {
    expect(
      normalizeA2aAgents({
        agents: [
          { id: 'r', name: 'Research', cardUrl: 'https://r/card', enabled: false, source: 'skill', hasOAuth: true, authStatus: 'auth_required', skills: [{ id: 'a' }, { id: 'b' }], cardName: 'R' },
          { id: 'w', name: 'Writer', cardUrl: 'https://w/card' },
          { name: 'no id' },
        ],
      }),
    ).toEqual([
      { id: 'r', name: 'Research', cardUrl: 'https://r/card', enabled: false, source: 'skill', hasOAuth: true, authStatus: 'auth_required', skills: 2, clientAuthMethod: '' },
      { id: 'w', name: 'Writer', cardUrl: 'https://w/card', enabled: true, source: '', hasOAuth: false, authStatus: 'none', skills: 0, clientAuthMethod: '' },
    ]);
  });
});

describe('schedules', () => {
  it('normalises schedules', () => {
    expect(
      normalizeSchedules({
        schedules: [
          { id: 'ab12', cron: '0 9 * * 1-5', prompt: 'Check inbox', enabled: true, last_run: '2026-10-11T09:00:00Z', source: 'plugin', type: 'task' },
          { id: 'cd34', cron: '0 * * * *', prompt: 'Ping', enabled: false },
          { cron: 'x' },
        ],
      }),
    ).toEqual([
      { id: 'ab12', cron: '0 9 * * 1-5', prompt: 'Check inbox', enabled: true, lastRun: '2026-10-11T09:00:00Z', source: 'plugin' },
      { id: 'cd34', cron: '0 * * * *', prompt: 'Ping', enabled: false, lastRun: null, source: '' },
    ]);
  });

  it('summarises a declared-schedule reload', () => {
    expect(reloadSummary({ added: 1, updated: 2, removed: 0 })).toBe('Reloaded: 1 added, 2 updated, 0 removed');
    expect(reloadSummary({})).toBe('Reloaded: 0 added, 0 updated, 0 removed');
  });
});

describe('packages and skills', () => {
  it('normalises installed packages', () => {
    expect(normalizeInstalled({ ok: true, packages: [{ id: 'saga', type: 'plugin', version: '1.2.0' }, { id: 'x' }, {}] })).toEqual([
      { id: 'saga', type: 'plugin', version: '1.2.0' },
      { id: 'x', type: 'plugin', version: '' },
    ]);
  });

  it('normalises skills and plugins with activation and connectors', () => {
    const r = normalizeSkills({
      skills: [
        {
          id: 'twin',
          name: 'Digital twin',
          description: 'd',
          disabled: true,
          activationOverride: 'always',
          settingsFile: 'twin-config.yaml',
          deletable: true,
          authConnectors: [{ connectorId: 'google', label: 'Google', authenticated: true, refreshable: false, signIn: 'signed-in' }, { label: 'x' }],
        },
        { id: 'plain', name: 'Plain' },
        { name: 'no id' },
      ],
      plugins: [{ id: 'ms', name: 'Microsoft', disabled: false, deletable: false, skillCount: 2 }, { name: 'x' }],
    });
    expect(r.skills).toEqual([
      {
        id: 'twin',
        name: 'Digital twin',
        description: 'd',
        enabled: false,
        activation: 'always',
        settingsFile: 'twin-config.yaml',
        deletable: true,
        connectors: [{ connectorId: 'google', label: 'Google', authenticated: true, refreshable: false, state: 'Signed in' }],
      },
      { id: 'plain', name: 'Plain', description: '', enabled: true, activation: '', settingsFile: null, deletable: false, connectors: [] },
    ]);
    expect(r.plugins).toEqual([{ id: 'ms', name: 'Microsoft', description: '', enabled: true, deletable: false, skillCount: 2 }]);
    expect(normalizeSkills(null)).toEqual({ skills: [], plugins: [] });
  });

  it('connector states read as words', () => {
    const one = (signIn: string) =>
      normalizeSkills({ skills: [{ id: 's', name: 'S', authConnectors: [{ connectorId: 'c', label: 'C', signIn }] }] }).skills[0].connectors[0].state;
    expect(one('needs-sign-in')).toBe('Needs sign-in');
    expect(one('not-signed-in')).toBe('Not signed in');
    expect(one('weird')).toBe('Not signed in');
    expect(
      normalizeSkills({ skills: [{ id: 's', name: 'S', activationOverride: 'on-demand' }] }).skills[0].activation,
    ).toBe('on-demand');
  });
});

describe('fleet and queue', () => {
  it('normalises loops and sub-agents', () => {
    expect(
      normalizeFleet({
        ok: true,
        data: {
          loops: [{ loopId: 'l1', sessionId: 's1', surface: 'panel', startedAt: 1, currentAction: 'NAVIGATE' }, { sessionId: 'x' }],
          subAgents: [{ agentId: 'a1', defId: 'researcher', state: 'running', startedAt: 2, tokensSoFar: { input: 10, output: 5 } }, {}],
          enableSubagents: true,
        },
      }),
    ).toEqual({
      loops: [{ loopId: 'l1', sessionId: 's1', surface: 'panel', startedAt: 1, currentAction: 'NAVIGATE' }],
      subAgents: [{ agentId: 'a1', defId: 'researcher', state: 'running', startedAt: 2, tokensIn: 10, tokensOut: 5, currentAction: '' }],
      enableSubagents: true,
    });
    expect(normalizeFleet({})).toEqual({ loops: [], subAgents: [], enableSubagents: false });
  });

  it('normalises the queue and counts by status when the device sends no counts', () => {
    expect(
      normalizeQueue({ jobs: [{ id: 1, kind: 'schedule', status: 'running', prompt: 'Sweep', ageMs: 5 }, { id: 2, kind: 'background', status: 'pending', prompt: 'x' }], running: 1, waiting: 0, pending: 1 }),
    ).toEqual({
      jobs: [
        { id: '1', kind: 'schedule', status: 'running', prompt: 'Sweep' },
        { id: '2', kind: 'background', status: 'pending', prompt: 'x' },
      ],
      running: 1,
      waiting: 0,
      pending: 1,
    });
    expect(normalizeQueue({ jobs: [{ id: 'a', status: 'waiting' }, { id: 'b', status: 'pending' }, { id: 'c', status: 'pending' }] })).toMatchObject({
      running: 0,
      waiting: 1,
      pending: 2,
    });
    expect(normalizeQueue(undefined)).toEqual({ jobs: [], running: 0, waiting: 0, pending: 0 });
  });
});

describe('notifications', () => {
  const raw = {
    config: {
      channels: { chrome: { enabled: true }, telegram: { enabled: false, chat_id: '42' } },
      rules: { task_complete: ['chrome'], error: ['chrome', 'telegram'] },
      soundEnabled: false,
      availableChannels: [
        { id: 'chrome', name: 'Chrome Notifications', builtin: true },
        { id: 'telegram', name: 'Telegram', builtin: false },
      ],
    },
  };

  it('lists the six events with labels', () => {
    expect(NOTIFICATION_EVENTS.map((e) => e.label)).toEqual([
      'Task complete',
      'Error',
      'Sign-in required',
      'Daily summary',
      'Background task done',
      'Agent message',
    ]);
  });

  it('builds an editable model from the config', () => {
    const m = toNotificationModel(raw);
    expect(m.channels).toEqual([
      { id: 'chrome', name: 'Chrome Notifications', builtin: true, enabled: true },
      { id: 'telegram', name: 'Telegram', builtin: false, enabled: false },
    ]);
    expect(m.rules.task_complete).toEqual(['chrome']);
    expect(m.rules.daily_summary).toEqual([]);
    expect(m.soundEnabled).toBe(false);
  });

  it('round-trips into a full NOTIFICATION_SET_CONFIG config, keeping channel settings', () => {
    let m = toNotificationModel(raw);
    m = setChannelEnabled(m, 'telegram', true);
    m = toggleRule(m, 'daily_summary', 'telegram');
    m = toggleRule(m, 'error', 'chrome');
    m = { ...m, soundEnabled: true };
    expect(toNotificationConfig(m)).toEqual({
      channels: { chrome: { enabled: true }, telegram: { enabled: true, chat_id: '42' } },
      rules: {
        task_complete: ['chrome'],
        error: ['telegram'],
        auth_required: [],
        daily_summary: ['telegram'],
        background_done: [],
        agent_notify: [],
      },
      soundEnabled: true,
    });
  });

  it('a channel only in availableChannels gets a row in channels; sound defaults on', () => {
    const m = toNotificationModel({ config: { availableChannels: [{ id: 'slack', name: 'Slack' }] } });
    expect(m.channels).toEqual([{ id: 'slack', name: 'Slack', builtin: false, enabled: false }]);
    expect(m.soundEnabled).toBe(true);
    expect(toNotificationConfig(m).channels).toEqual({ chrome: { enabled: false }, slack: { enabled: false } });
    expect(toNotificationModel(null).channels).toEqual([{ id: 'chrome', name: 'Chrome Notifications', builtin: true, enabled: false }]);
  });

  it('toggleRule adds and removes without duplicates', () => {
    const m = toNotificationModel(raw);
    expect(toggleRule(toggleRule(m, 'error', 'slack'), 'error', 'slack').rules.error).toEqual(['chrome', 'telegram']);
  });
});

describe('providers, version, device info', () => {
  it('normalises providers with the active one first-class', () => {
    expect(
      normalizeProviders({
        providers: {
          openai: { type: 'openai', models: { orchestrator: 'gpt-5.4', fast: 'gpt-5.4-mini' } },
          anthropic: { type: 'anthropic', models: { orchestrator: 'claude-sonnet-5-5' } },
        },
        activeProvider: 'anthropic',
      }),
    ).toEqual({
      providers: [
        { name: 'anthropic', models: ['claude-sonnet-5-5'], active: true },
        { name: 'openai', models: ['gpt-5.4', 'gpt-5.4-mini'], active: false },
      ],
      active: 'anthropic',
      activeModel: 'claude-sonnet-5-5',
    });
    expect(normalizeProviders({})).toEqual({ providers: [], active: '', activeModel: '' });
  });

  it('normalises the version reply', () => {
    expect(normalizeVersion({ ok: true, data: { version: '1.4.2', gitCommit: 'abc', platform: 'darwin', arch: 'arm64', nodeVersion: 'v24' } })).toEqual({
      version: '1.4.2',
      gitCommit: 'abc',
      platform: 'darwin',
      arch: 'arm64',
      nodeVersion: 'v24',
    });
    expect(normalizeVersion({ ok: true, data: {} })).toBeNull();
  });

  it('summarises GET_DEVICE_INFO', () => {
    expect(
      summarizeDeviceInfo({
        ok: true,
        data: {
          version: { version: '1.4.2' },
          providers: { providers: { anthropic: { models: { orchestrator: 'claude-sonnet-5-5' } } }, activeProvider: 'anthropic' },
          usage: { totalCost: 12.34 },
          skills: [{ id: 'a' }, { id: 'b' }],
          mcpServers: [{ connected: true }, { connected: false }],
          schedules: [{ enabled: true }, { enabled: false }, { enabled: true }],
        },
      }),
    ).toEqual({ version: '1.4.2', activeModel: 'claude-sonnet-5-5', monthlyCost: 12.34, skills: 2, mcpConnected: 1, mcpTotal: 2, activeSchedules: 2 });
    expect(summarizeDeviceInfo({ ok: false })).toBeNull();
  });

  it('compares versions numerically', () => {
    expect(isVersionOutdated('1.4.2', '1.10.0')).toBe(true);
    expect(isVersionOutdated('v1.4.2', '1.4.2')).toBe(false);
    expect(isVersionOutdated('2.0.0', '1.9.9')).toBe(false);
    expect(isVersionOutdated('1.4', '1.4.1')).toBe(true);
    expect(isVersionOutdated(undefined, '1.0.0')).toBe(false);
    expect(isVersionOutdated('1.0.0', null)).toBe(false);
  });
});

describe('logs', () => {
  const logs = [
    { ts: 3, level: 'error', category: 'mcp', message: 'GitHub failed' },
    { ts: 1, level: 'info', category: 'agent', message: 'Turn started' },
    { ts: 2, level: 'warn', category: 'agent', message: 'Slow tool' },
  ];

  it('normalises dates and orders entries oldest first', () => {
    expect(normalizeLogs({ ok: true, dates: ['2026-10-12'], logs: [...logs, { message: 'no ts' }] })).toEqual({
      dates: ['2026-10-12'],
      logs: [
        { ts: 1, level: 'info', category: 'agent', message: 'Turn started' },
        { ts: 2, level: 'warn', category: 'agent', message: 'Slow tool' },
        { ts: 3, level: 'error', category: 'mcp', message: 'GitHub failed' },
      ],
    });
    expect(normalizeLogs({ logs: [{ ts: 1, level: 'debug', message: 'x' }] }).logs[0]).toEqual({ ts: 1, level: 'info', category: 'system', message: 'x' });
    expect(normalizeLogs(null)).toEqual({ dates: [], logs: [] });
  });

  it('accepts ISO timestamps as well as epoch milliseconds, and drops unreadable ones', () => {
    const r = normalizeLogs({
      logs: [
        { ts: '2026-10-12T09:00:00Z', level: 'info', message: 'iso' },
        { ts: 'yesterday', level: 'info', message: 'bad' },
        { ts: 1_760_000_000_000, level: 'info', message: 'ms' },
      ],
    });
    expect(r.logs.map((l) => [l.message, l.ts])).toEqual([
      ['ms', 1_760_000_000_000],
      ['iso', Date.parse('2026-10-12T09:00:00Z')],
    ]);
  });

  it('filters by level and case-insensitive search', () => {
    const all = normalizeLogs({ logs }).logs;
    expect(filterLogs(all, { levels: new Set(['info', 'warn', 'error']), search: '' })).toHaveLength(3);
    expect(filterLogs(all, { levels: new Set(['error']), search: '' }).map((l) => l.ts)).toEqual([3]);
    expect(filterLogs(all, { levels: new Set(['info', 'warn', 'error']), search: 'SLOW' }).map((l) => l.ts)).toEqual([2]);
    expect(filterLogs(all, { levels: new Set(['info', 'warn', 'error']), search: '  ' })).toHaveLength(3);
    expect(filterLogs(all, { levels: new Set(), search: '' })).toEqual([]);
  });
});

describe('time and event labels', () => {
  const now = new Date('2026-10-12T10:00:00Z').getTime();
  it('relative times', () => {
    expect(relativeTime(null, now)).toBe('Never');
    expect(relativeTime('2026-10-12T09:59:40Z', now)).toBe('Just now');
    expect(relativeTime('2026-10-12T09:15:00Z', now)).toBe('45m ago');
    expect(relativeTime('2026-10-12T07:00:00Z', now)).toBe('3h ago');
    expect(relativeTime('2026-10-09T10:00:00Z', now)).toBe('3d ago');
    expect(relativeTime('not a date', now)).toBe('Never');
  });

  it('event labels', () => {
    expect(eventLabel('request')).toBe('API request');
    expect(eventLabel('verify')).toBe('Key verified');
    expect(eventLabel('marketplace_discover')).toBe('Marketplace search');
    expect(eventLabel('custom_thing')).toBe('custom thing');
  });
});
