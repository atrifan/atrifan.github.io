import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  chatNavOf,
  conversationOf,
  openChatNav,
  stopOf,
  switchDevice,
} from '../support/chat-attach-fixture';

type SessionState = 'running' | 'waiting' | 'idle';
type SessionRow = {
  sessionId: string;
  title: string;
  createdAt: string;
  lastActivity: number;
  state: SessionState;
  surface: string;
  capabilities: { watch: boolean; reply: boolean; answer: boolean; stop: boolean };
  loopId?: string;
};
type FixtureDevice = {
  id: string;
  device_name: string;
  status: 'online';
  last_seen_at: string;
  platform: string;
  model: string;
};
type Scenario = {
  device: FixtureDevice;
  rows: SessionRow[];
  snapshots?: Record<string, Record<string, unknown>>;
};
type RelayOperation = { kind?: string; [key: string]: unknown };
type RelayRequest = { requestId: string; op: RelayOperation };
type RelayEntry = { kind: string; deviceId?: string; request?: RelayRequest; httpBody?: unknown };

const allCapabilities = { watch: true, reply: true, answer: true, stop: true };
let caseId = '';
const externalRequests: string[] = [];

function device(name: string): FixtureDevice {
  return {
    id: randomUUID(),
    device_name: name,
    status: 'online',
    last_seen_at: '2026-10-30T09:00:00.000Z',
    platform: 'darwin',
    model: 'synthetic-assistant',
  };
}

function row(title: string, state: SessionState, loopId?: string): SessionRow {
  return {
    sessionId: randomUUID(),
    title,
    createdAt: '2026-10-30T09:00:00.000Z',
    lastActivity: Date.parse('2026-10-30T09:00:00.000Z'),
    state,
    surface: 'terminal',
    capabilities: allCapabilities,
    ...(loopId ? { loopId } : {}),
  };
}

async function seed(request: APIRequestContext, scenario: Scenario): Promise<void> {
  const response = await request.post('/__relay/scenario', { data: scenario });
  expect(response.status()).toBe(201);
}

