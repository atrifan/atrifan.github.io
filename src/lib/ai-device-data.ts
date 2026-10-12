/**
 * Display models for the device-backed ai. tabs, built from the assistant's bridge replies. Pure: every
 * function takes the raw `result` of a command (unknown, defensively read) and returns plain data.
 *
 * Reply shapes are the native-host handlers' (assistant/native-host/src/index.ts); see
 * src/lib/bridge-commands.ts for the requests.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
// Number.isFinite is false for anything that is not a finite number, strings included.
const num = (v: unknown): number => (Number.isFinite(v) ? (v as number) : 0);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const field = (raw: unknown, key: string): unknown => (isObj(raw) ? raw[key] : undefined);
/** `{ ok, data }` envelope or the bare payload. */
const payload = (raw: unknown): Obj | null => (isObj(raw) ? (isObj(raw.data) ? raw.data : raw) : null);

// ── Secrets ─────────────────────────────────────────────────────────────────

export interface SecretRow {
  name: string;
  description: string;
  updatedAt: string | null;
}

/** SECRETS_LIST returns stored values too; they are dropped here and never reach the page. */
export function normalizeSecrets(raw: unknown): SecretRow[] {
  return list(field(raw, 'secrets'))
    .filter((s) => typeof s.name === 'string' && s.name)
    .map((s) => ({ name: s.name as string, description: str(s.description), updatedAt: typeof s.updated_at === 'string' ? s.updated_at : null }));
}

// ── Site allowlist ──────────────────────────────────────────────────────────

export interface AllowRow {
  host: string;
  source: string;
  reason: string | null;
  /** The device only removes rows the user added. */
  removable: boolean;
}

export function normalizeAllowlist(raw: unknown): AllowRow[] {
  return list(field(raw, 'entries'))
    .filter((e) => typeof e.host === 'string' && e.host)
    .map((e) => {
      const source = str(e.source, 'user');
      return { host: e.host as string, source, reason: typeof e.reason === 'string' ? e.reason : null, removable: source === 'user' };
    });
}

const ALLOW_SOURCE: Record<string, string> = {
  user: 'Added by you',
  skill: 'From a skill',
  plugin: 'From a plugin',
  session: 'This session only',
};

export function allowlistSourceLabel(source: string): string {
  return ALLOW_SOURCE[source] ?? source;
}

// ── MCP servers ─────────────────────────────────────────────────────────────

export type McpStatus = 'connected' | 'disconnected' | 'disabled' | 'auth_required';

export const MCP_STATUS_LABEL: Record<McpStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  disabled: 'Disabled',
  auth_required: 'Sign-in needed',
};

export function mcpStatus(s: { enabled?: unknown; connected?: unknown; authStatus?: unknown }): McpStatus {
  if (s.enabled === false) return 'disabled';
  if (s.authStatus === 'auth_required') return 'auth_required';
  return s.connected === true ? 'connected' : 'disconnected';
}

export interface McpServerRow {
  id: string;
  name: string;
  transport: string;
  status: McpStatus;
  toolCount: number;
  hasOAuth: boolean;
  source: string;
  clientAuthMethod: string;
  lastError: string | null;
  enabled: boolean;
}

export function normalizeMcpServers(raw: unknown): McpServerRow[] {
  return list(field(raw, 'servers'))
    .filter((s) => typeof s.id === 'string' && s.id)
    .map((s) => ({
      id: s.id as string,
      name: str(s.name, s.id as string),
      transport: str(s.transport),
      status: mcpStatus(s),
      toolCount: num(s.toolCount),
      hasOAuth: s.hasOAuth === true,
      source: str(s.source),
      clientAuthMethod: str(s.clientAuthMethod),
      lastError: typeof s.lastError === 'string' && s.lastError ? s.lastError : null,
      enabled: s.enabled !== false,
    }));
}

/** MCP_DISCOVER_AUTH's answer, in words. */
export function describeDiscovery(raw: unknown): string {
  if (!isObj(raw) || raw.ok === false || typeof raw.authorization_endpoint !== 'string') return 'No sign-in found';
  return raw.dcrSupported === true ? 'Sign-in required · the server registers clients automatically' : 'Sign-in required';
}

// ── A2A peers ───────────────────────────────────────────────────────────────

export interface A2aAgentRow {
  id: string;
  name: string;
  cardUrl: string;
  enabled: boolean;
  source: string;
  hasOAuth: boolean;
  authStatus: string;
  skills: number;
  clientAuthMethod: string;
}

