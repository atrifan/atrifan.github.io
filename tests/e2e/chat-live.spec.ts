/**
 * LIVE remote chat round trip: the real assistant extension + native host, paired
 * with a device key for the E2E customer, driven from a phone-sized /chat page.
 *
 * Opt-in (CHAT_LIVE=1); it needs a local build of the assistant. Setup, all in a
 * scratch dir (CHAT_LIVE_DIR, default /tmp/tulzo-chat-ext):
 *   - $CHAT_LIVE_DIR/plugin/dist: the extension, built with the assistant's own
 *     `npm run build` from a copy of assistant/plugin, with `http://localhost/*`
 *     added to the control-plane bridge matches in that copy's manifest only;
 *   - ASSISTANT_REPO (default ../assistant) with native-host/dist built.
 * The spec then:
 *   1. creates a device key through /api/keys/generate as the customer;
 *   2. starts a stub OpenAI-compatible model on 127.0.0.1 (no LLM key needed):
 *      it answers "Hello from the stub model" and, when asked to delete the
 *      workflow, calls execute_action DELETE_WORKFLOW (always needs approval);
 *   3. runs an isolated native host daemon (own HOME, HORIA_DATA_DIR and socket),
 *      seeded with control-plane.json (verify endpoint = this dev server) and the
 *      stub provider, with enableRemoteChat on;
 *   4. loads the extension in a persistent Chromium whose NativeMessagingHosts
 *      points at the isolated host;
 *   5. on a 390x844 page sends a message, watches the reply stream back, and does
 *      one approval round trip.
 */
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { chromium, type BrowserContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { test, expect, chatEnvReady } from '../fixtures/chat-page';
import { assistantRepo } from '../support/assistant-protocol';
import { blockThirdParty } from './surface-helpers';

const LIVE = process.env.CHAT_LIVE === '1';
const DIR = process.env.CHAT_LIVE_DIR || '/tmp/tulzo-chat-ext';
const EXT = path.join(DIR, 'plugin', 'dist');
const REPO = assistantRepo();

function db() {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ── A stub OpenAI-compatible model (SSE chat completions) ─────────────────────
interface StubRequest {
  messages?: Array<{ role: string; content?: unknown; tool_calls?: unknown }>;
  tools?: unknown[];
}
const sse = (chunks: unknown[]) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
const textAnswer = (text: string) =>
  sse([
    { choices: [{ delta: { content: text } }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 6 } },
  ]);

function startStubModel(): Promise<{ base: string; seen: StubRequest[]; close: () => Promise<void> }> {
  const seen: StubRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url?.endsWith('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'stub-1' }] }));
        return;
      }
      const body = (raw ? JSON.parse(raw) : {}) as StubRequest;
      seen.push(body);
      const msgs = body.messages ?? [];
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
      const userText = JSON.stringify(lastUser?.content ?? '');
      const toolDone = msgs.some((m) => m.role === 'tool');
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (body.tools?.length && /delete the workflow/i.test(userText) && !toolDone) {
        res.end(
          sse([
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      { index: 0, id: 'call_del', function: { name: 'execute_action', arguments: JSON.stringify({ type: 'DELETE_WORKFLOW', id: 'wf-e2e' }) } },
                    ],
                  },
                },
              ],
            },
            { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 20, completion_tokens: 5 } },
          ]),
        );
        return;
      }
      res.end(textAnswer(toolDone ? 'The workflow step is finished.' : 'Hello from the stub model'));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ base: `http://127.0.0.1:${port}/v1`, seen, close: () => new Promise((r) => server.close(() => r())) });
    }),
  );
}

// ── The isolated native host ──────────────────────────────────────────────────
async function socketRequest(sockPath: string, frame: Record<string, unknown>): Promise<unknown> {
  const sock = await new Promise<net.Socket>((res, rej) => {
    const s = net.createConnection(sockPath);
    s.once('connect', () => res(s));
    s.once('error', rej);
  });
  return new Promise((resolve, reject) => {
    const id = `live-${Date.now()}`;
    let buf = '';
    const t = setTimeout(() => (sock.destroy(), reject(new Error(`no reply to ${String(frame.type)}`))), 15_000);
    sock.on('data', (d) => {
      buf += d.toString();
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          const e = JSON.parse(line);
          if (e.id === id) {
            clearTimeout(t);
            sock.destroy();
            resolve(e);
          }
        } catch {
          /* not a reply */
        }
      }
    });
    sock.write(JSON.stringify({ ...frame, id }) + '\n');
  });
}

