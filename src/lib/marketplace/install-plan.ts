/**
 * How a catalog package is installed through the assistant extension bridge, what the install
 * looks like on the command line, and what an MCP server / A2A agent gets access to. Pure; safe in
 * client components.
 *
 * Bridge commands (all on the assistant's control-plane allow-list, plugin/src/background/worker.ts):
 * - archive kinds → INSTALL_PACKAGE { type, id, source: <zip URL>, sourceType: 'archive' }
 * - mcp           → MCP_ADD_SERVER  { id: 'marketplace__<id>', name, transport, url | command/args/env, source, packageId }
 * - a2a           → A2A_ADD_AGENT   { id: 'marketplace__<id>', name, cardUrl, source, packageId }
 * The `marketplace__` prefix is how installed MCP servers / A2A agents map back to packages.
 */
import { installMode, slugify, type PackageKind } from './kinds';

export interface InstallTarget {
  id: string;
  name: string;
  type: PackageKind;
  blobUrl: string | null;
  config: Record<string, unknown> | null;
}

export type InstallCommand =
  | { ok: true; command: 'INSTALL_PACKAGE' | 'MCP_ADD_SERVER' | 'A2A_ADD_AGENT'; params: Record<string, unknown> }
  | { ok: false; error: string };

const MARKETPLACE_PREFIX = 'marketplace__';
/** Connection fields forwarded to MCP_ADD_SERVER (catalog metadata such as tools stays behind). */
const MCP_FORWARD = ['url', 'command', 'args', 'env', 'oauth', 'authentication'] as const;
const TRANSPORTS = ['http', 'sse', 'stdio'];

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

export function buildInstallCommand(pkg: InstallTarget): InstallCommand {
  const mode = installMode(pkg.type);
  const cfg = pkg.config;
  if (mode === 'mcp') {
    const transport = cfg?.transport as string;
    if (!cfg || !TRANSPORTS.includes(transport)) {
      return { ok: false, error: 'This MCP server has no connection details.' };
    }
    const params: Record<string, unknown> = { id: MARKETPLACE_PREFIX + pkg.id, name: pkg.name, transport };
    for (const key of MCP_FORWARD) {
      if (cfg[key] !== undefined) params[key] = cfg[key];
    }
    return { ok: true, command: 'MCP_ADD_SERVER', params: { ...params, source: 'marketplace', packageId: pkg.id } };
  }
  if (mode === 'a2a') {
    const cardUrl = text(cfg?.card_url);
    if (!cardUrl) return { ok: false, error: 'This A2A agent has no agent card URL.' };
    return {
      ok: true,
      command: 'A2A_ADD_AGENT',
      params: { id: MARKETPLACE_PREFIX + pkg.id, name: pkg.name, cardUrl, source: 'marketplace', packageId: pkg.id },
    };
  }
  const source = text(pkg.blobUrl);
  if (!source) return { ok: false, error: 'This package has no archive to install.' };
  return { ok: true, command: 'INSTALL_PACKAGE', params: { type: pkg.type, id: pkg.id, source, sourceType: 'archive' } };
}

interface IdRow {
  id?: unknown;
}

function ids(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((r: IdRow | null) => (r && typeof r.id === 'string' ? r.id : null)).filter((x): x is string => !!x);
}

/**
 * Package ids installed on the device, from LIST_INSTALLED (`packages`), MCP_LIST_SERVERS
 * (`servers`) and A2A_LIST_AGENTS (`agents`). Only marketplace-installed servers/agents count.
 */
export function installedIds(lists: { packages?: unknown; servers?: unknown; agents?: unknown }): Set<string> {
  const out = new Set(ids(lists.packages));
  for (const id of [...ids(lists.servers), ...ids(lists.agents)]) {
    if (id.startsWith(MARKETPLACE_PREFIX)) out.add(id.slice(MARKETPLACE_PREFIX.length));
  }
  return out;
}

function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** A command a user can paste: `claude mcp add …` for MCP servers, a download for archives. */
export function cliInstallCommand(pkg: InstallTarget): string | null {
  const mode = installMode(pkg.type);
  if (mode === 'a2a') return null;
  if (mode === 'archive') {
    const url = text(pkg.blobUrl);
    return url ? `curl -L -o ${shellQuote(`${pkg.id}.zip`)} ${shellQuote(url)}` : null;
  }
  const cfg = pkg.config;
  const name = slugify(pkg.name) || slugify(pkg.id);
  if (!cfg) return null;
  if (cfg.transport === 'http' || cfg.transport === 'sse') {
    const url = text(cfg.url);
    return url ? `claude mcp add --transport ${cfg.transport} ${name} ${shellQuote(url)}` : null;
  }
  const command = text(cfg.command);
  if (cfg.transport !== 'stdio' || !command) return null;
  const env = cfg.env && typeof cfg.env === 'object' ? Object.entries(cfg.env as Record<string, unknown>) : [];
  const args = Array.isArray(cfg.args) ? cfg.args.filter((a): a is string => typeof a === 'string') : [];
  return [
    'claude mcp add',
    name,
    ...env.map(([k, v]) => `-e ${shellQuote(`${k}=${String(v)}`)}`),
    '--',
    shellQuote(command),
    ...args.map(shellQuote),
  ].join(' ');
}

function hostOf(url: unknown): string | null {
  try {
    return new URL(String(url)).host || null;
  } catch {
    return null;
  }
}

/** Plain-language list of what an MCP server or A2A agent can reach. Empty for archives. */
export function packagePermissions(pkg: InstallTarget): string[] {
  const mode = installMode(pkg.type);
  const cfg = pkg.config;
  if (mode === 'archive' || !cfg) return [];
  const out: string[] = [];
  const host = hostOf(mode === 'a2a' ? cfg.card_url : cfg.url);
  if (host) out.push(`Connects to ${host}`);
  if (mode === 'mcp' && cfg.transport === 'stdio' && text(cfg.command)) out.push(`Runs a local command: ${cfg.command}`);
  if (cfg.env && typeof cfg.env === 'object') {
    const keys = Object.keys(cfg.env as object);
    if (keys.length) out.push(`Reads environment variables: ${keys.join(', ')}`);
  }
  if (cfg.oauth) out.push('Signs in with OAuth');
  if (Array.isArray(cfg.permissions)) {
    for (const p of cfg.permissions) if (typeof p === 'string' && p.trim()) out.push(p.trim());
  }
  return out;
}

export function mcpTools(config: Record<string, unknown> | null): Array<{ name: string; description: string }> {
  const tools = config?.tools;
  if (!Array.isArray(tools)) return [];
  const out: Array<{ name: string; description: string }> = [];
  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;
    const { name, description } = t as Record<string, unknown>;
    if (typeof name === 'string' && name) out.push({ name, description: typeof description === 'string' ? description : '' });
  }
  return out;
}