export function normalizeA2aAgents(raw: unknown): A2aAgentRow[] {
  return list(field(raw, 'agents'))
    .filter((a) => typeof a.id === 'string' && a.id)
    .map((a) => ({
      id: a.id as string,
      name: str(a.name, a.id as string),
      cardUrl: str(a.cardUrl),
      enabled: a.enabled !== false,
      source: str(a.source),
      hasOAuth: a.hasOAuth === true,
      authStatus: str(a.authStatus, 'none'),
      skills: Array.isArray(a.skills) ? a.skills.length : 0,
      clientAuthMethod: str(a.clientAuthMethod),
    }));
}

// ── Schedules ───────────────────────────────────────────────────────────────

export interface ScheduleRow {
  id: string;
  cron: string;
  prompt: string;
  enabled: boolean;
  lastRun: string | null;
  source: string;
}

export function normalizeSchedules(raw: unknown): ScheduleRow[] {
  return list(field(raw, 'schedules'))
    .filter((s) => typeof s.id === 'string' && s.id)
    .map((s) => ({
      id: s.id as string,
      cron: str(s.cron),
      prompt: str(s.prompt),
      enabled: s.enabled !== false,
      lastRun: typeof s.last_run === 'string' ? s.last_run : null,
      source: str(s.source),
    }));
}

export function reloadSummary(raw: unknown): string {
  const n = (k: string) => num(field(raw, k));
  return `Reloaded: ${n('added')} added, ${n('updated')} updated, ${n('removed')} removed`;
}

// ── Packages, skills, plugins ───────────────────────────────────────────────

export interface InstalledRow {
  id: string;
  type: string;
  version: string;
}

export function normalizeInstalled(raw: unknown): InstalledRow[] {
  return list(field(raw, 'packages'))
    .filter((p) => typeof p.id === 'string' && p.id)
    .map((p) => ({ id: p.id as string, type: str(p.type, 'plugin'), version: str(p.version) }));
}

export interface ConnectorRow {
  connectorId: string;
  label: string;
  authenticated: boolean;
  refreshable: boolean;
  state: string;
}

export interface SkillRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Select value: '' follows the skill file. */
  activation: '' | 'always' | 'on-demand';
  settingsFile: string | null;
  deletable: boolean;
  connectors: ConnectorRow[];
}

export interface PluginRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  deletable: boolean;
  skillCount: number;
}

const SIGN_IN_STATE: Record<string, string> = { 'signed-in': 'Signed in', 'needs-sign-in': 'Needs sign-in' };

export function normalizeSkills(raw: unknown): { skills: SkillRow[]; plugins: PluginRow[] } {
  const skills = list(field(raw, 'skills'))
    .filter((s) => typeof s.id === 'string' && s.id)
    .map((s) => {
      const act = s.activationOverride;
      return {
        id: s.id as string,
        name: str(s.name, s.id as string),
        description: str(s.description),
        enabled: s.disabled !== true,
        activation: act === 'always' || act === 'on-demand' ? act : '',
        settingsFile: typeof s.settingsFile === 'string' && s.settingsFile ? s.settingsFile : null,
        deletable: s.deletable === true,
        connectors: list(s.authConnectors)
          .filter((c) => typeof c.connectorId === 'string' && c.connectorId)
          .map((c) => ({
            connectorId: c.connectorId as string,
            label: str(c.label, c.connectorId as string),
            authenticated: c.authenticated === true,
            refreshable: c.refreshable === true,
            state: SIGN_IN_STATE[str(c.signIn)] ?? 'Not signed in',
          })),
      } satisfies SkillRow;
    });
  const plugins = list(field(raw, 'plugins'))
    .filter((p) => typeof p.id === 'string' && p.id)
    .map((p) => ({
      id: p.id as string,
      name: str(p.name, p.id as string),
      description: str(p.description),
      enabled: p.disabled !== true,
      deletable: p.deletable === true,
      skillCount: num(p.skillCount),
    }));
  return { skills, plugins };
}

// ── Fleet and queue ─────────────────────────────────────────────────────────

export interface LoopRow {
  loopId: string;
  sessionId: string;
  surface: string;
  startedAt: number;
  currentAction: string;
}

export interface SubAgentRow {
  agentId: string;
  defId: string;
  state: string;
  startedAt: number;
  tokensIn: number;
  tokensOut: number;
  currentAction: string;
}

