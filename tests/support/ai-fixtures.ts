import { test as base, expect, type Page, type Route } from '@playwright/test';
import { quietBell } from '../e2e/surface-helpers';
import { hasClerkTestEnv, storageStatePath } from '../fixtures/clerk-users';
import { MockBridge, type Handlers, type Params } from './mock-bridge';

/**
 * Deterministic data and helpers for the ai. control panel specs
 * (tests/e2e/ai-*.spec.ts, tests/a11y/ai.a11y.spec.ts, tests/visual/ai.visual.spec.ts).
 *
 * - `test` is Playwright's test with two fixtures: `server` (page.route mocks of the
 *   /api endpoints, always on, stateful) and `bridge` (a MockBridge, installed by the
 *   test; after the test it asserts every recorded command is in the allow-list).
 * - `fakeDevice()` returns stateful bridge handlers for every command the pages use.
 * - `openAi(page, path)` opens a signed-in /ai page settled.
 */

export const FROZEN_NOW = new Date('2026-10-12T10:00:00Z');
export const DEVICE_NAME = 'Studio laptop';
export const SECRET_VALUE = 'sk-live-SHOULD-NOT-SHOW';

// ---------------------------------------------------------------- pages

export interface AiPage {
  name: string;
  path: string;
  label: string;
  h1: string;
  /** Text visible once the populated (connected, default fake device) page has loaded. */
  ready: string;
}

export const AI_PAGES: readonly AiPage[] = [
  { name: 'overview', path: '/ai', label: 'Overview', h1: 'Overview', ready: 'Recent activity' },
  { name: 'devices', path: '/ai/devices', label: 'Devices', h1: 'Devices and API keys', ready: 'Work laptop' },
  { name: 'usage', path: '/ai/usage', label: 'Usage', h1: 'Usage', ready: 'Planning chat' },
  { name: 'logs', path: '/ai/logs', label: 'Logs', h1: 'Logs', ready: 'Daemon started' },
  { name: 'packages', path: '/ai/packages', label: 'Packages', h1: 'Packages and skills', ready: 'research-pack' },
  { name: 'mcp', path: '/ai/mcp', label: 'MCP servers', h1: 'MCP servers', ready: 'GitHub' },
  { name: 'schedules', path: '/ai/schedules', label: 'Schedules', h1: 'Schedules', ready: 'Summarise my inbox' },
  { name: 'secrets', path: '/ai/secrets', label: 'Secrets', h1: 'Secrets', ready: 'OPENAI_API_KEY' },
  { name: 'allowlist', path: '/ai/allowlist', label: 'Allowlist', h1: 'Site allowlist', ready: 'example.com' },
  { name: 'a2a', path: '/ai/a2a', label: 'A2A peers', h1: 'A2A peers', ready: 'Travel planner' },
  { name: 'fleet', path: '/ai/fleet', label: 'Fleet', h1: 'Fleet', ready: 'Reading inbox' },
  { name: 'notifications', path: '/ai/notifications', label: 'Notifications', h1: 'Notifications', ready: 'Task complete' },
  { name: 'providers', path: '/ai/providers', label: 'Providers', h1: 'Providers', ready: 'claude-sonnet-5-5' },
  { name: 'docs', path: '/ai/docs', label: 'Docs', h1: 'Docs', ready: 'Getting started' },
];

export const NAV_LABELS = AI_PAGES.map((p) => p.label);

export function aiPage(name: string): AiPage {
  const found = AI_PAGES.find((p) => p.name === name);
  if (!found) throw new Error(`unknown ai page ${name}`);
  return found;
}

// ---------------------------------------------------------------- server data

export interface Device {
  id: string;
  device_name: string;
  api_key_suffix: string;
  plan: string;
  provider: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  status: 'online' | 'offline' | 'never_connected';
  last_seen_at: string | null;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  model: string | null;
  tokens_today_input: number;
  tokens_today_output: number;
  schedules_count: number;
  active_tasks_count: number;
  skills_loaded: number;
}

