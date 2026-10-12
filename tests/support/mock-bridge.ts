import { expect, type Page } from '@playwright/test';

/**
 * Mock of the tulzo browser extension's window.postMessage bridge.
 *
 * The page posts `{ source: 'tulzo', action, ... }` to its own window; the real
 * content script answers with `{ source: 'tex-extension', ... }`. The init script
 * below plays the content script. Command results are computed on the Node side
 * through an exposed binding, so handlers are plain TypeScript functions of the
 * params (they can keep state, delay, hold or throw) and nothing is eval'd in the page.
 *
 * Every command the page sends is recorded twice: in the page as
 * `window.__bridgeCalls` (reset on navigation) and in `MockBridge.calls` (kept for
 * the whole test). With `connected: false` the bridge records but never answers,
 * which is what a browser without the extension looks like.
 */

/** Commands the real extension forwards. The page must never send anything else. */
export const ALLOWED_COMMANDS = [
  'LOAD_HISTORY', 'LIST_SKILLS', 'GET_DEVICE_INFO', 'SCHEDULE_LIST', 'SCHEDULE_ADD', 'SCHEDULE_PAUSE',
  'SCHEDULE_RESUME', 'SCHEDULE_REMOVE', 'RELOAD_DECLARED_SCHEDULES', 'GET_CREDENTIAL_CONFIG',
  'NOTIFICATION_GET_CONFIG', 'NOTIFICATION_SET_CONFIG', 'GET_CONTROL_PLANE_CONFIG', 'DAEMON_BROWSER_STATUS',
  'DAEMON_BROWSER_START', 'DAEMON_BROWSER_STOP', 'MCP_LIST_SERVERS', 'MCP_LIST_TOOLS', 'MCP_RECONNECT',
  'MCP_RESYNC', 'MCP_ADD_SERVER', 'MCP_DISCOVER_AUTH', 'SEARCH_MESSAGES', 'CONNECTOR_REVOKE',
  'CONNECTOR_REFRESH', 'MCP_SET_ENABLED', 'MCP_SET_CLIENT_AUTH', 'MCP_REMOVE_SERVER', 'A2A_LIST_AGENTS',
  'A2A_GET_CARD', 'A2A_ADD_AGENT', 'A2A_REMOVE_AGENT', 'A2A_SET_ENABLED', 'A2A_SET_CLIENT_AUTH', 'A2A_RESYNC',
  'A2A_AUTHENTICATE', 'A2A_AUTH_REVOKE', 'SKILL_SET_ENABLED', 'SKILL_SET_ACTIVATION', 'PLUGIN_SET_ENABLED',
  'DELETE_SKILL', 'DELETE_PLUGIN', 'LIST_QUEUE', 'GET_SKILL_SETTINGS', 'SET_SKILL_SETTINGS', 'GET_USAGE',
  'GET_USAGE_BY_SESSION', 'GET_USAGE_BY_SCHEDULE', 'GET_USAGE_BY_AGENT', 'GET_USAGE_BY_MONTH',
  'GET_SESSION_TURNS', 'GET_SCHEDULE_RUNS', 'LIST_FLEET', 'GET_ONBOARDING_STATE', 'SET_ONBOARDING_COMPLETED',
  'GET_PROVIDERS', 'GET_VERSION', 'GET_LOGS', 'INSTALL_PACKAGE', 'LIST_INSTALLED', 'UPDATE_PACKAGE',
  'UNINSTALL_PACKAGE', 'SECRETS_LIST', 'SECRETS_ADD', 'SECRETS_UPDATE', 'SECRETS_REMOVE', 'WHITELIST_LIST',
  'WHITELIST_ADD', 'WHITELIST_REMOVE',
] as const;

export type BridgeCommand = (typeof ALLOWED_COMMANDS)[number];
export type Params = Record<string, unknown>;
export interface RecordedCall { command: string; params: Params }
export interface RecordedActivation { apiKey: unknown; deviceName: unknown }

/** Computes a command's result. Throwing (or returning a rejected promise) answers `ok: false, error: message`. */
export type Handler = (params: Params) => unknown;
export type Handlers = Partial<Record<string, Handler>>;

export interface BridgeOptions {
  /** Answer discover/heartbeat/commands. false = record only (extension not installed). Default true. */
  connected?: boolean;
  deviceName?: string;
  capabilities?: string[];
  handlers?: Handlers;
}

type Envelope = { ok: true; result: unknown } | { ok: false; error: string };

