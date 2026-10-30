import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { chatNavOf, conversationOf, openChatNav } from '../support/chat-attach-fixture';

type Entry = { kind: string; deviceId?: string; requestId?: string; request?: { requestId: string; op: { kind: string; watchId?: string } } };
const device = (name: string) => ({ id: randomUUID(), device_name: name, status: 'online', last_seen_at: new Date().toISOString(), platform: 'darwin', model: 'synthetic' });
const row = (title: string) => ({ sessionId: randomUUID(), title, createdAt: new Date().toISOString(), lastActivity: Date.now(), state: 'running', surface: 'terminal', loopId: randomUUID(), capabilities: { watch: true, reply: true, answer: true, stop: true } });

async function seed(request: APIRequestContext, value: unknown) {
  expect((await request.post('/__relay/scenario', { data: value })).status()).toBe(201);
}
async function entries(request: APIRequestContext, caseId: string): Promise<Entry[]> {
  const response = await request.get(`/__relay/requests?caseId=${caseId}`);
  return response.json() as Promise<Entry[]>;
}
async function published(request: APIRequestContext, caseId: string, deviceId: string, kind: string): Promise<Entry> {
  let found: Entry | undefined;
  await expect.poll(async () => {
    found = (await entries(request, caseId)).find((entry) => entry.deviceId === deviceId && entry.kind === 'publish' && entry.request?.op.kind === kind);
    return !!found;
  }).toBe(true);
  return found!;
}

test('following pauses when the reader scrolls up and resumes when the reader returns to the bottom', async ({ page, request }) => {
  const caseId = randomUUID();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.continue({ headers: { ...route.request().headers(), 'x-test-case': caseId } }));
  const pc = device('Follow regression PC'); const session = row('Follow regression');
  const messages = Array.from({ length: 14 }, (_, index) => ({ id: randomUUID(), position: index, role: 'assistant', text: `Synthetic message ${index}: ${'detail '.repeat(130)}`, streaming: false }));
  const tail = messages[messages.length - 1];
  const snapshot = { type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(), through: 0, stateVersion: randomUUID(), state: 'running', loopId: session.loopId, pending: null, messages, historyComplete: true, historyCursor: null, leaseExpiresAt: new Date(Date.now() + 15000).toISOString() };
  await seed(request, { device: pc, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await page.goto(`/chat?device=${pc.id}`);
  await published(request, caseId, pc.id, 'catalog.list');
  await openChatNav(page);
  await chatNavOf(page).getByRole('button', { name: session.title }).click();
  const attach = await published(request, caseId, pc.id, 'watch.attach');
  const log = conversationOf(page);
  await expect(log.getByText('Synthetic message 13:', { exact: false })).toBeVisible();
  const distance = () => log.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
  await expect.poll(distance).toBeLessThan(12);
  await log.hover();
  await page.mouse.wheel(0, -100000);
  await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBeLessThan(10);
  const send = async (seq: number, suffix: string) => {
    expect((await request.post('/__relay/emit', { data: { deviceId: pc.id, logical: { type: 'WATCH_EVENT', requestId: attach.request!.requestId, sessionId: session.sessionId, watchId: attach.request!.op.watchId, eventSeq: seq, change: { kind: 'message', message: { ...tail, text: `${tail.text} ${suffix}` } } } } })).ok()).toBe(true);
    await expect(log.getByText(suffix, { exact: false })).toBeAttached();
  };
  await send(1, 'paused synthetic update');
  expect(await log.evaluate((element) => element.scrollTop)).toBeLessThan(20);
  await page.mouse.wheel(0, 100000);
  await expect.poll(distance).toBeLessThan(12);
  await send(2, 'following synthetic update');
  await expect.poll(distance).toBeLessThan(12);
});

test('switches by device identity even when two owned devices share the same name', async ({ page, request }) => {
  const caseId = randomUUID();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.continue({ headers: { ...route.request().headers(), 'x-test-case': caseId } }));
  const first = device('Duplicate synthetic PC'); const second = device('Duplicate synthetic PC');
  const a = row('Source synthetic session'); const b = row('Target synthetic session');
  await seed(request, { device: first, rows: [a] }); await seed(request, { device: second, rows: [b] });
  await page.goto(`/chat?device=${first.id}`);
  await published(request, caseId, first.id, 'catalog.list');
  await openChatNav(page);
  await chatNavOf(page).getByRole('button', { name: a.title }).click();
  await published(request, caseId, first.id, 'watch.attach');
  await openChatNav(page);
  await page.getByRole('combobox', { name: 'Assistant' }).selectOption(second.id);
  await published(request, caseId, second.id, 'catalog.list');
  await expect(chatNavOf(page).getByRole('button', { name: b.title })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: a.title })).toHaveCount(0);
  await chatNavOf(page).getByRole('button', { name: b.title }).click();
  await published(request, caseId, second.id, 'watch.attach');
});

