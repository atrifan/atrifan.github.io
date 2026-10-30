import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { chatNavOf, composerOf, conversationOf, headingOf, openChatNav } from '../support/chat-attach-fixture';

type Row = {
  sessionId: string;
  title: string;
  createdAt: string;
  lastActivity: number;
  state: 'running' | 'waiting' | 'idle';
  surface: string;
  capabilities: { watch: boolean; reply: boolean; answer: boolean; stop: boolean };
  loopId?: string;
};
type Scenario = {
  device: { id: string; device_name: string; status: 'online' | 'offline'; last_seen_at: string | null; platform: string; model: string };
  rows: Row[];
  history?: Record<string, Array<Record<string, unknown>>>;
  snapshots?: Record<string, Record<string, unknown>>;
  catalogPages?: Record<string, Record<string, unknown>>;
  holdAck?: string[];
  helloError?: boolean;
};

const allCapabilities = { watch: true, reply: true, answer: true, stop: true };
let caseId = '';
const externalRequests: string[] = [];

function device(name: string) {
  return {
    id: randomUUID(),
    device_name: name,
    status: 'online' as const,
    last_seen_at: '2026-10-30T09:00:00.000Z',
    platform: 'darwin',
    model: 'synthetic-assistant',
  };
}

function row(title: string, state: Row['state'] = 'idle', extra: Partial<Row> = {}): Row {
  return {
    sessionId: randomUUID(),
    title,
    createdAt: '2026-10-30T09:00:00.000Z',
    lastActivity: Date.parse('2026-10-30T09:00:00.000Z'),
    state,
    surface: 'terminal',
    capabilities: allCapabilities,
    ...extra,
  };
}

async function seed(request: APIRequestContext, scenario: Scenario): Promise<void> {
  const response = await request.post('/__relay/scenario', { data: scenario });
  expect(response.status(), 'the loopback synthetic peer accepts a scenario').toBe(201);
}