export function normalizeFleet(raw: unknown): { loops: LoopRow[]; subAgents: SubAgentRow[]; enableSubagents: boolean } {
  const d = payload(raw) ?? {};
  const loops = list(d.loops)
    .filter((l) => typeof l.loopId === 'string')
    .map((l) => ({ loopId: l.loopId as string, sessionId: str(l.sessionId), surface: str(l.surface), startedAt: num(l.startedAt), currentAction: str(l.currentAction) }));
  const subAgents = list(d.subAgents)
    .filter((a) => typeof a.agentId === 'string')
    .map((a) => {
      const t = isObj(a.tokensSoFar) ? a.tokensSoFar : {};
      return {
        agentId: a.agentId as string,
        defId: str(a.defId),
        state: str(a.state, 'running'),
        startedAt: num(a.startedAt),
        tokensIn: num(t.input),
        tokensOut: num(t.output),
        currentAction: str(a.currentAction),
      };
    });
  return { loops, subAgents, enableSubagents: d.enableSubagents === true };
}

export interface JobRow {
  id: string;
  kind: string;
  status: string;
  prompt: string;
}

export function normalizeQueue(raw: unknown): { jobs: JobRow[]; running: number; waiting: number; pending: number } {
  const jobs = list(field(raw, 'jobs'))
    .filter((j) => j.id !== undefined && j.id !== null)
    .map((j) => ({ id: String(j.id), kind: str(j.kind), status: str(j.status, 'pending'), prompt: str(j.prompt) }));
  const count = (k: 'running' | 'waiting' | 'pending') => {
    const v = field(raw, k);
    return typeof v === 'number' ? v : jobs.filter((j) => j.status === k).length;
  };
  return { jobs, running: count('running'), waiting: count('waiting'), pending: count('pending') };
}

// ── Notifications ───────────────────────────────────────────────────────────

export const NOTIFICATION_EVENTS = [
  { id: 'task_complete', label: 'Task complete' },
  { id: 'error', label: 'Error' },
  { id: 'auth_required', label: 'Sign-in required' },
  { id: 'daily_summary', label: 'Daily summary' },
  { id: 'background_done', label: 'Background task done' },
  { id: 'agent_notify', label: 'Agent message' },
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]['id'];

export interface ChannelRow {
  id: string;
  name: string;
  builtin: boolean;
  enabled: boolean;
}

export interface NotificationModel {
  channels: ChannelRow[];
  rules: Record<NotificationEvent, string[]>;
  soundEnabled: boolean;
  /** The loaded per-channel settings, kept so a save does not drop them. */
  channelSettings: Record<string, Obj>;
}

export function toNotificationModel(raw: unknown): NotificationModel {
  const cfg = isObj(field(raw, 'config')) ? (field(raw, 'config') as Obj) : {};
  const settings: Record<string, Obj> = { chrome: { enabled: false } };
  for (const [id, v] of Object.entries(isObj(cfg.channels) ? cfg.channels : {})) settings[id] = isObj(v) ? { ...v } : { enabled: false };
  const available = list(cfg.availableChannels).filter((c) => typeof c.id === 'string' && c.id);
  const channels: ChannelRow[] = (available.length ? available : [{ id: 'chrome', name: 'Chrome Notifications', builtin: true }]).map((c) => ({
    id: c.id as string,
    name: str(c.name, c.id as string),
    builtin: c.builtin === true,
    enabled: settings[c.id as string]?.enabled === true,
  }));
  const rulesIn = isObj(cfg.rules) ? cfg.rules : {};
  const rules = Object.fromEntries(
    NOTIFICATION_EVENTS.map((e) => [e.id, Array.isArray(rulesIn[e.id]) ? (rulesIn[e.id] as unknown[]).filter((x): x is string => typeof x === 'string') : []]),
  ) as Record<NotificationEvent, string[]>;
  return { channels, rules, soundEnabled: cfg.soundEnabled !== false, channelSettings: settings };
}

export function setChannelEnabled(m: NotificationModel, id: string, enabled: boolean): NotificationModel {
  return { ...m, channels: m.channels.map((c) => (c.id === id ? { ...c, enabled } : c)) };
}

export function toggleRule(m: NotificationModel, event: NotificationEvent, channel: string): NotificationModel {
  const cur = m.rules[event];
  const next = cur.includes(channel) ? cur.filter((c) => c !== channel) : [...cur, channel];
  return { ...m, rules: { ...m.rules, [event]: next } };
}

/** The full config NOTIFICATION_SET_CONFIG saves (it replaces channels and rules, so both are complete). */
export function toNotificationConfig(m: NotificationModel): { channels: Record<string, Obj>; rules: Record<NotificationEvent, string[]>; soundEnabled: boolean } {
  const channels: Record<string, Obj> = {};
  for (const [id, v] of Object.entries(m.channelSettings)) channels[id] = { ...v };
  for (const c of m.channels) channels[c.id] = { ...(channels[c.id] ?? {}), enabled: c.enabled };
  return { channels, rules: { ...m.rules }, soundEnabled: m.soundEnabled };
}

