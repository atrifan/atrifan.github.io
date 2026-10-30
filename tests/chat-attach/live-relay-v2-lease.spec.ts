import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { chatNavOf, composerOf, openChatNav } from '../support/chat-attach-fixture';

const caseId = randomUUID();
const deviceId = randomUUID();
const sessionId = randomUUID();
const title = 'Heartbeat lease PC session';
const externalRequests: string[] = [];

async function entries(request: APIRequestContext): Promise<Array<Record<string, any>>> {
  const response = await request.get(`/__relay/requests?caseId=${caseId}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function waitForOperation(request: APIRequestContext, kind: string): Promise<Record<string, any>> {
  let found: Record<string, any> | undefined;
  await expect.poll(async () => {
    found = (await entries(request)).find((entry) => entry.kind === 'publish' && entry.request?.op?.kind === kind);
    return Boolean(found);
  }, { timeout: 8_000, message: `ChatApp should publish v2 ${kind}` }).toBe(true);
  return found!;
}

test.beforeEach(async ({ page, request }) => {
  const seeded = await request.post('/__relay/scenario', {
    data: {
      device: {
        id: deviceId,
        device_name: 'Heartbeat PC',
        status: 'online',
        last_seen_at: '2026-10-30T09:00:00.000Z',
        platform: 'darwin',
        model: 'synthetic-assistant',
      },
      rows: [{
        sessionId,
        title,
        createdAt: '2026-10-30T09:00:00.000Z',
        lastActivity: Date.now(),
        state: 'running',
        surface: 'terminal',
        loopId: randomUUID(),
        capabilities: { watch: true, reply: true, answer: true, stop: true },
      }],
      heartbeatDisabled: true,
    },
  });
  expect(seeded.status()).toBe(201);
  await page.route((url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost', (route) => {
    externalRequests.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.route((url) => url.pathname.startsWith('/api/'), (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-test-case': caseId } }),
  );
});

test.afterEach(async ({ request }) => {
  const all = await entries(request);
  expect(externalRequests, 'all UI traffic stays loopback-only').toEqual([]);
  expect(all.filter((entry) => entry.kind === 'forbidden-legacy'), 'no fallback to durable legacy chat routes').toEqual([]);
  expect(all.filter((entry) => entry.kind === 'unexpected-api')).toEqual([]);
});

test('missing heartbeat disables selected-session controls by the READY authorizedUntil deadline', async ({ page, request }) => {
  await page.goto(`/chat?device=${deviceId}`);
  await waitForOperation(request, 'catalog.list');
  await openChatNav(page);
  await chatNavOf(page).getByRole('button', { name: title, exact: true }).click();
  await waitForOperation(request, 'watch.attach');
  const composer = composerOf(page);
  await expect(composer).toBeEnabled();

  const all = await entries(request);
  const ready = all.find((entry) => entry.kind === 'viewer-ready');
  expect(ready).toBeDefined();
  const deadline = Date.parse(ready!.authorizedUntil);
  expect(deadline - Date.parse(ready!.serverTime)).toBeLessThanOrEqual(5_000);
  expect(all.filter((entry) => entry.kind === 'heartbeat')).toEqual([]);
  const remainingUntilFailClosed = Math.max(1_000, deadline - Date.now() + 1_000);
  await expect(composer).toBeDisabled({ timeout: remainingUntilFailClosed });

  const finalEntries = await entries(request);
  expect(finalEntries.some((entry) => entry.kind === 'publish' && entry.request?.op?.kind === 'command')).toBe(false);
  expect(finalEntries.some((entry) => entry.kind === 'publish' && entry.request?.op?.kind === 'session.create')).toBe(false);
  expect(finalEntries.filter((entry) => entry.kind === 'heartbeat')).toEqual([]);
});
