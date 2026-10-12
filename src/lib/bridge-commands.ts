/**
 * Every command the ai. surface sends to the Tex extension bridge, with the payload fields the assistant's
 * handler needs. Pure: no browser or React imports.
 *
 * The extension forwards a command only if it is in CONTROL_PLANE_ALLOWED_COMMANDS
 * (assistant/plugin/src/background/worker.ts) and passes `params` straight to the native host, where the
 * handler is `case "<COMMAND>"` in assistant/native-host/src/index.ts. tests/unit/bridge-contract.vitest.ts
 * checks this table against both files, so a renamed field or a dropped command fails a test here.
 *
 * `required`: the handler refuses the request without it. `optional`: read by the handler when present.
 */

export interface CommandSpec {
  readonly required: readonly string[];
  readonly optional: readonly string[];
}

const spec = (required: readonly string[] = [], optional: readonly string[] = []): CommandSpec => ({ required, optional });

export const BRIDGE_COMMANDS = {
  // Device snapshot and reads
  GET_DEVICE_INFO: spec(),
  GET_VERSION: spec(),
  GET_PROVIDERS: spec(),
  GET_USAGE: spec([], ['month']),
  GET_USAGE_BY_SESSION: spec([], ['month']),
  GET_USAGE_BY_SCHEDULE: spec([], ['month']),
  GET_USAGE_BY_AGENT: spec([], ['month']),
  GET_USAGE_BY_MONTH: spec(['year']),
  GET_LOGS: spec([], ['date', 'since', 'limit']),
  GET_ONBOARDING_STATE: spec(),
  SET_ONBOARDING_COMPLETED: spec([], ['completed']),

  // Packages, skills, plugins, connectors
  LIST_INSTALLED: spec(),
  UPDATE_PACKAGE: spec(['id']),
  UNINSTALL_PACKAGE: spec(['id']),
  LIST_SKILLS: spec(),
  SKILL_SET_ENABLED: spec(['id'], ['enabled']),
  PLUGIN_SET_ENABLED: spec(['id'], ['enabled']),
  SKILL_SET_ACTIVATION: spec(['id', 'choice']),
  DELETE_SKILL: spec(['id']),
  DELETE_PLUGIN: spec(['id']),
  GET_SKILL_SETTINGS: spec(['skillId']),
  SET_SKILL_SETTINGS: spec(['skillId'], ['content']),
  CONNECTOR_REVOKE: spec(['connectorId']),
  CONNECTOR_REFRESH: spec(['connectorId']),

  // MCP servers
  MCP_LIST_SERVERS: spec(),
  MCP_RECONNECT: spec([], ['serverId']),
  MCP_RESYNC: spec(['serverId']),
  MCP_SET_ENABLED: spec(['serverId'], ['enabled']),
  MCP_SET_CLIENT_AUTH: spec(['serverId'], ['method']),
  MCP_DISCOVER_AUTH: spec(['url']),
  MCP_ADD_SERVER: spec(['name'], ['transport', 'url', 'source']),
  MCP_REMOVE_SERVER: spec(['serverId']),

  // Schedules
  SCHEDULE_LIST: spec(),
  SCHEDULE_ADD: spec(['cron', 'prompt'], ['source']),
  SCHEDULE_PAUSE: spec(['scheduleId']),
  SCHEDULE_RESUME: spec(['scheduleId']),
  SCHEDULE_REMOVE: spec(['scheduleId']),
  RELOAD_DECLARED_SCHEDULES: spec(),
  GET_SCHEDULE_RUNS: spec(['scheduleId'], ['month']),

  // Secrets and site allowlist
  SECRETS_LIST: spec(),
  SECRETS_ADD: spec(['name', 'value'], ['description']),
  SECRETS_UPDATE: spec(['name'], ['description', 'value']),
  SECRETS_REMOVE: spec(['name']),
  WHITELIST_LIST: spec(),
  WHITELIST_ADD: spec(['host']),
  WHITELIST_REMOVE: spec(['host']),

  // A2A peers
  A2A_LIST_AGENTS: spec(),
  A2A_GET_CARD: spec(['cardUrl']),
  A2A_ADD_AGENT: spec(['name', 'cardUrl'], ['source']),
  A2A_REMOVE_AGENT: spec(['agentId']),
  A2A_SET_ENABLED: spec(['agentId'], ['enabled']),
  A2A_SET_CLIENT_AUTH: spec(['agentId'], ['method']),
  A2A_RESYNC: spec(['agentId']),
  A2A_AUTHENTICATE: spec(['agentId']),
  A2A_AUTH_REVOKE: spec(['agentId']),

  // Fleet, queue, headless browser
  LIST_FLEET: spec(),
  LIST_QUEUE: spec(),
  DAEMON_BROWSER_STATUS: spec(),
  DAEMON_BROWSER_START: spec(),
  DAEMON_BROWSER_STOP: spec(),

  // Notifications
  NOTIFICATION_GET_CONFIG: spec(),
  NOTIFICATION_SET_CONFIG: spec(['config']),
} as const satisfies Record<string, CommandSpec>;

export type BridgeCommand = keyof typeof BRIDGE_COMMANDS;

export interface BridgeRequest {
  command: BridgeCommand;
  params: Record<string, unknown>;
}

export type Built = { ok: true; request: BridgeRequest } | { ok: false; error: string };

/** Required fields of `command` that `params` lacks (undefined or empty string). `null` counts as present. */
export function missingFields(command: BridgeCommand, params: Record<string, unknown>): string[] {
  return BRIDGE_COMMANDS[command].required.filter((f) => params[f] === undefined || params[f] === '');
}