async function entries(request: APIRequestContext): Promise<Array<Record<string, any>>> {
  const response = await request.get(`/__relay/requests?caseId=${encodeURIComponent(caseId)}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function waitForPublish(request: APIRequestContext, kind: string, deviceId?: string): Promise<Record<string, any>> {
  let found: Record<string, any> | undefined;
  await expect.poll(async () => {
    const all = await entries(request);
    found = all.find((entry) => entry.kind === 'publish' && (!deviceId || entry.deviceId === deviceId) && entry.request?.op?.kind === kind);
    const legacy = all.some((entry) => entry.kind === 'forbidden-legacy');
    return Boolean(found || legacy);
  }, { timeout: 8_000, message: `ChatApp should publish v2 ${kind}` }).toBe(true);
  const legacy = (await entries(request)).filter((entry) => entry.kind === 'forbidden-legacy');
  expect(legacy, 'the mounted ChatApp must not fall back to durable legacy chat routes').toEqual([]);
  expect(found, `ChatApp should publish v2 ${kind} after READY`).toBeDefined();
  return found!;
}

async function openDevice(page: Page, deviceId: string): Promise<void> {
  await page.goto(`/chat?device=${encodeURIComponent(deviceId)}`);
}

async function openSession(page: Page, title: string): Promise<void> {
  await openChatNav(page);
  const nav = chatNavOf(page);
  await nav.getByRole('button', { name: title, exact: true }).click();
}

async function emit(request: APIRequestContext, deviceId: string, logical: Record<string, unknown>): Promise<void> {
  const response = await request.post('/__relay/emit', { data: { deviceId, logical } });
  expect(response.ok(), 'the synthetic peer should inject the frame into the open viewer stream').toBe(true);
}

async function assertNoDurableChatPayload(page: Page, sentinels: string[]): Promise<void> {
  const persisted = await page.evaluate(async () => {
    const writes = (window as any).__relayStorageWrites as string[];
    const values: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) values.push(`${key}=${localStorage.getItem(key)}`);
    }
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key) values.push(`${key}=${sessionStorage.getItem(key)}`);
    }
    return [...values, ...writes];
  });
  for (const sentinel of sentinels) {
    expect(persisted.join('\n'), `browser storage must not retain ${sentinel}`).not.toContain(sentinel);
  }
}

test.beforeEach(async ({ page }) => {
  caseId = randomUUID();
  externalRequests.length = 0;
  await page.addInitScript(() => {
    (window as any).__relayStorageWrites = [];
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      (window as any).__relayStorageWrites.push(`${key}=${value}`);
      return originalSetItem.call(this, key, value);
    };
    for (const method of ['add', 'put'] as const) {
      const prototype = IDBObjectStore.prototype as any;
      const original = prototype[method];
      prototype[method] = function (...args: any[]) {
        const [value] = args;
        try { (window as any).__relayStorageWrites.push(JSON.stringify(value)); } catch { /* test spy only */ }
        return original.apply(this, args);
      };
    }
  });
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
  expect(externalRequests, 'browser traffic must stay in the loopback fixture').toEqual([]);
  expect(ownEntries.filter((entry) => entry.kind === 'forbidden-legacy'), 'v2 UI must not call legacy durable chat routes').toEqual([]);
  expect(ownEntries.filter((entry) => entry.kind === 'unexpected-api'), 'unexpected APIs must be visible to the test').toEqual([]);
});

test('selected owned PC completes READY → hello → DEVICE_READY before on-demand catalog and excludes another device', async ({ page, request }) => {
  const selected = device('Synthetic PC A');
  const other = device('Synthetic PC B');
  const owned = row('PC A private title');
  const foreign = row('PC B must not appear');
  await seed(request, { device: selected, rows: [owned] });
  await seed(request, { device: other, rows: [foreign] });

  await openDevice(page, selected.id);
  const catalog = await waitForPublish(request, 'catalog.list', selected.id);
  const events = await entries(request);
  const ready = events.find((entry) => entry.kind === 'viewer-ready' && entry.deviceId === selected.id);
  const hello = events.find((entry) => entry.kind === 'publish' && entry.deviceId === selected.id && entry.request.op.kind === 'hello');
  const deviceReady = events.find((entry) => entry.kind === 'frame-part' && entry.deviceId === selected.id && entry.logicalType === 'DEVICE_READY');
  expect(ready?.order).toBeLessThan(hello?.order ?? 0);
  expect(hello?.order).toBeLessThan(deviceReady?.order ?? 0);
  expect(deviceReady?.order).toBeLessThan(catalog.order);
  expect(catalog.httpBody).toMatchObject({ protocol: 2, viewerToken: expect.any(String), request: { connectionId: expect.any(String), op: { kind: 'catalog.list', scope: 'history', cursor: null } } });

  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('button', { name: 'PC A private title', exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: 'PC B must not appear', exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('session')).toBe(false);
});

test('native read renders one atomic partial snapshot and cumulative live replacement without creating a session', async ({ page, request }) => {
  const selected = device('Snapshot PC');
  const session = row('Streaming build', 'running', { loopId: randomUUID() });
  const partial = { id: randomUUID(), position: 2, role: 'assistant', text: 'Compiling half', streaming: true };
  const snapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(), through: 6,
    stateVersion: randomUUID(), state: 'running', loopId: session.loopId, pending: null,
    messages: [{ id: randomUUID(), position: 1, role: 'user', text: 'Build the sample', streaming: false }, partial],
    historyComplete: true, historyCursor: null, leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, { device: selected, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openSession(page, session.title);
  const attach = await waitForPublish(request, 'watch.attach', selected.id);
  await expect(headingOf(page)).toHaveText(session.title);
  await expect(conversationOf(page).getByRole('article', { name: 'You' })).toContainText('Build the sample');
  const assistant = conversationOf(page).getByRole('article', { name: 'Assistant' });
  await expect(assistant).toHaveCount(1);
  await expect(assistant).toContainText('Compiling half');

  await emit(request, selected.id, {
    type: 'WATCH_EVENT', requestId: attach.request.requestId, sessionId: session.sessionId,
    watchId: attach.request.op.watchId, eventSeq: 7,
    change: { kind: 'message', message: { ...partial, text: 'Compiling the complete sample', streaming: false } },
  });
  await expect(assistant).toContainText('Compiling the complete sample');
  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' })).toHaveCount(1);
  const published = (await entries(request)).filter((entry) => entry.kind === 'publish' && entry.deviceId === selected.id);
  expect(published.some((entry) => entry.request.op.kind === 'session.create')).toBe(false);
  expect(new URL(page.url()).searchParams.has('session')).toBe(false);
});

test('an immediate watch snapshot is rendered before broker HTTP 202 acknowledges the attach', async ({ page, request }) => {
  const selected = device('Barrier PC');
  const session = row('Snapshot before acknowledgement', 'idle');
  const snapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(), through: 0,
    stateVersion: randomUUID(), state: 'idle', loopId: null, pending: null,
    messages: [{ id: randomUUID(), position: 1, role: 'assistant', text: 'Visible before 202', streaming: false }],
    historyComplete: true, historyCursor: null, leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, { device: selected, rows: [session], snapshots: { [session.sessionId]: snapshot }, holdAck: ['watch.attach'] });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openSession(page, session.title);
  const attach = await waitForPublish(request, 'watch.attach', selected.id);
  await expect(conversationOf(page).getByText('Visible before 202', { exact: true })).toBeVisible();
  const current = await entries(request);
  expect(current.some((entry) => entry.kind === 'ack' && entry.requestId === attach.request.requestId)).toBe(false);
  await request.post('/__relay/release', { data: { requestId: attach.request.requestId } });
  await expect.poll(async () => (await entries(request)).some((entry) => entry.kind === 'ack' && entry.requestId === attach.request.requestId)).toBe(true);
});

test('running reply targets the current watch and remains non-optimistic until a PC result arrives', async ({ page, request }) => {
  const selected = device('Command PC');
  const session = row('Running task', 'running', { loopId: randomUUID() });
  const snapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(), through: 1,
    stateVersion: randomUUID(), state: 'running', loopId: session.loopId, pending: null, messages: [],
    historyComplete: true, historyCursor: null, leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, { device: selected, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openSession(page, session.title);
  const attach = await waitForPublish(request, 'watch.attach', selected.id);
  await expect(composerOf(page)).toBeEnabled();
  const sentinel = `synthetic-only reply ${randomUUID()}`;
  await composerOf(page).fill(sentinel);
  await composerOf(page).press('Enter');
  const command = await waitForPublish(request, 'command', selected.id);
  expect(command.httpBody).toMatchObject({
    protocol: 2,
    viewerToken: expect.any(String),
    request: {
      connectionId: expect.any(String),
      op: {
        kind: 'command', sessionId: session.sessionId, watchId: attach.request.op.watchId,
        stateVersion: snapshot.stateVersion, command: { kind: 'reply', text: sentinel },
      },
    },
  });
  await expect(conversationOf(page).getByText(sentinel, { exact: true })).toHaveCount(0);
  await assertNoDurableChatPayload(page, [sentinel, session.title]);

  await emit(request, selected.id, {
    type: 'COMMAND_RESULT', requestId: command.request.requestId, sessionId: session.sessionId,
    watchId: attach.request.op.watchId, commandId: command.request.op.commandId, outcome: 'applied',
  });
  await assertNoDurableChatPayload(page, [sentinel, session.title]);
});

test('approval response preserves the pending request target and does not become an executed result at HTTP 202', async ({ page, request }) => {
  const selected = device('Approval PC');
  const session = row('Approval task', 'waiting');
  const approvalId = randomUUID();
  const snapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(), through: 0,
    stateVersion: randomUUID(), state: 'waiting', loopId: null,
    pending: { requestId: approvalId, kind: 'approval', prompt: 'Apply the synthetic migration?' }, messages: [],
    historyComplete: true, historyCursor: null, leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, { device: selected, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openSession(page, session.title);
  const attach = await waitForPublish(request, 'watch.attach', selected.id);
  await expect(page.getByText('Apply the synthetic migration?')).toBeVisible();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  const command = await waitForPublish(request, 'command', selected.id);
  expect(command.request.op).toMatchObject({
    sessionId: session.sessionId,
    watchId: attach.request.op.watchId,
    stateVersion: snapshot.stateVersion,
    command: { kind: 'answer', requestId: approvalId, decision: 'approve' },
  });
  expect((await entries(request)).some((entry) => entry.kind === 'ack' && entry.requestId === command.request.requestId)).toBe(true);
  await expect(page.getByText('Idle', { exact: true })).toHaveCount(0);
});

test('New is explicit and the first reply uses the PC-created stable session alias', async ({ page, request }) => {
  const selected = device('Create PC');
  await seed(request, { device: selected, rows: [] });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openChatNav(page);
  await page.getByRole('button', { name: /new chat/i }).click();
  const created = await waitForPublish(request, 'session.create', selected.id);
  await expect.poll(async () => (await entries(request)).some((entry) => entry.kind === 'frame-part' && entry.requestId === created.request.requestId && entry.logicalType === 'CREATE_RESULT')).toBe(true);
  expect((await entries(request)).filter((entry) => entry.kind === 'publish' && entry.request.op.kind === 'command')).toEqual([]);

  const responseText = `first synthetic turn ${randomUUID()}`;
  await composerOf(page).fill(responseText);
  await composerOf(page).press('Enter');
  const command = await waitForPublish(request, 'command', selected.id);
  const createdResult = (await entries(request)).find((entry) => entry.kind === 'frame-part' && entry.requestId === created.request.requestId && entry.logicalType === 'CREATE_RESULT');
  expect(command.request.op.sessionId).toBe(createdResult?.logicalSessionId);
  expect(command.request.op.command).toEqual({ kind: 'reply', text: responseText });
  expect((await entries(request)).filter((entry) => entry.kind === 'publish' && entry.request.op.kind === 'session.create')).toHaveLength(1);
});

test('missing native HELLO is explicitly unavailable and never queues or falls back to legacy chat', async ({ page, request }) => {
  const selected = device('Offline PC');
  await seed(request, { device: { ...selected, status: 'offline', last_seen_at: null }, rows: [], helloError: true });
  await openDevice(page, selected.id);
  const hello = await waitForPublish(request, 'hello', selected.id);
  await expect(page.getByText(/offline|unavailable|not connected|could not|unable/i).first()).toBeVisible();
  await composerOf(page).fill(`must not queue ${randomUUID()}`);
  await composerOf(page).press('Enter');
  const all = await entries(request);
  expect(all.some((entry) => entry.kind === 'publish' && entry.deviceId === selected.id && entry.request.op.kind === 'command')).toBe(false);
  expect(all.some((entry) => entry.kind === 'publish' && entry.request.requestId !== hello.request.requestId && entry.request.op.kind === 'catalog.list')).toBe(false);
});

test('planned stream rotation restores a fresh read-only handshake without replaying the draft or a mutation', async ({ page, request }) => {
  const selected = device('Rotation PC');
  const session = row('Survives planned rotation', 'running', { loopId: randomUUID() });
  await seed(request, { device: selected, rows: [session] });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openSession(page, session.title);
  await waitForPublish(request, 'watch.attach', selected.id);
  const draft = `unsent draft ${randomUUID()}`;
  await composerOf(page).fill(draft);
  await request.post('/__relay/rotate', { data: { deviceId: selected.id } });
  await expect.poll(async () => (await entries(request)).filter((entry) => entry.kind === 'viewer-ready' && entry.deviceId === selected.id).length).toBeGreaterThan(1);
  await expect(composerOf(page)).toHaveValue(draft);
  const operations = (await entries(request)).filter((entry) => entry.kind === 'publish' && entry.deviceId === selected.id).map((entry) => entry.request.op.kind);
  expect(operations.filter((kind) => kind === 'command' || kind === 'session.create')).toEqual([]);
  await assertNoDurableChatPayload(page, [draft, session.title]);
});

test('late event for an old watch cannot project into the currently selected chat', async ({ page, request }) => {
  const selected = device('Watch isolation PC');
  const session = row('Current watch only', 'idle');
  const snapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(), through: 0,
    stateVersion: randomUUID(), state: 'idle', loopId: null, pending: null, messages: [], historyComplete: true,
    historyCursor: null, leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, { device: selected, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await openDevice(page, selected.id);
  await waitForPublish(request, 'catalog.list', selected.id);
  await openSession(page, session.title);
  const attach = await waitForPublish(request, 'watch.attach', selected.id);
  const leak = `foreign-watch payload ${randomUUID()}`;
  await emit(request, selected.id, {
    type: 'WATCH_EVENT', requestId: attach.request.requestId, sessionId: session.sessionId,
    watchId: randomUUID(), eventSeq: 1,
    change: { kind: 'message', message: { id: randomUUID(), position: 1, role: 'assistant', text: leak, streaming: false } },
  });
  await expect(conversationOf(page).getByText(leak, { exact: true })).toHaveCount(0);
  await expect(headingOf(page)).toHaveText(session.title);
});

test('history paging requests the next PC cursor on demand and shows the returned continuation', async ({ page, request }) => {
  const selected = device('Paging PC');
  const one = row('First stored session');
  const two = row('Second stored session');
  const three = row('Third stored session');
  await seed(request, {
    device: selected,
    rows: [one, two, three],
    catalogPages: {
      'history:': { sessions: [one, two], catalog: { version: 2, complete: false, nextCursor: 'synthetic-cursor-page-2' } },
      'history:synthetic-cursor-page-2': { sessions: [three], catalog: { version: 2, complete: true, nextCursor: null } },
    },
  });
  await openDevice(page, selected.id);
  const first = await waitForPublish(request, 'catalog.list', selected.id);
  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('button', { name: one.title, exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: two.title, exact: true })).toBeVisible();
  expect(first.request.op).toMatchObject({ scope: 'history', cursor: null, limit: expect.any(Number) });
  await page.getByRole('button', { name: 'Load more chats', exact: true }).click();
  let next: Record<string, any> | undefined;
  await expect.poll(async () => {
    const all = await entries(request);
    next = all.find((entry) => entry.kind === 'publish' && entry.deviceId === selected.id && entry.request.op.kind === 'catalog.list' && entry.request.op.cursor === 'synthetic-cursor-page-2');
    return Boolean(next);
  }).toBe(true);
  expect(next?.request.op).toMatchObject({ scope: 'history', cursor: 'synthetic-cursor-page-2' });
  await expect(chatNavOf(page).getByRole('button', { name: three.title, exact: true })).toBeVisible();
});