const device = (over: Partial<Device> & Pick<Device, 'id' | 'device_name' | 'api_key_suffix' | 'status'>): Device => ({
  plan: 'pro',
  provider: 'anthropic',
  is_active: true,
  created_at: '2026-09-01T08:00:00Z',
  last_used_at: '2026-10-12T09:55:00Z',
  last_seen_at: '2026-10-12T09:59:00Z',
  hostname: 'host.local',
  platform: 'darwin',
  arch: 'arm64',
  model: 'claude-sonnet-5-5',
  tokens_today_input: 12000,
  tokens_today_output: 3400,
  schedules_count: 2,
  active_tasks_count: 1,
  skills_loaded: 2,
  ...over,
});

export const DEVICES: Device[] = [
  device({ id: 'dev_1', device_name: 'Work laptop', api_key_suffix: 'a1b2', status: 'online' }),
  device({ id: 'dev_2', device_name: 'Home desktop', api_key_suffix: 'c3d4', status: 'offline' }),
];

export const NEVER_CONNECTED_DEVICE = device({
  id: 'dev_3',
  device_name: 'Spare mini',
  api_key_suffix: 'e5f6',
  status: 'never_connected',
  last_used_at: null,
  last_seen_at: null,
  hostname: null,
  platform: null,
  arch: null,
  model: null,
  tokens_today_input: 0,
  tokens_today_output: 0,
  schedules_count: 0,
  active_tasks_count: 0,
  skills_loaded: 0,
});

export const USAGE_STATS = {
  totalRequests: 987,
  requestsToday: 17,
  requestsThisMonth: 345,
  lastRequestAt: '2026-10-12T09:55:00Z',
};

export const ACTIVITY = {
  timeline: [
    { event_type: 'request', metadata: { device: 'Work laptop' }, created_at: '2026-10-12T09:55:00Z' },
    { event_type: 'verify', metadata: { device: 'Work laptop' }, created_at: '2026-10-12T09:30:00Z' },
    { event_type: 'request', metadata: { device: 'Home desktop' }, created_at: '2026-10-11T18:00:00Z' },
  ],
  event_counts: { request: 2, verify: 1 },
};

export const GENERATED_KEY = 'tlz_live_test_0123456789abcdef';

export interface ServerState {
  devices: Device[];
  limit: number;
  plan: 'free' | 'pro' | 'plus' | 'super';
  usage: typeof USAGE_STATS;
  activity: { timeline: { event_type: string; metadata: unknown; created_at: string }[]; event_counts: Record<string, number> };
  /** When set, POST /api/keys/generate answers 403 device_limit_reached. */
  generateLimitReached: boolean;
}

