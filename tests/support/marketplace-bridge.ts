import type { Locator, Page } from '@playwright/test';

/**
 * A mocked Tulzo assistant extension for the marketplace specs.
 *
 * The page talks to the extension with window.postMessage on its own window:
 *   page -> { source: 'tulzo', action: 'discover' | 'heartbeat' | 'command', id?, command?, params? }
 *   ext  -> { source: 'tex-extension', action: 'discover_ack' | 'heartbeat_ack' | 'command_response', ... }
 * Every command the page sends is recorded on window.__bridgeCommands.
 */

export interface BridgeCommand {
  id: unknown;
  command: string;
  params: Record<string, unknown> | undefined;
}

export interface BridgeOptions {
  /** Result per command name, replacing the default. */
  results?: Record<string, unknown>;
  /** Commands that fail with `ok: false, error: <message>`. */
  errors?: Record<string, string>;
}

/** Install the mock before the first navigation (it runs on every document of the page). */
export async function mockBridge(page: Page, options: BridgeOptions = {}): Promise<void> {
  await page.addInitScript((opts: BridgeOptions) => {
    const defaults: Record<string, unknown> = {
      LIST_INSTALLED: { ok: true, packages: [] },
      MCP_LIST_SERVERS: { servers: [] },
      A2A_LIST_AGENTS: { agents: [] },
    };
    const w = window as unknown as { __bridgeCommands: BridgeCommand[] };
    w.__bridgeCommands = [];
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data as { source?: string; action?: string; id?: unknown; command?: string; params?: Record<string, unknown> } | null;
      if (!data || data.source !== 'tulzo') return;
      const reply = (msg: Record<string, unknown>) => window.postMessage({ source: 'tex-extension', ...msg }, '*');
      if (data.action === 'discover') {
        reply({ action: 'discover_ack', version: '9.9.9', capabilities: [], deviceName: 'e2e', activated: true });
      } else if (data.action === 'heartbeat') {
        reply({ action: 'heartbeat_ack' });
      } else if (data.action === 'command' && typeof data.command === 'string') {
        w.__bridgeCommands.push({ id: data.id, command: data.command, params: data.params });
        const error = opts.errors?.[data.command];
        if (error !== undefined) {
          reply({ action: 'command_response', id: data.id, ok: false, error });
          return;
        }
        const result =
          opts.results && data.command in opts.results
            ? opts.results[data.command]
            : data.command in defaults
              ? defaults[data.command]
              : { ok: true };
        reply({ action: 'command_response', id: data.id, ok: true, result });
      }
    });
  }, options);
}

/** Commands the page has sent to the mock so far, optionally only one kind. */
export async function bridgeCommands(page: Page, command?: string): Promise<BridgeCommand[]> {
  const all = await page.evaluate(
    () => (window as unknown as { __bridgeCommands?: BridgeCommand[] }).__bridgeCommands ?? [],
  );
  return command ? all.filter((c) => c.command === command) : all;
}

/** A catalog card: an article named by the package name. */
export function card(page: Page, name: string): Locator {
  return page.getByRole('article', { name, exact: true });
}

/** The install count shown on a card ("1.5k installs", "860 installs", "1 install") as a number. */
export async function installCount(cardLocator: Locator): Promise<number> {
  const text = (await cardLocator.textContent()) ?? '';
  const m = text.match(/(\d+(?:[.,]\d+)?)(k?)\s+installs?\b/i);
  if (!m) throw new Error(`no install count in card text: ${text}`);
  const n = Number(m[1].replace(',', '.'));
  return m[2] ? Math.round(n * 1000) : n;
}

/** Package names of the cards in page order. */
export async function cardNames(page: Page): Promise<string[]> {
  const names = await page
    .getByRole('article')
    .evaluateAll((els) => els.map((el) => el.querySelector('h1,h2,h3,h4,h5,h6')?.textContent?.trim() ?? ''));
  return names;
}