test('long cumulative update keeps an initially following reader at the bottom', async ({ page, request }) => {
  const caseId = randomUUID();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.continue({ headers: { ...route.request().headers(), 'x-test-case': caseId } }));
  const pc = device('Long follow regression PC'); const session = row('Long follow regression');
  const messages = Array.from({ length: 18 }, (_, index) => ({ id: randomUUID(), position: index, role: index % 2 ? 'assistant' : 'user', text: `Paragraph ${index}: ${'synthetic text wraps within the conversation panel. '.repeat(12)}\n\nSecond paragraph: ${'more synthetic detail. '.repeat(10)}`, streaming: false }));
  const tail = messages[messages.length - 1];
  const snapshot = { type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: session.sessionId, watchId: randomUUID(), through: 18, stateVersion: randomUUID(), state: 'running', loopId: session.loopId, pending: null, messages, historyComplete: true, historyCursor: null, leaseExpiresAt: new Date(Date.now() + 15000).toISOString() };
  await seed(request, { device: pc, rows: [session], snapshots: { [session.sessionId]: snapshot } });
  await page.goto(`/chat?device=${pc.id}`);
  await published(request, caseId, pc.id, 'catalog.list');
  await openChatNav(page);
  await chatNavOf(page).getByRole('button', { name: session.title }).click();
  const attach = await published(request, caseId, pc.id, 'watch.attach');
  const log = conversationOf(page);
  await expect(log.getByRole('article')).toHaveCount(18);
  const geometry = () => log.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight, viewport: element.clientHeight }));
  const before = await geometry();
  expect(before.height).toBeGreaterThan(before.viewport);
  expect(before.height - before.top - before.viewport).toBeLessThan(12);
  expect((await request.post('/__relay/emit', { data: { deviceId: pc.id, logical: { type: 'WATCH_EVENT', requestId: attach.request!.requestId, sessionId: session.sessionId, watchId: attach.request!.op.watchId, eventSeq: 19, change: { kind: 'message', message: { ...tail, text: `${tail.text} final synthetic addition` } } } } })).ok()).toBe(true);
  await expect(log.getByText('final synthetic addition', { exact: false })).toBeAttached();
  const after = await geometry();
  console.log('SYNTHETIC_SCROLL_GEOMETRY', { before, after });
  await expect.poll(async () => { const { top, height, viewport } = await geometry(); return height - top - viewport; }).toBeLessThan(12);
});

test('switch aborts the old device with an acknowledgement held and ignores a foreign session event', async ({ page, request }) => {
  const caseId = randomUUID();
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => route.continue({ headers: { ...route.request().headers(), 'x-test-case': caseId } }));
  const first = device('Barrier source PC'); const second = device('Barrier destination PC');
  const a = row('Barrier source session'); const b = row('Barrier destination session');
  await seed(request, { device: first, rows: [a], holdAck: ['catalog.list'] });
  await seed(request, { device: second, rows: [b] });
  await page.goto(`/chat?device=${first.id}`);
  const held = await published(request, caseId, first.id, 'catalog.list');
  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('button', { name: a.title })).toBeVisible();
  expect((await entries(request, caseId)).some((entry) => entry.kind === 'ack' && entry.requestId === held.request?.requestId)).toBe(false);
  await chatNavOf(page).getByRole('button', { name: a.title }).click();
  await published(request, caseId, first.id, 'watch.attach');
  await openChatNav(page);
  await page.getByRole('combobox', { name: 'Assistant' }).selectOption(second.id);
  await published(request, caseId, second.id, 'catalog.list');
  await expect(chatNavOf(page).getByRole('button', { name: b.title })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: a.title })).toHaveCount(0);
  await chatNavOf(page).getByRole('button', { name: b.title }).click();
  const attach = await published(request, caseId, second.id, 'watch.attach');
  await request.post('/__relay/release', { data: { requestId: held.request!.requestId } });
  const emit = async (sessionId: string, value: string) => {
    expect((await request.post('/__relay/emit', { data: { deviceId: second.id, logical: { type: 'WATCH_EVENT', requestId: attach.request!.requestId, sessionId, watchId: attach.request!.op.watchId, eventSeq: 1, change: { kind: 'message', message: { id: randomUUID(), position: 1, role: 'assistant', text: value, streaming: false } } } } })).ok()).toBe(true);
  };
  await emit(a.sessionId, 'foreign synthetic event');
  await emit(b.sessionId, 'current synthetic event');
  await expect(conversationOf(page).getByText('current synthetic event')).toBeVisible();
  await expect(conversationOf(page).getByText('foreign synthetic event')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(b.title);
});