export interface MockServer {
  state: ServerState;
  /** Bodies of POST /api/keys/generate. */
  generated: unknown[];
  /** Bodies of DELETE /api/keys/delete. */
  deleted: unknown[];
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const endpoint = (path: string) => new RegExp(`/api/${path}(\\?.*)?$`);

/** Stateful page.route mocks for the server endpoints the ai pages call. */
export async function mockServer(page: Page): Promise<MockServer> {
  const server: MockServer = {
    state: {
      devices: DEVICES.map((d) => ({ ...d })),
      limit: 3,
      plan: 'pro',
      usage: { ...USAGE_STATS },
      activity: structuredClone(ACTIVITY),
      generateLimitReached: false,
    },
    generated: [],
    deleted: [],
  };
  const { state } = server;
  await page.route(endpoint('keys/list'), (route) =>
    json(route, { devices: state.devices, limit: state.limit, plan: state.plan }),
  );
  await page.route(endpoint('usage/stats'), (route) => json(route, state.usage));
  await page.route(endpoint('dashboard/activity'), (route) => json(route, state.activity));
  await page.route(endpoint('plugin/version'), (route) => json(route, { latest: '1.4.2' }));
  await page.route(endpoint('plugin/presence'), (route) => json(route, { ok: true }));
  await page.route(endpoint('keys/generate'), (route) => {
    const body = route.request().postDataJSON() as { device_name?: string } | null;
    server.generated.push(body);
    if (state.generateLimitReached) return json(route, { error: 'device_limit_reached', limit: state.limit }, 403);
    state.devices.push(
      device({ id: `dev_new_${server.generated.length}`, device_name: String(body?.device_name ?? ''), api_key_suffix: 'cdef', status: 'never_connected' }),
    );
    return json(route, { apiKey: GENERATED_KEY });
  });
  await page.route(endpoint('keys/delete'), (route) => {
    const body = route.request().postDataJSON() as { keyId?: string } | null;
    server.deleted.push(body);
    state.devices = state.devices.filter((d) => d.id !== body?.keyId);
    return json(route, { ok: true });
  });
  return server;
}

// ---------------------------------------------------------------- device (bridge) data

export const SECRETS = [
  { id: 'sec_1', name: 'OPENAI_API_KEY', description: 'Used by the research skill', value: SECRET_VALUE, created_at: '2026-09-01T08:00:00Z', updated_at: '2026-09-01T08:00:00Z' },
  { id: 'sec_2', name: 'GITHUB_TOKEN', description: 'Repository access', value: 'ghp-SHOULD-NOT-SHOW', created_at: '2026-09-02T08:00:00Z', updated_at: '2026-09-02T08:00:00Z' },
];

export const WHITELIST = [
  { host: 'example.com', source: 'user' as const },
  { host: 'docs.github.com', source: 'skill' as const, reason: 'Web research skill' },
  { host: 'api.notion.com', source: 'plugin' as const },
  { host: 'news.ycombinator.com', source: 'session' as const },
];

export const A2A_AGENTS = [
  { id: 'a2a_1', name: 'Travel planner', cardUrl: 'https://travel.example.com/.well-known/agent.json', enabled: true, source: 'user' as const, hasOAuth: true, authStatus: 'ok' as const, cardName: 'Travel planner', cardDescription: 'Plans trips', skills: [{ id: 'book', name: 'Book flights' }] },
  { id: 'a2a_2', name: 'Research peer', cardUrl: 'https://research.example.com/agent.json', enabled: false, source: 'skill' as const, hasOAuth: true, authStatus: 'auth_required' as const },
  { id: 'a2a_3', name: 'Calendar bot', cardUrl: 'https://calendar.example.com/agent.json', enabled: true, source: 'marketplace' as const, hasOAuth: false, authStatus: 'none' as const },
];

export const A2A_CARD = {
  name: 'Weather agent',
  description: 'Forecasts for any city',
  skills: [{ id: 'forecast', name: 'Forecast' }, { id: 'alerts', name: 'Alerts' }],
};

export const MCP_SERVERS = [
  { id: 'mcp_1', name: 'GitHub', transport: 'http', connected: true, enabled: true, authStatus: 'ok', toolCount: 12, url: 'https://api.githubcopilot.com/mcp', hasOAuth: true, source: 'user' as const, clientAuthMethod: '' },
  { id: 'mcp_2', name: 'Filesystem', transport: 'stdio', connected: false, enabled: true, authStatus: 'none', toolCount: 0, hasOAuth: false, source: 'skill' as const, lastError: 'spawn npx ENOENT' },
  { id: 'mcp_3', name: 'Linear', transport: 'http', connected: false, enabled: false, authStatus: 'none', toolCount: 5, url: 'https://mcp.linear.app/mcp', hasOAuth: false, source: 'marketplace' as const },
  { id: 'mcp_4', name: 'Notion', transport: 'http', connected: false, enabled: true, authStatus: 'auth_required', toolCount: 2, url: 'https://mcp.notion.com/mcp', hasOAuth: true, source: 'user' as const },
];

export const SCHEDULES = [
  { id: 'sch_1', cron: '0 9 * * 1', prompt: 'Summarise my inbox', enabled: true, last_run: '2026-10-05T09:00:00Z', created: '2026-09-01T08:00:00Z', source: 'plugin' as const, type: 'task' as const },
  { id: 'sch_2', cron: '30 18 * * *', prompt: 'Post the daily digest', enabled: false, last_run: null, created: '2026-09-03T08:00:00Z', source: 'telegram' as const, type: 'notify' as const },
];

export const SCHEDULE_RUNS = [
  { key: 'run_1', totalCost: 0.12, inputTokens: 4000, outputTokens: 900, calls: 4, firstTs: '2026-10-05T09:00:00Z', lastTs: '2026-10-05T09:02:00Z' },
];

export const PACKAGES = [
  { id: 'research-pack', type: 'plugin', source: 'marketplace', version: '1.2.0', installedAt: '2026-09-01T08:00:00Z', lastUpdated: '2026-09-20T08:00:00Z' },
  { id: 'pdf-tools', type: 'skill', source: 'marketplace', version: '0.3.1', installedAt: '2026-09-05T08:00:00Z', lastUpdated: '2026-09-05T08:00:00Z' },
];

export const SKILLS = [
  {
    id: 'skill_web', name: 'Web research', description: 'Searches and reads the web', disabled: false, autoActivate: true,
    activationOverride: null as 'always' | 'on-demand' | null, settingsFile: 'web-research.yaml', deletable: true,
    authConnectors: [
      { connectorId: 'google', label: 'Google', authenticated: true, refreshable: true, signIn: 'signed-in' as const },
      { connectorId: 'slack', label: 'Slack', authenticated: false, refreshable: false, signIn: 'needs-sign-in' as const },
    ],
  },
  {
    id: 'skill_pdf', name: 'PDF reader', description: 'Reads PDF files', disabled: true, autoActivate: false,
    activationOverride: 'always' as 'always' | 'on-demand' | null, deletable: false, pluginId: 'plugin_research',
    authConnectors: [
      { connectorId: 'dropbox', label: 'Dropbox', authenticated: false, refreshable: false, signIn: 'not-signed-in' as const },
    ],
  },
];

export const PLUGINS = [
  { id: 'plugin_research', name: 'Research pack', description: 'Research skills', disabled: false, deletable: true, skillCount: 1, skills: [] },
  { id: 'plugin_core', name: 'Core tools', description: 'Built in', disabled: true, deletable: false, skillCount: 0, skills: [] },
];

export const SKILL_SETTINGS = 'depth: 3\nsources: web\n';

export const FLEET = {
  loops: [{ loopId: 'loop_1', sessionId: 'sess_1', surface: 'chat', startedAt: '2026-10-12T09:58:00Z', currentAction: 'Reading inbox' }],
  subAgents: [{ agentId: 'agent_1', defId: 'researcher', state: 'running' as const, startedAt: '2026-10-12T09:59:00Z', currentAction: 'Searching the web', tokensSoFar: { input: 1200, output: 340 } }],
  sessions: [],
  jobs: [],
  enableSubagents: true,
};

export const QUEUE = {
  jobs: [
    { id: 'job_1', kind: 'schedule', status: 'running' as const, prompt: 'Summarise my inbox', scheduleId: 'sch_1', ageMs: 5000 },
    { id: 'job_2', kind: 'chat', status: 'waiting' as const, prompt: 'Draft a reply to Sam', ageMs: 2000 },
  ],
  running: 1,
  waiting: 1,
  pending: 0,
};

export const NOTIFICATION_CONFIG = {
  channels: { chrome: { enabled: true }, telegram: { enabled: false, chat_id: '12345' } },
  rules: {
    task_complete: ['chrome'],
    error: ['chrome', 'telegram'],
    auth_required: ['chrome'],
    daily_summary: [] as string[],
    background_done: ['chrome'],
    agent_notify: ['telegram'],
  },
  soundEnabled: true,
  availableChannels: [
    { id: 'chrome', name: 'Chrome Notifications', builtin: true },
    { id: 'telegram', name: 'Telegram', builtin: false },
  ],
};

export const PROVIDERS = {
  providers: {
    anthropic: { type: 'anthropic', models: { orchestrator: 'claude-sonnet-5-5' } },
    openai: { type: 'openai', models: { orchestrator: 'gpt-6-mini' } },
  },
  activeProvider: 'anthropic',
};

export const VERSION = { version: '2.3.1', gitCommit: 'abc1234', platform: 'darwin', arch: 'arm64', nodeVersion: 'v22.11.0' };

export const LOGS = {
  dates: ['2026-10-12', '2026-10-11'],
  logs: [
    { ts: '2026-10-12T09:00:00Z', level: 'info' as const, category: 'daemon', message: 'Daemon started' },
    { ts: '2026-10-12T09:10:00Z', level: 'warn' as const, category: 'auth', message: 'Token refresh took 4s' },
    { ts: '2026-10-12T09:20:00Z', level: 'error' as const, category: 'mcp', message: 'MCP server Filesystem exited' },
  ],
  older: [{ ts: '2026-10-11T12:00:00Z', level: 'info' as const, category: 'daemon', message: 'Older log line' }],
};

export const USAGE = { month: '2026-10', totalCost: 12.34, providers: { anthropic: { totalCost: 12.34, inputTokens: 1_200_000, outputTokens: 300_000, calls: 420 } } };

export const USAGE_ROWS = {
  session: [
    { key: 'Planning chat', totalCost: 0.42, inputTokens: 30000, outputTokens: 5000, calls: 7 },
    { key: 'Quick question', totalCost: 0.004, inputTokens: 200, outputTokens: 50, calls: 1 },
  ],
  schedule: [{ key: 'Summarise my inbox', totalCost: 1.5, inputTokens: 90000, outputTokens: 20000, calls: 20 }],
  agent: [{ key: 'researcher', totalCost: 2.25, inputTokens: 100000, outputTokens: 30000, calls: 31 }],
  month: [{ month: '2026-09', totalCost: 30.5 }],
};

const clone = <T>(value: T): T => structuredClone(value);

export interface DeviceOptions {
  /** Every list empty (secrets, schedules, servers, …). */
  empty?: boolean;
  onboardingCompleted?: boolean;
}

/**
 * Stateful handlers for every command the ai pages use. Mutations change the state,
 * so the page sees the change whether it uses the reply's list or re-sends the list command.
 */
export function fakeDevice(options: DeviceOptions = {}): Handlers {
  const empty = !!options.empty;
  const s = {
    secrets: empty ? [] : clone(SECRETS),
    entries: empty ? [] : clone(WHITELIST) as { host: string; source: string; reason?: string }[],
    agents: empty ? [] : clone(A2A_AGENTS) as Record<string, unknown>[],
    servers: empty ? [] : clone(MCP_SERVERS) as Record<string, unknown>[],
    schedules: empty ? [] : clone(SCHEDULES) as Record<string, unknown>[],
    packages: empty ? [] : clone(PACKAGES),
    skills: empty ? [] : clone(SKILLS) as Record<string, unknown>[],
    plugins: empty ? [] : clone(PLUGINS) as Record<string, unknown>[],
    settings: SKILL_SETTINGS,
    fleet: empty ? { ...clone(FLEET), loops: [], subAgents: [] } : clone(FLEET),
    queue: empty ? { jobs: [], running: 0, waiting: 0, pending: 0 } : clone(QUEUE),
    browserRunning: false,
    notifications: clone(NOTIFICATION_CONFIG),
    providers: empty ? { providers: {}, activeProvider: null } : clone(PROVIDERS),
    logs: empty ? { dates: [] as string[], logs: [] as typeof LOGS.logs } : { dates: LOGS.dates, logs: clone(LOGS.logs) },
    onboardingCompleted: options.onboardingCompleted ?? false,
    rows: empty ? { session: [], schedule: [], agent: [], month: [] } : clone(USAGE_ROWS),
  };
  const byId = <T extends Record<string, unknown>>(list: T[], id: unknown) => {
    const found = list.find((x) => x.id === id);
    if (!found) throw new Error(`not found: ${String(id)}`);
    return found;
  };
  const attribution = (rows: { totalCost: number }[]) => ({
    capsTotalCost: rows.length ? 1.0 : 0,
    attributedCost: rows.reduce((sum, r) => sum + r.totalCost, 0),
    groupsTotal: rows.length,
    causes: [],
  });
  const usageRows = (rows: { totalCost: number }[]) => ({ ok: true, data: { rows, attribution: attribution(rows) } });

  return {
    // Overview
    GET_ONBOARDING_STATE: () => ({ ok: true, data: { completed: s.onboardingCompleted } }),
    SET_ONBOARDING_COMPLETED: () => {
      s.onboardingCompleted = true;
      return { ok: true, data: { completed: true } };
    },
    GET_DEVICE_INFO: () => ({
      ok: true,
      data: {
        version: VERSION,
        providers: s.providers,
        usage: USAGE,
        skills: s.skills,
        mcpServers: s.servers,
        schedules: s.schedules,
        notifications: s.notifications,
      },
    }),
    // Usage
    GET_USAGE: () => ({ ok: true, data: USAGE }),
    GET_USAGE_BY_SESSION: () => usageRows(s.rows.session),
    GET_USAGE_BY_SCHEDULE: () => usageRows(s.rows.schedule),
    GET_USAGE_BY_AGENT: () => usageRows(s.rows.agent),
    GET_USAGE_BY_MONTH: () => ({ ok: true, data: { rows: s.rows.month } }),
    // Logs
    GET_LOGS: (p: Params) =>
      p.date
        ? { ok: true, date: p.date, logs: p.date === '2026-10-11' ? LOGS.older : s.logs.logs }
        : { ok: true, dates: s.logs.dates, logs: s.logs.logs },
    // Packages and skills
    LIST_INSTALLED: () => ({ ok: true, packages: s.packages }),
    UPDATE_PACKAGE: (p: Params) => {
      const pkg = s.packages.find((x) => x.id === p.id);
      if (pkg) pkg.version = '1.3.0';
      return { ok: true, id: p.id, detail: 'Updated to 1.3.0' };
    },
    UNINSTALL_PACKAGE: (p: Params) => {
      s.packages = s.packages.filter((x) => x.id !== p.id);
      return { ok: true, detail: 'Uninstalled' };
    },
    LIST_SKILLS: () => ({ skills: s.skills, plugins: s.plugins }),
    SKILL_SET_ENABLED: (p: Params) => {
      byId(s.skills, p.id).disabled = !p.enabled;
      return { ok: true, id: p.id, kind: 'skill', enabled: p.enabled };
    },
    SKILL_SET_ACTIVATION: (p: Params) => {
      byId(s.skills, p.id).activationOverride = p.choice;
      return { id: p.id, choice: p.choice, removed: p.choice === null };
    },
    PLUGIN_SET_ENABLED: (p: Params) => {
      byId(s.plugins, p.id).disabled = !p.enabled;
      return { ok: true, id: p.id, kind: 'plugin', enabled: p.enabled };
    },
    DELETE_SKILL: (p: Params) => {
      s.skills = s.skills.filter((x) => x.id !== p.id);
      return { ok: true, id: p.id, kind: 'skill' };
    },
    DELETE_PLUGIN: (p: Params) => {
      s.plugins = s.plugins.filter((x) => x.id !== p.id);
      return { ok: true, id: p.id, kind: 'plugin' };
    },
    GET_SKILL_SETTINGS: (p: Params) => ({ ok: true, skillId: p.skillId, settingsFile: 'web-research.yaml', content: s.settings, source: 'user' }),
    SET_SKILL_SETTINGS: (p: Params) => {
      if (String(p.content).includes('[')) return { ok: false, detail: 'YAML parse error on line 1' };
      s.settings = String(p.content);
      return { ok: true };
    },
    CONNECTOR_REVOKE: (p: Params) => {
      for (const skill of s.skills) {
        for (const c of skill.authConnectors as { connectorId: string; authenticated: boolean; signIn: string }[]) {
          if (c.connectorId === p.connectorId) Object.assign(c, { authenticated: false, signIn: 'not-signed-in' });
        }
      }
      return { ok: true, connectorId: p.connectorId, detail: 'Signed out' };
    },
    CONNECTOR_REFRESH: (p: Params) => ({ ok: true, connectorId: p.connectorId, detail: 'Token refreshed' }),
    // MCP
    MCP_LIST_SERVERS: () => ({ servers: s.servers }),
    MCP_SET_ENABLED: (p: Params) => {
      Object.assign(byId(s.servers, p.serverId), { enabled: p.enabled, connected: p.enabled ? byId(s.servers, p.serverId).connected : false });
      return { ok: true, servers: s.servers };
    },
    MCP_RECONNECT: (p: Params) => {
      for (const srv of s.servers) if (!p.serverId || srv.id === p.serverId) srv.lastError = undefined;
      return { ok: true, servers: s.servers };
    },
    MCP_RESYNC: () => ({ ok: true, servers: s.servers }),
    MCP_SET_CLIENT_AUTH: (p: Params) => {
      byId(s.servers, p.serverId).clientAuthMethod = p.method;
      return { ok: true, servers: s.servers };
    },
    MCP_REMOVE_SERVER: (p: Params) => {
      s.servers = s.servers.filter((x) => x.id !== p.serverId);
      return { ok: true };
    },
    MCP_ADD_SERVER: (p: Params) => {
      s.servers.push({ id: 'mcp_new', name: p.name, transport: 'http', connected: true, enabled: true, authStatus: 'none', toolCount: 3, url: p.url, hasOAuth: false, source: 'user' });
      return { ok: true, servers: s.servers };
    },
    MCP_DISCOVER_AUTH: (p: Params) =>
      String(p.url).includes('oauth')
        ? { ok: true, authorization_endpoint: 'https://auth.example.com/authorize', token_endpoint: 'https://auth.example.com/token', dcrSupported: true }
        : { ok: true, dcrSupported: false },
    // Schedules
    SCHEDULE_LIST: () => ({ schedules: s.schedules }),
    SCHEDULE_ADD: (p: Params) => {
      const schedule = { id: 'sch_new', cron: p.cron, prompt: p.prompt, enabled: true, last_run: null, created: FROZEN_NOW.toISOString(), source: 'plugin', type: 'task' };
      s.schedules.push(schedule);
      return { ok: true, schedule };
    },
    SCHEDULE_PAUSE: (p: Params) => {
      byId(s.schedules, p.scheduleId).enabled = false;
      return { ok: true, scheduleId: p.scheduleId };
    },
    SCHEDULE_RESUME: (p: Params) => {
      byId(s.schedules, p.scheduleId).enabled = true;
      return { ok: true, scheduleId: p.scheduleId };
    },
    SCHEDULE_REMOVE: (p: Params) => {
      s.schedules = s.schedules.filter((x) => x.id !== p.scheduleId);
      return { ok: true, scheduleId: p.scheduleId };
    },
    RELOAD_DECLARED_SCHEDULES: () => ({ type: 'DECLARED_SCHEDULES_RELOADED', added: 1, updated: 2, removed: 0, refused: [], warnings: [], schedules: s.schedules }),
    GET_SCHEDULE_RUNS: (p: Params) => ({ ok: true, data: { runs: p.scheduleId === 'sch_1' ? SCHEDULE_RUNS : [] } }),
    // Secrets
    SECRETS_LIST: () => ({ secrets: s.secrets }),
    SECRETS_ADD: (p: Params) => {
      s.secrets.push({ id: 'sec_new', name: String(p.name), description: String(p.description ?? ''), value: String(p.value), created_at: FROZEN_NOW.toISOString(), updated_at: FROZEN_NOW.toISOString() });
      return { ok: true, secrets: s.secrets };
    },
    SECRETS_UPDATE: (p: Params) => {
      const secret = s.secrets.find((x) => x.name === p.name);
      if (!secret) throw new Error(`No secret ${String(p.name)}`);
      secret.description = String(p.description ?? secret.description);
      if (typeof p.value === 'string') secret.value = p.value;
      return { ok: true, secrets: s.secrets };
    },
    SECRETS_REMOVE: (p: Params) => {
      s.secrets = s.secrets.filter((x) => x.name !== p.name);
      return { ok: true, secrets: s.secrets };
    },
    // Allowlist
    WHITELIST_LIST: () => ({ entries: s.entries }),
    WHITELIST_ADD: (p: Params) => {
      s.entries.push({ host: String(p.host), source: 'user' });
      return { ok: true, entries: s.entries };
    },
    WHITELIST_REMOVE: (p: Params) => {
      s.entries = s.entries.filter((x) => x.host !== p.host);
      return { ok: true, entries: s.entries };
    },
    // A2A
    A2A_LIST_AGENTS: () => ({ agents: s.agents }),
    A2A_SET_ENABLED: (p: Params) => {
      byId(s.agents, p.agentId).enabled = p.enabled;
      return { ok: true, agents: s.agents };
    },
    A2A_RESYNC: () => ({ ok: true, agents: s.agents }),
    A2A_AUTHENTICATE: (p: Params) => {
      byId(s.agents, p.agentId).authStatus = 'ok';
      return { ok: true, agents: s.agents };
    },
    A2A_AUTH_REVOKE: (p: Params) => {
      byId(s.agents, p.agentId).authStatus = 'auth_required';
      return { ok: true, agents: s.agents };
    },
    A2A_SET_CLIENT_AUTH: (p: Params) => {
      byId(s.agents, p.agentId).clientAuthMethod = p.method;
      return { ok: true, agents: s.agents };
    },
    A2A_REMOVE_AGENT: (p: Params) => {
      s.agents = s.agents.filter((x) => x.id !== p.agentId);
      return { ok: true, agents: s.agents };
    },
    A2A_GET_CARD: (p: Params) =>
      String(p.cardUrl).includes('missing') ? { ok: false, error: 'Card not found (404)' } : { ok: true, card: A2A_CARD },
    A2A_ADD_AGENT: (p: Params) => {
      s.agents.push({ id: 'a2a_new', name: p.name, cardUrl: p.cardUrl, enabled: true, source: 'user', hasOAuth: false, authStatus: 'none' });
      return { ok: true, agents: s.agents };
    },
    // Fleet
    LIST_FLEET: () => ({ ok: true, data: s.fleet }),
    LIST_QUEUE: () => s.queue,
    DAEMON_BROWSER_STATUS: () => ({ running: s.browserRunning }),
    DAEMON_BROWSER_START: () => {
      s.browserRunning = true;
      return { status: 'ok', message: 'Browser started' };
    },
    DAEMON_BROWSER_STOP: () => {
      s.browserRunning = false;
      return { ok: true };
    },
    // Notifications
    NOTIFICATION_GET_CONFIG: () => ({ config: s.notifications }),
    NOTIFICATION_SET_CONFIG: (p: Params) => {
      Object.assign(s.notifications, (p as { config: object }).config);
      return { ok: true };
    },
    // Providers
    GET_PROVIDERS: () => s.providers,
    GET_VERSION: () => ({ ok: true, data: VERSION }),
  };
}

// ---------------------------------------------------------------- page helpers

/** Consent banner, analytics and ads: never let them into a test. */
const THIRD_PARTY = /(iubenda|googletagmanager|google-analytics|googlesyndication|doubleclick|adservice)/;

/**
 * Open a signed-in ai page settled: third parties blocked, clock frozen at FROZEN_NOW,
 * h1 visible, fonts ready, Clerk's user button in the header. Install `bridge` (and adjust `server.state`) before calling.
 */
export async function openAi(page: Page, path: string): Promise<void> {
  await page.route(THIRD_PARTY, (route) => route.abort('blockedbyclient'));
  await quietBell(page);
  await page.clock.setFixedTime(FROZEN_NOW);
  await page.goto(path, { waitUntil: 'load' });
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  // The real Clerk session (signedIn()): the header settles on the signed-in user button, as on
  // the hub specs, before anything is asserted or shot.
  await page.locator('.cl-userButtonTrigger').first().waitFor({ state: 'attached', timeout: 30_000 });
}

/** Skip unless Clerk dev keys are present, and sign in as the E2E customer. */
export function signedIn(): void {
  test.skip(!hasClerkTestEnv(), 'Clerk development keys not configured');
  test.use({ storageState: storageStatePath('customer') });
}

/** Text that may appear in more than one node (label + value, list + toast …): first match. */
export const text = (page: Page, value: string | RegExp) =>
  page.getByText(value, typeof value === 'string' ? { exact: true } : undefined).first();

export const test = base.extend<{ server: MockServer; bridge: MockBridge }>({
  server: [
    async ({ page }, provide) => {
      await provide(await mockServer(page));
    },
    { auto: true },
  ],
  bridge: async ({ page }, provide) => {
    const bridge = new MockBridge(page);
    await provide(bridge);
    expect(bridge.disallowed(), 'every command the page sent is in the extension allow-list').toEqual([]);
  },
});

export { expect };