/** Fields in `params` that the command's handler never reads. */
export function unknownFields(command: BridgeCommand, params: Record<string, unknown>): string[] {
  const { required, optional } = BRIDGE_COMMANDS[command];
  const known = new Set<string>([...required, ...optional]);
  return Object.keys(params).filter((k) => !known.has(k));
}

/** A request, checked against the table. Throws on a programming error (missing or unknown field). */
export function request(command: BridgeCommand, params: Record<string, unknown> = {}): BridgeRequest {
  const missing = missingFields(command, params);
  if (missing.length) throw new Error(`${command} needs ${missing.join(', ')}`);
  const unknown = unknownFields(command, params);
  if (unknown.length) throw new Error(`${command} does not read ${unknown.join(', ')}`);
  return { command, params };
}

const ok = (command: BridgeCommand, params: Record<string, unknown> = {}): Built => ({ ok: true, request: request(command, params) });
const fail = (error: string): Built => ({ ok: false, error });

// ── Validation shared with the forms ─────────────────────────────────────────

/** Same rule as the assistant's SECRETS_ADD handler. */
export const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

/** Host as the assistant stores it: trimmed and lower-cased. */
export function normalizeHost(value: string): string {
  return value.trim().toLowerCase();
}

export function cronFieldCount(cron: string): number {
  const t = cron.trim();
  return t ? t.split(/\s+/).length : 0;
}

export const CLIENT_AUTH_METHODS = ['none', 'client_secret_basic', 'client_secret_post'] as const;
export type ClientAuthMethod = (typeof CLIENT_AUTH_METHODS)[number];

export type ActivationChoice = 'always' | 'on-demand' | null;

// ── Builders for the forms (validated user input) ─────────────────────────────

export function buildSecretAdd(input: { name: string; description: string; value: string }): Built {
  const name = input.name.trim();
  if (!SECRET_NAME.test(name)) return fail('Name must be UPPER_CASE_UNDERSCORE');
  if (!input.value) return fail('Value is required');
  return ok('SECRETS_ADD', { name, description: input.description.trim(), value: input.value });
}

/** An empty `value` keeps the stored one: the field is left out. */
export function buildSecretUpdate(input: { name: string; description: string; value: string }): Built {
  const params: Record<string, unknown> = { name: input.name, description: input.description.trim() };
  if (input.value) params.value = input.value;
  return ok('SECRETS_UPDATE', params);
}

export function buildAllowSite(hostInput: string): Built {
  const host = normalizeHost(hostInput);
  if (!host) return fail('Enter a host');
  return ok('WHITELIST_ADD', { host });
}

export function buildScheduleAdd(input: { cron: string; prompt: string }): Built {
  const cron = input.cron.trim().split(/\s+/).join(' ');
  const prompt = input.prompt.trim();
  if (cronFieldCount(cron) !== 5) return fail('Cron needs 5 fields');
  if (!prompt) return fail('Prompt is required');
  return ok('SCHEDULE_ADD', { cron, prompt });
}

export function buildMcpAdd(input: { name: string; url: string }): Built {
  const name = input.name.trim();
  const url = input.url.trim();
  if (!name) return fail('Name is required');
  if (!isHttpUrl(url)) return fail('Enter an http(s) URL');
  return ok('MCP_ADD_SERVER', { name, url, transport: 'http', source: 'user' });
}

export function buildMcpDiscover(urlInput: string): Built {
  const url = urlInput.trim();
  if (!isHttpUrl(url)) return fail('Enter an http(s) URL');
  return ok('MCP_DISCOVER_AUTH', { url });
}

export function buildA2aPreview(cardUrlInput: string): Built {
  const cardUrl = cardUrlInput.trim();
  if (!isHttpUrl(cardUrl)) return fail('Enter an http(s) URL');
  return ok('A2A_GET_CARD', { cardUrl });
}

export function buildA2aAdd(input: { name: string; cardUrl: string }): Built {
  const name = input.name.trim();
  const cardUrl = input.cardUrl.trim();
  if (!name) return fail('Name is required');
  if (!isHttpUrl(cardUrl)) return fail('Enter an http(s) URL');
  return ok('A2A_ADD_AGENT', { name, cardUrl, source: 'user' });
}

/** '' (Automatic) clears the method on the device. */
export function clientAuthParam(value: string): '' | ClientAuthMethod {
  return (CLIENT_AUTH_METHODS as readonly string[]).includes(value) ? (value as ClientAuthMethod) : '';
}

/** The select's value ('' / 'always' / 'on-demand') to the handler's `choice`. */
export function activationChoice(value: string): ActivationChoice {
  return value === 'always' || value === 'on-demand' ? value : null;
}

export type UsageBreakdown = 'session' | 'schedule' | 'agent' | 'month';

export function buildUsageBreakdown(kind: UsageBreakdown, period: { month: string; year: string }): Built {
  if (kind === 'month') {
    if (!/^\d{4}$/.test(period.year)) return fail('Enter a year like 2026');
    return ok('GET_USAGE_BY_MONTH', { year: period.year });
  }
  if (!/^\d{4}-\d{2}$/.test(period.month)) return fail('Enter a month like 2026-10');
  const command = kind === 'session' ? 'GET_USAGE_BY_SESSION' : kind === 'schedule' ? 'GET_USAGE_BY_SCHEDULE' : 'GET_USAGE_BY_AGENT';
  return ok(command, { month: period.month });
}