async function waitForSocket(sockPath: string, ms = 60_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((res) => {
      const s = net.createConnection(sockPath);
      s.once('connect', () => (s.destroy(), res(true)));
      s.once('error', () => res(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('native host socket never came up');
}

test.describe('live remote chat: real extension + native host', () => {
  test.skip(!LIVE, 'opt-in: CHAT_LIVE=1 (see the header for the setup)');
  test.skip(!chatEnvReady() || !REPO || !fs.existsSync(path.join(EXT, 'manifest.json')), 'needs the env, ASSISTANT_REPO and the built extension');
  test.setTimeout(300_000);

  let daemon: ChildProcess | undefined;
  let ext: BrowserContext | undefined;
  let stub: Awaited<ReturnType<typeof startStubModel>> | undefined;
  let apiKeyId: string | undefined;
  const run = path.join(DIR, `run-${Date.now()}`);

  test.afterAll(async () => {
    await ext?.close().catch(() => {});
    if (daemon && daemon.exitCode === null) {
      daemon.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 1500));
      if (daemon.exitCode === null) daemon.kill('SIGKILL');
    }
    await stub?.close();
    if (apiKeyId) {
      await db().from('device_heartbeats').delete().eq('api_key_id', apiKeyId);
      await db().from('api_keys').delete().eq('id', apiKeyId);
    }
  });

  test('phone sends a message, the reply streams back, and an approval round-trips', async ({ page, baseURL }) => {
    // 1. A device key for the customer, made the way the control panel makes one.
    await blockThirdParty(page);
    await page.goto('/');
    const gen = await page.request.post('/api/keys/generate', { data: { device_name: `live-${Date.now() % 100000}` } });
    expect(gen.status(), await gen.text()).toBe(200);
    const key = (await gen.json()) as { apiKey: string; apiKeyId: string; plan: string; deviceName: string };
    apiKeyId = key.apiKeyId;
    if (key.plan === 'free') {
      // The E2E customer is on the free plan; device chat routes need a paid key.
      await db().from('api_keys').update({ plan: 'pro' }).eq('id', key.apiKeyId);
    }

    // 2. Stub model.
    stub = await startStubModel();

    // 3. Isolated native host.
    const dataDir = path.join(run, 'data');
    const home = path.join(run, 'home');
    const sockPath = path.join(run, 'host.sock');
    fs.mkdirSync(path.join(dataDir, 'config'), { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, 'config', 'control-plane.json'),
      JSON.stringify({
        enabled: true,
        api_key: key.apiKey,
        verify_api_key: true,
        // Not verified yet: the host lets requests through and verifies against /api/verify in the background.
        last_verified_status: 'pending',
        verify_endpoint: `${baseURL}/api/verify`,
        domains: ['localhost'],
        device_name: key.deviceName,
      }),
    );
    fs.writeFileSync(
      path.join(dataDir, 'config', 'llm-providers.json'),
      JSON.stringify({
        activeProvider: 'stub',
        providers: { stub: { type: 'openai', apiKey: 'stub-key', baseUrl: stub.base, models: { orchestrator: 'stub-1', coding: 'stub-1', profile: 'stub-1', skills: 'stub-1', title: 'stub-1' } } },
      }),
    );
    const env = {
      ...process.env,
      HOME: home,
      HORIA_DATA_DIR: dataDir,
      HORIA_CLI_SOCKET: sockPath,
      HORIA_DISABLE_EMBEDDINGS: '1',
      HORIA_DISABLE_DOCS_SITE: '1',
      HORIA_DISABLE_REMOTE_MCP: '1',
    };
    const hostLog = fs.openSync(path.join(run, 'host.log'), 'a');
    daemon = spawn(process.execPath, [path.join(REPO!, 'native-host/dist/index.js'), '--serve'], { env, stdio: ['ignore', hostLog, hostLog] });
    await waitForSocket(sockPath);
    const safety = await socketRequest(sockPath, { type: 'SET_SAFETY', config: { enableRemoteChat: true } });
    expect(safety).toBeTruthy();

    // 4. The extension, with a native-messaging host entry for the isolated host.
    const userData = path.join(run, 'chromium');
    const wrapper = path.join(run, 'host.sh');
    fs.writeFileSync(
      wrapper,
      [
        '#!/bin/bash',
        ...Object.entries({ HOME: home, HORIA_DATA_DIR: dataDir, HORIA_CLI_SOCKET: sockPath, HORIA_DISABLE_EMBEDDINGS: '1' }).map(([k, v]) => `export ${k}="${v}"`),
        `exec "${process.execPath}" "${path.join(REPO!, 'native-host/dist/relay.js')}" "$@" 2>>"${path.join(run, 'relay.log')}"`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    const launch = () =>
      chromium.launchPersistentContext(userData, {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
      });
    ext = await launch();
    const sw = ext.serviceWorkers()[0] ?? (await ext.waitForEvent('serviceworker'));
    const extId = new URL(sw.url()).host;
    const hostsDir = path.join(userData, 'NativeMessagingHosts');
    fs.mkdirSync(hostsDir, { recursive: true });
    fs.writeFileSync(
      path.join(hostsDir, 'com.assistant.host.json'),
      JSON.stringify({ name: 'com.assistant.host', description: 'isolated host', path: wrapper, type: 'stdio', allowed_origins: [`chrome-extension://${extId}/`] }),
    );
    await ext.close();
    ext = await launch(); // the host entry is read at startup

    // The device polls the relay once the worker syncs its control-plane config.
    await expect
      .poll(
        async () => {
          const { data } = await db().from('device_heartbeats').select('updated_at').eq('api_key_id', key.apiKeyId).maybeSingle();
          return !!data;
        },
        { timeout: 90_000, message: 'the device never reached /api/plugin/chat/poll or /api/plugin/report' },
      )
      .toBe(true);

    // 5. The phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/chat?device=${key.apiKeyId}`);
    await expect(page.getByRole('status').filter({ hasText: 'Your assistant is online' })).toBeVisible({ timeout: 30_000 });
    const composer = page.getByRole('textbox', { name: 'Message' });
    await composer.fill('Hi there, are you awake?');
    await composer.press('Enter');
    const log = page.getByRole('log', { name: 'Conversation' });
    await expect(log.getByRole('article', { name: 'Assistant' }).last()).toContainText('Hello from the stub model', { timeout: 90_000 });
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible({ timeout: 30_000 });

    await composer.fill('Please delete the workflow wf-e2e');
    await composer.press('Enter');
    const approval = page.getByRole('region', { name: 'Approval needed' });
    await expect(approval).toBeVisible({ timeout: 90_000 });
    await expect(approval).toContainText('DELETE_WORKFLOW');
    await approval.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(approval).toHaveCount(0);
    await expect(log).toContainText('Approved');
    await expect(log.getByRole('article', { name: 'Assistant' }).last()).toContainText('The workflow step is finished', { timeout: 90_000 });
    expect(stub.seen.some((r) => JSON.stringify(r.messages ?? []).includes('"role":"tool"'))).toBe(true);

    // What crossed the relay, per direction and frame type (the device's own frames).
    const sessionId = new URL(page.url()).searchParams.get('session')!;
    const tallyFrames = async () => {
      const { data: rows } = await db().from('chat_relay_frames').select('direction, frame').eq('session_id', sessionId).order('seq');
      const t: Record<string, number> = {};
      for (const r of (rows as Array<{ direction: string; frame: { type: string } }>) ?? []) {
        const k = `${r.direction}:${r.frame.type}`;
        t[k] = (t[k] ?? 0) + 1;
      }
      return t;
    };
    // The answer streams before the turn's terminal frame: wait for both turns to end.
    await expect.poll(async () => (await tallyFrames())['to_page:STREAM_DONE'] ?? 0, { timeout: 60_000 }).toBe(2);
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    const tally = await tallyFrames();
    test.info().annotations.push({ type: 'relay frames', description: JSON.stringify(tally) });
    expect(tally['to_page:STREAM_CHUNK'] ?? 0).toBeGreaterThan(0);
    expect(tally['to_page:ACTION_APPROVAL_REQUEST']).toBe(1);
    expect(tally['to_device:ACTION_APPROVAL_RESPONSE']).toBe(1);
    expect(tally['to_page:STREAM_DONE']).toBe(2);
  });
});