interface BridgeWindow {
  __bridgeCalls: RecordedCall[];
  __bridgeMessages: unknown[];
  __bridgeActivations: RecordedActivation[];
  __bridgeHandle: (command: string, params: Params) => Promise<Envelope | null>;
  __bridgeActivate: (apiKey: unknown, deviceName: unknown) => Promise<void>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class MockBridge {
  readonly calls: RecordedCall[] = [];
  readonly activations: RecordedActivation[] = [];
  private handlers: Handlers = {};
  private errors = new Map<string, string>();
  private delays = new Map<string, number>();
  private holds = new Map<string, { promise: Promise<void>; release: () => void }>();
  private connected = true;
  private installed = false;

  constructor(private readonly page: Page) {}

  /** Install before the first `page.goto`. */
  async install(options: BridgeOptions = {}): Promise<this> {
    if (this.installed) throw new Error('MockBridge.install called twice');
    this.installed = true;
    this.connected = options.connected ?? true;
    this.handlers = { ...(options.handlers ?? {}) };
    await this.page.exposeBinding('__bridgeHandle', (_source, command: string, params: Params) =>
      this.handle(command, params),
    );
    await this.page.exposeBinding('__bridgeActivate', (_source, apiKey: unknown, deviceName: unknown) => {
      this.activations.push({ apiKey, deviceName });
    });
    await this.page.addInitScript(
      (cfg) => {
        const w = window as unknown as BridgeWindow;
        w.__bridgeCalls = [];
        w.__bridgeMessages = [];
        w.__bridgeActivations = [];
        const reply = (msg: Record<string, unknown>) =>
          window.setTimeout(() => window.postMessage({ source: 'tex-extension', ...msg }, '*'), 0);
        window.addEventListener('message', (event: MessageEvent) => {
          if (event.source !== window) return;
          const msg = event.data as Record<string, unknown> | null;
          // Our own tex-extension replies arrive on the same window: ignore everything not from the page.
          if (!msg || typeof msg !== 'object' || msg.source !== 'tulzo') return;
          w.__bridgeMessages.push(msg);
          switch (msg.action) {
            case 'discover':
              if (cfg.connected) {
                reply({
                  action: 'discover_ack',
                  version: '1.0',
                  capabilities: cfg.capabilities,
                  deviceName: cfg.deviceName,
                  activated: true,
                });
              }
              break;
            case 'heartbeat':
              if (cfg.connected) reply({ action: 'heartbeat_ack' });
              break;
            case 'command': {
              const command = String(msg.command);
              const params = (msg.params ?? {}) as Params;
              w.__bridgeCalls.push({ command, params });
              void w.__bridgeHandle(command, params).then((envelope) => {
                if (envelope) reply({ action: 'command_response', id: msg.id, ...envelope });
              });
              break;
            }
            case 'activate_device':
              w.__bridgeActivations.push({ apiKey: msg.apiKey, deviceName: msg.deviceName });
              void w.__bridgeActivate(msg.apiKey, msg.deviceName);
              if (cfg.connected) reply({ action: 'device_activated', success: true });
              break;
          }
        });
      },
      {
        connected: this.connected,
        deviceName: options.deviceName ?? 'Work laptop',
        capabilities: options.capabilities ?? ['commands', 'activate_device'],
      },
    );
    return this;
  }

  /** Replace a command's handler (takes effect for the next call). Clears any error set with `fail`. */
  set(command: BridgeCommand, handler: Handler): void {
    this.handlers[command] = handler;
    this.errors.delete(command);
  }

  /** Make a command answer `ok: false` with this error until `set` or `recover` is called. */
  fail(command: BridgeCommand, error: string): void {
    this.errors.set(command, error);
  }

  recover(command: BridgeCommand): void {
    this.errors.delete(command);
  }

  delay(command: BridgeCommand, ms: number): void {
    this.delays.set(command, ms);
  }

  /** Keep a command pending until `release(command)`. */
  hold(command: BridgeCommand): void {
    let release = () => {};
    const promise = new Promise<void>((resolve) => (release = resolve));
    this.holds.set(command, { promise, release });
  }

  release(command: BridgeCommand): void {
    this.holds.get(command)?.release();
    this.holds.delete(command);
  }

  callsOf(command: BridgeCommand): Params[] {
    return this.calls.filter((c) => c.command === command).map((c) => c.params);
  }

  lastParams(command: BridgeCommand): Params | undefined {
    const all = this.callsOf(command);
    return all[all.length - 1];
  }

  /** Waits until `command` was sent and its latest params equal `params`. */
  async expectSent(command: BridgeCommand, params: Params, message?: string): Promise<void> {
    await expect
      .poll(() => this.lastParams(command), { message: message ?? `${command} sent with ${JSON.stringify(params)}` })
      .toEqual(params);
  }

  /** Waits until `command` was sent `count` times in total. */
  async expectCount(command: BridgeCommand, count: number): Promise<void> {
    await expect.poll(() => this.callsOf(command).length, { message: `${command} sent ${count} times` }).toBe(count);
  }

  /** Calls whose command is not in the extension's allow-list (should always be empty). */
  disallowed(): RecordedCall[] {
    const allowed = new Set<string>(ALLOWED_COMMANDS);
    return this.calls.filter((c) => !allowed.has(c.command));
  }

  private async handle(command: string, params: Params): Promise<Envelope | null> {
    this.calls.push({ command, params });
    if (!this.connected) return null;
    const delay = this.delays.get(command);
    if (delay) await sleep(delay);
    const hold = this.holds.get(command);
    if (hold) await hold.promise;
    const error = this.errors.get(command);
    if (error) return { ok: false, error };
    const handler = this.handlers[command];
    if (!handler) return { ok: false, error: `Mock bridge has no handler for ${command}` };
    try {
      return { ok: true, result: await handler(params) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Commands recorded in the current document (`window.__bridgeCalls`). */
export async function bridgeCalls(page: Page): Promise<RecordedCall[]> {
  return page.evaluate(() => (window as unknown as BridgeWindow).__bridgeCalls ?? []);
}

/** Waits until the current document has sent `command`; returns its params. */
export async function waitForCommand(page: Page, command: BridgeCommand, timeout = 10_000): Promise<Params> {
  const handle = await page.waitForFunction(
    (name) => (window as unknown as BridgeWindow).__bridgeCalls?.find((c) => c.command === name)?.params,
    command,
    { timeout },
  );
  return (await handle.jsonValue()) as Params;
}
