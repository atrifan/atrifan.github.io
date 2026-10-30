import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { chatNavOf, openChatNav } from '../support/chat-attach-fixture';

type Entry = {
  kind: string;
  deviceId?: string;
  request?: {
    requestId: string;
    op: { kind?: string; commandId?: string; command?: { kind?: string; loopId?: string; text?: string }; [key: string]: unknown };
  };
};
let caseId = '';

async function seed(request: APIRequestContext, value: unknown) {
  expect((await request.post('/__relay/scenario', { data: value })).status()).toBe(201);
}

async function entries(request: APIRequestContext): Promise<Entry[]> {
  const response = await request.get(`/__relay/requests?caseId=${caseId}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<Entry[]>;
}

async function published(request: APIRequestContext, kind: string, deviceId: string, commandKind?: string): Promise<Entry> {
  let found: Entry | undefined;
  await expect.poll(async () => {
    found = (await entries(request)).find((entry) => entry.kind === 'publish' && entry.deviceId === deviceId && entry.request?.op.kind === kind &&
      (!commandKind || entry.request.op.command?.kind === commandKind));
    return Boolean(found);
  }).toBe(true);
  return found!;
}

async function openSession(page: Page, title: string) {
  await openChatNav(page);
  await chatNavOf(page).getByRole('button', { name: title, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  caseId = randomUUID();
  await page.route((url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost', (route) => route.abort('blockedbyclient'));
  await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-test-case': caseId } }),
  );
});

test('a late Stop result cannot clear a newer command pending indicator', async ({ page, request }, testInfo) => {
  const pc = {
    id: randomUUID(), device_name: 'Final2 stale-result PC', status: 'online',
    last_seen_at: new Date().toISOString(), platform: 'synthetic', model: 'synthetic',
  };
  const session = {
    sessionId: randomUUID(), title: 'Final2 stale-result session', createdAt: new Date().toISOString(),
    lastActivity: Date.now(), state: 'running', surface: 'terminal', loopId: randomUUID(),
    capabilities: { watch: true, reply: true, answer: true, stop: true },
  };
  const snapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(),
    through: 0, stateVersion: randomUUID(), state: 'running', loopId: session.loopId, pending: null,
    messages: [], historyComplete: true, historyCursor: null,
    leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, { device: pc, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await page.goto(`/chat?device=${pc.id}`);
  await published(request, 'catalog.list', pc.id);
  await openSession(page, session.title);
  const attach = await published(request, 'watch.attach', pc.id);

  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const stop = await published(request, 'command', pc.id, 'stop');
  expect(stop.request!.op.command).toEqual({ kind: 'stop', loopId: session.loopId });
  await expect(page.getByText('Stopping…', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('stop-pending.png'), fullPage: false });

  const emit = async (logical: Record<string, unknown>) => {
    expect((await request.post('/__relay/emit', { data: { deviceId: pc.id, logical } })).ok()).toBe(true);
  };
  await emit({
    type: 'WATCH_EVENT', requestId: attach.request!.requestId, sessionId: session.sessionId,
    watchId: attach.request!.op.watchId, eventSeq: 1,
    change: { kind: 'state', stateVersion: randomUUID(), state: 'idle', loopId: null, pending: null },
  });
  await expect(page.getByText('Stopping…', { exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Message' }).fill('new idle reply');
  await page.getByRole('button', { name: 'Send' }).click();
  const reply = await published(request, 'command', pc.id, 'reply');
  expect(reply.request!.op.command).toEqual({ kind: 'reply', text: 'new idle reply' });
  await expect(page.getByText('Sent, awaiting assistant', { exact: true })).toBeVisible();

  await emit({
    type: 'COMMAND_RESULT', requestId: stop.request!.requestId, sessionId: session.sessionId,
    watchId: attach.request!.op.watchId, commandId: stop.request!.op.commandId, outcome: 'applied',
  });
  await emit({
    type: 'WATCH_EVENT', requestId: attach.request!.requestId, sessionId: session.sessionId,
    watchId: attach.request!.op.watchId, eventSeq: 2,
    change: { kind: 'message', message: { id: randomUUID(), position: 1, role: 'assistant', text: 'processed after stale result', streaming: false } },
  });
  await expect(page.getByText('processed after stale result', { exact: true })).toBeVisible();
  await expect(page.getByText('Sent, awaiting assistant', { exact: true })).toBeVisible();
  await emit({
    type: 'COMMAND_RESULT', requestId: reply.request!.requestId, sessionId: session.sessionId,
    watchId: attach.request!.op.watchId, commandId: reply.request!.op.commandId, outcome: 'applied',
  });
  await expect(page.getByText('Sent, awaiting assistant', { exact: true })).toHaveCount(0);
});

test('transcript follow survives programmatic scroll, pauses away from bottom, and resumes at bottom', async ({ page, request }, testInfo) => {
  const pc = {
    id: randomUUID(), device_name: 'Final2 scroll PC', status: 'online',
    last_seen_at: new Date().toISOString(), platform: 'synthetic', model: 'synthetic',
  };
  const session = {
    sessionId: randomUUID(), title: 'Final2 scroll session', createdAt: new Date().toISOString(),
    lastActivity: Date.now(), state: 'running', surface: 'terminal', loopId: randomUUID(),
    capabilities: { watch: true, reply: true, answer: true, stop: true },
  };
  const messages = Array.from({ length: 10 }, (_, index) => ({
    id: randomUUID(), position: index + 1, role: 'assistant',
    text: `Initial transcript ${index}: ${'synthetic paragraph '.repeat(160)}`, streaming: false,
  }));
  const tail = messages.at(-1)!;
  const snapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(),
    through: messages.length, stateVersion: randomUUID(), state: 'running', loopId: session.loopId, pending: null,
    messages, historyComplete: true, historyCursor: null,
    leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, { device: pc, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await page.goto(`/chat?device=${pc.id}`);
  await published(request, 'catalog.list', pc.id);
  await openSession(page, session.title);
  const attach = await published(request, 'watch.attach', pc.id);
  const log = page.getByRole('log', { name: 'Conversation' });
  const distance = () => log.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
  await expect.poll(distance).toBeLessThan(12);
  await page.waitForTimeout(100);
  await page.screenshot({ path: testInfo.outputPath('long-transcript.png'), fullPage: false });

  const emitMessage = async (eventSeq: number, suffix: string) => {
    expect((await request.post('/__relay/emit', { data: { deviceId: pc.id, logical: {
      type: 'WATCH_EVENT', requestId: attach.request!.requestId, sessionId: session.sessionId,
      watchId: attach.request!.op.watchId, eventSeq,
      change: { kind: 'message', message: { ...tail, text: `${tail.text}\n\n${suffix} ${'expanded detail '.repeat(500 * (eventSeq - 10))}` } },
    } } })).ok()).toBe(true);
    await expect(log.getByText(suffix, { exact: false })).toBeAttached();
  };

  await emitMessage(11, 'initial follow expansion');
  await expect.poll(distance).toBeLessThan(12);
  await log.hover();
  await page.mouse.wheel(0, -100000);
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeLessThan(10);
  await emitMessage(12, 'paused expansion');
  expect(await log.evaluate((element) => element.scrollTop)).toBeLessThan(20);

  await page.mouse.wheel(0, 100000);
  await expect.poll(distance).toBeLessThan(12);
  await emitMessage(13, 'resumed expansion');
  await expect.poll(distance).toBeLessThan(12);
});