async function entries(request: APIRequestContext): Promise<RelayEntry[]> {
  const response = await request.get(`/__relay/requests?caseId=${encodeURIComponent(caseId)}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<RelayEntry[]>;
}

async function waitForPublish(request: APIRequestContext, kind: string, deviceId?: string): Promise<RelayEntry> {
  let found: RelayEntry | undefined;
  await expect.poll(async () => {
    found = (await entries(request)).find((entry) =>
      entry.kind === 'publish' && (!deviceId || entry.deviceId === deviceId) && entry.request?.op.kind === kind,
    );
    return Boolean(found);
  }, { timeout: 8_000, message: `ChatApp should publish v2 ${kind}` }).toBe(true);
  return found!;
}

async function openDevice(page: Page, deviceId: string): Promise<void> {
  await page.goto(`/chat?device=${encodeURIComponent(deviceId)}`);
}

async function openSession(page: Page, title: string): Promise<void> {
  await openChatNav(page);
  await chatNavOf(page).getByRole('button', { name: title, exact: true }).click();
}

async function emit(request: APIRequestContext, deviceId: string, logical: Record<string, unknown>): Promise<void> {
  const response = await request.post('/__relay/emit', { data: { deviceId, logical } });
  expect(response.ok()).toBe(true);
}

test.beforeEach(async ({ page }) => {
  caseId = randomUUID();
  externalRequests.length = 0;
  await page.route((url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost', (route) => {
    externalRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-test-case': caseId } }),
  );
});

test.afterEach(async ({ request }) => {
  const ownEntries = await entries(request);
  expect(externalRequests, 'browser network stays in the loopback synthetic fixture').toEqual([]);
  expect(ownEntries.filter((entry) => entry.kind === 'forbidden-legacy'), 'v2 UI never falls back to durable legacy chat routes').toEqual([]);
  expect(ownEntries.filter((entry) => entry.kind === 'unexpected-api')).toEqual([]);
});

test('Active and History switch by keyboard and show the correct state-scoped rows in the responsive Chats menu', async ({ page, request }) => {
  const selected = device('Tabs PC');
  const running = row('Active running synthetic row', 'running', randomUUID());
  const waiting = row('Active waiting synthetic row', 'waiting');
  const idle = row('History idle synthetic row', 'idle');
  await seed(request, { device: selected, rows: [running, waiting, idle] });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openChatNav(page);

  const activeTab = page.getByRole('tab', { name: /^Active \(\d+\)$/ });
  const historyTab = page.getByRole('tab', { name: 'History', exact: true });
  await expect(page.getByRole('tablist').getByRole('tab')).toHaveCount(2);
  await expect(historyTab).toHaveAttribute('aria-selected', 'true');
  await historyTab.focus();
  await historyTab.press('ArrowLeft');
  await expect(activeTab).toBeFocused();
  await expect(activeTab).toHaveAttribute('aria-selected', 'true');
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByText(running.title, { exact: true })).toBeVisible();
  await expect(panel.getByText(waiting.title, { exact: true })).toBeVisible();
  await expect(panel.getByText(idle.title, { exact: true })).toHaveCount(0);

  await activeTab.press('ArrowRight');
  await expect(historyTab).toBeFocused();
  await expect(historyTab).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('button', { name: idle.title, exact: true })).toBeVisible();
});

test('Stop targets the current session, watch, loop and state; UI waits for the PC result and idle event', async ({ page, request }) => {
  const selected = device('Stop PC');
  const loopId = randomUUID();
  const session = row('Running stop target', 'running', loopId);
  const stateVersion = randomUUID();
  const through = 8;
  const snapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(), through,
    stateVersion, state: 'running', loopId, pending: null, messages: [], historyComplete: true, historyCursor: null,
    leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, { device: selected, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openSession(page, session.title);
  const attach = await waitForPublish(request, 'watch.attach', selected.id);
  await expect(stopOf(page)).toBeEnabled();
  await stopOf(page).click();
  const command = await waitForPublish(request, 'command', selected.id);
  expect(command.request?.op).toMatchObject({
    kind: 'command',
    sessionId: session.sessionId,
    watchId: attach.request?.op.watchId,
    stateVersion,
    command: { kind: 'stop', loopId },
  });
  await expect(page.getByText('Stopping…', { exact: true })).toBeVisible();
  await expect(page.getByText('Idle', { exact: true })).toHaveCount(0);
  const commandId = command.request?.op.commandId;
  expect(typeof commandId).toBe('string');
  await emit(request, selected.id, {
    type: 'COMMAND_RESULT', requestId: command.request!.requestId,
    sessionId: session.sessionId, watchId: attach.request!.op.watchId, commandId, outcome: 'applied',
  });
  await expect(page.getByText('Idle', { exact: true })).toHaveCount(0);
  await emit(request, selected.id, {
    type: 'WATCH_EVENT', requestId: attach.request!.requestId, sessionId: session.sessionId,
    watchId: attach.request!.op.watchId, eventSeq: through + 1,
    change: { kind: 'state', stateVersion: randomUUID(), state: 'idle', loopId: null, pending: null },
  });
  await expect(page.getByText('Idle', { exact: true })).toBeVisible();
  expect((await entries(request)).filter((entry) => entry.kind === 'publish' && entry.request?.op.kind === 'command')).toHaveLength(1);
});

test('native history exposes no rename or delete mutation actions', async ({ page, request }) => {
  const selected = device('Read-only native PC');
  const session = row('Read-only imported session', 'idle');
  await seed(request, { device: selected, rows: [session] });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openChatNav(page);
  const nav = chatNavOf(page);
  await expect(nav.getByRole('button', { name: session.title, exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: `Rename chat ${session.title}` })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: `Delete chat ${session.title}` })).toHaveCount(0);
  const operations = (await entries(request))
    .filter((entry) => entry.kind === 'publish')
    .map((entry) => entry.request?.op.kind);
  expect(operations.some((kind) => kind === 'rename' || kind === 'delete')).toBe(false);
});

test('long title and multi-paragraph transcript wrap, follow the newest cumulative message and remain horizontally contained', async ({ page, request }) => {
  const selected = device('Long transcript PC');
  const longTitle = 'Synthetic long native title — '.repeat(7).trim();
  const session = row(longTitle, 'running', randomUUID());
  const messages = Array.from({ length: 18 }, (_, index) => ({
    id: randomUUID(),
    position: index + 1,
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: `Paragraph ${index + 1}: ${'synthetic text wraps within the conversation panel. '.repeat(12)}\n\nSecond paragraph ${index + 1}: ${'more synthetic detail, no provider data. '.repeat(10)}`,
    streaming: false,
  }));
  const tail = { ...messages.at(-1)!, role: 'assistant', streaming: true, text: `${messages.at(-1)!.text}\n\nFinal answer is streaming` };
  messages[messages.length - 1] = tail;
  const snapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(), through: 18,
    stateVersion: randomUUID(), state: 'running', loopId: session.loopId ?? null, pending: null, messages,
    historyComplete: true, historyCursor: null, leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, { device: selected, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openSession(page, session.title);
  const attach = await waitForPublish(request, 'watch.attach', selected.id);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(longTitle);
  const finalText = `${tail.text}\n\nThe cumulative answer is complete`;
  await emit(request, selected.id, {
    type: 'WATCH_EVENT', requestId: attach.request!.requestId, sessionId: session.sessionId,
    watchId: attach.request!.op.watchId, eventSeq: 19,
    change: { kind: 'message', message: { ...tail, text: finalText, streaming: false } },
  });
  const log = conversationOf(page);
  const latest = log.getByRole('article', { name: 'Assistant' }).last();
  await expect(latest).toContainText('The cumulative answer is complete');
  await expect(latest).toBeInViewport();
  const geometry = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  const scroll = await log.evaluate((element) => ({
    top: element.scrollTop,
    height: element.scrollHeight,
    viewport: element.clientHeight,
  }));
  expect(scroll.height).toBeGreaterThan(scroll.viewport);
  expect(scroll.top + scroll.viewport).toBeGreaterThanOrEqual(scroll.height - 12);
});

test('after switching PCs, the new catalog and watch reject a result for the prior PC session', async ({ page, request }) => {
  const firstDevice = device(`Switch source A ${randomUUID()}`);
  const secondDevice = device(`Switch target B ${randomUUID()}`);
  const firstSession = row('PC A private session', 'running', randomUUID());
  const secondSession = row('PC B selected session', 'running', randomUUID());
  await seed(request, { device: firstDevice, rows: [firstSession] });
  await seed(request, { device: secondDevice, rows: [secondSession] });

  await openDevice(page, firstDevice.id);
  await waitForPublish(request, 'catalog.list', firstDevice.id);
  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('button', { name: firstSession.title, exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: secondSession.title, exact: true })).toHaveCount(0);
  await openSession(page, firstSession.title);
  await waitForPublish(request, 'watch.attach', firstDevice.id);

  await switchDevice(page, secondDevice);
  await waitForPublish(request, 'catalog.list', secondDevice.id);
  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('button', { name: secondSession.title, exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: firstSession.title, exact: true })).toHaveCount(0);
  await openSession(page, secondSession.title);
  const targetAttach = await waitForPublish(request, 'watch.attach', secondDevice.id);
  const foreignText = `foreign PC frame ${randomUUID()}`;
  await emit(request, secondDevice.id, {
    type: 'WATCH_EVENT', requestId: targetAttach.request!.requestId,
    sessionId: firstSession.sessionId, watchId: targetAttach.request!.op.watchId, eventSeq: 1,
    change: { kind: 'message', message: { id: randomUUID(), position: 1, role: 'assistant', text: foreignText, streaming: false } },
  });
  await expect(conversationOf(page).getByText(foreignText, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(secondSession.title);
});