// ── Providers, version, device snapshot ─────────────────────────────────────

export interface ProviderRow {
  name: string;
  models: string[];
  active: boolean;
}

export function normalizeProviders(raw: unknown): { providers: ProviderRow[]; active: string; activeModel: string } {
  const provs = isObj(field(raw, 'providers')) ? (field(raw, 'providers') as Obj) : {};
  const active = str(field(raw, 'activeProvider'));
  const providers = Object.entries(provs).map(([name, p]) => ({
    name,
    models: Object.values(isObj(p) && isObj(p.models) ? p.models : {}).filter((x): x is string => typeof x === 'string'),
    active: name === active,
  }));
  providers.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const activeEntry = provs[active];
  const activeModel = isObj(activeEntry) && isObj(activeEntry.models) ? str(activeEntry.models.orchestrator) : '';
  return { providers, active, activeModel };
}

export interface VersionInfo {
  version: string;
  gitCommit: string;
  platform: string;
  arch: string;
  nodeVersion: string;
}

export function normalizeVersion(raw: unknown): VersionInfo | null {
  const d = payload(raw);
  if (!d || typeof d.version !== 'string' || !d.version) return null;
  return { version: d.version, gitCommit: str(d.gitCommit), platform: str(d.platform), arch: str(d.arch), nodeVersion: str(d.nodeVersion) };
}

export interface DeviceSummary {
  version: string;
  activeModel: string;
  monthlyCost: number;
  skills: number;
  mcpConnected: number;
  mcpTotal: number;
  activeSchedules: number;
}

/** GET_DEVICE_INFO in one line per figure, for the Overview card and the presence beacon. */
export function summarizeDeviceInfo(raw: unknown): DeviceSummary | null {
  if (!isObj(raw) || !isObj(raw.data)) return null;
  const d = raw.data;
  const servers = list(d.mcpServers);
  return {
    version: str(field(d.version, 'version')),
    activeModel: normalizeProviders(d.providers).activeModel,
    monthlyCost: num(field(d.usage, 'totalCost')),
    skills: Array.isArray(d.skills) ? d.skills.length : 0,
    mcpConnected: servers.filter((s) => s.connected === true).length,
    mcpTotal: servers.length,
    activeSchedules: list(d.schedules).filter((s) => s.enabled !== false).length,
  };
}

export function isVersionOutdated(current: string | null | undefined, latest: string | null | undefined): boolean {
  if (!current || !latest) return false;
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((x) => Number(x) || 0);
  const c = parse(current);
  const l = parse(latest);
  for (let i = 0; i < 3; i++) {
    if ((c[i] ?? 0) !== (l[i] ?? 0)) return (c[i] ?? 0) < (l[i] ?? 0);
  }
  return false;
}

// ── Logs ────────────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogRow {
  ts: number;
  level: LogLevel;
  category: string;
  message: string;
}

export function normalizeLogs(raw: unknown): { dates: string[]; logs: LogRow[] } {
  const dates = Array.isArray(field(raw, 'dates')) ? (field(raw, 'dates') as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  // The host sends epoch milliseconds; an ISO string is read too rather than dropping the line.
  const tsOf = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN);
  const logs = list(field(raw, 'logs'))
    .filter((l) => Number.isFinite(tsOf(l.ts)))
    .map((l) => ({
      ts: tsOf(l.ts),
      level: (l.level === 'warn' || l.level === 'error' ? l.level : 'info') as LogLevel,
      category: str(l.category, 'system'),
      message: str(l.message),
    }))
    .sort((a, b) => a.ts - b.ts);
  return { dates, logs };
}

export function filterLogs(logs: readonly LogRow[], f: { levels: ReadonlySet<string>; search: string }): LogRow[] {
  const q = f.search.trim().toLowerCase();
  return logs.filter((l) => f.levels.has(l.level) && (!q || l.message.toLowerCase().includes(q)));
}

// ── Labels ──────────────────────────────────────────────────────────────────

export function relativeTime(date: string | null, now: number): string {
  const t = date ? new Date(date).getTime() : NaN;
  if (Number.isNaN(t)) return 'Never';
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const EVENT_LABELS: Record<string, string> = {
  request: 'API request',
  verify: 'Key verified',
  config_fetch: 'Config fetch',
  marketplace_discover: 'Marketplace search',
  marketplace_publish: 'Package published',
};

export function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type.replace(/_/g, ' ');
}
