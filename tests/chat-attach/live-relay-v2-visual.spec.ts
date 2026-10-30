import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { chatNavOf, composerOf } from '../support/chat-attach-fixture';

const scratch = process.env.CHAT_RELAY_SCRATCH ?? '/private/var/folders/38/yd2nm8pj2zl6mpdr_z9ld_wh0000gp/T/opencode/decentralized-chat-backend/final-v2';
const caseId = randomUUID();
const externalRequests: string[] = [];

function device(name: string) {
  return {
    id: randomUUID(), device_name: name, status: 'online' as const,
    last_seen_at: '2026-10-30T09:00:00.000Z', platform: 'darwin', model: 'synthetic-assistant',
  };
}

function row(title: string, state: 'running' | 'waiting', extra: Record<string, unknown> = {}) {
  return {
    sessionId: randomUUID(), title, createdAt: '2026-10-30T09:00:00.000Z',
    lastActivity: Date.parse('2026-10-30T09:00:00.000Z'), state, surface: 'terminal',
    capabilities: { watch: true, reply: true, answer: true, stop: true }, ...extra,
  };
}

async function seed(request: APIRequestContext, scenario: Record<string, unknown>): Promise<void> {
  const response = await request.post('/__relay/scenario', { data: scenario });
  expect(response.status()).toBe(201);
}

async function entries(request: APIRequestContext): Promise<Array<Record<string, any>>> {
  const response = await request.get(`/__relay/requests?caseId=${caseId}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function waitForPublish(request: APIRequestContext, kind: string): Promise<Record<string, any>> {
  let found: Record<string, any> | undefined;
  await expect.poll(async () => {
    found = (await entries(request)).find((entry) => entry.kind === 'publish' && entry.request?.op?.kind === kind);
    return Boolean(found);
  }, { timeout: 8_000 }).toBe(true);
  return found!;
}

async function ensureChatNav(page: Page): Promise<void> {
  const nav = chatNavOf(page);
  if (await nav.isVisible()) return;
  const trigger = page.getByRole('button', { name: 'Chats', exact: true });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await expect(nav).toBeVisible();
  await expect.poll(async () => {
    const box = await nav.boundingBox();
    return Boolean(box && box.x >= 0 && box.width >= 300);
  }, { message: 'mobile Chats drawer should finish opening inside the viewport' }).toBe(true);
  const target = await trigger.boundingBox();
  expect(target && target.width >= 44 && target.height >= 44, 'mobile Chats trigger meets the touch-target minimum').toBe(true);
}

async function selectSession(page: Page, title: string): Promise<void> {
  await ensureChatNav(page);
  await chatNavOf(page).getByRole('button', { name: title, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
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
  const all = await entries(request);
  expect(externalRequests).toEqual([]);
  expect(all.filter((entry) => entry.kind === 'forbidden-legacy')).toEqual([]);
  expect(all.filter((entry) => entry.kind === 'unexpected-api')).toEqual([]);
});

test('capture synthetic history, attached conversation, approval, and unavailable states', async ({ page, request }, testInfo) => {
  const selected = device('Visual verification PC');
  const activeLoopId = randomUUID();
  const active = row('Synthetic active task', 'running', { loopId: activeLoopId });
  const approval = row('Synthetic approval', 'waiting');
  const activeSnapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: active.sessionId, watchId: randomUUID(), through: 3,
    stateVersion: randomUUID(), state: 'running', loopId: activeLoopId, pending: null,
    messages: [
      { id: randomUUID(), position: 1, role: 'user', text: 'Synthetic visual request', streaming: false },
      { id: randomUUID(), position: 2, role: 'assistant', text: 'Synthetic assistant response', streaming: true },
    ],
    historyComplete: true, historyCursor: null, leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  const approvalSnapshot = {
    type: 'WATCH_SNAPSHOT', requestId: randomUUID(), sessionId: approval.sessionId, watchId: randomUUID(), through: 1,
    stateVersion: randomUUID(), state: 'waiting', loopId: null,
    pending: { requestId: randomUUID(), kind: 'approval', prompt: 'Allow the synthetic operation?' },
    messages: [], historyComplete: true, historyCursor: null,
    leaseExpiresAt: new Date(Date.now() + 15_000).toISOString(),
  };
  await seed(request, {
    device: selected, rows: [active, approval],
    snapshots: { [active.sessionId]: activeSnapshot, [approval.sessionId]: approvalSnapshot },
  });
  await page.goto(`/chat?device=${selected.id}`);
  await waitForPublish(request, 'catalog.list');
  await ensureChatNav(page);
  const presentation = await page.evaluate(() => ({
    background: getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(presentation.background).toBe(testInfo.project.name.startsWith('dark') ? '#161616' : '#fbfaf8');
  if (presentation.clientWidth <= 400) expect(presentation.scrollWidth).toBeLessThanOrEqual(presentation.clientWidth);
  await expect(chatNavOf(page).getByRole('button', { name: active.title, exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: approval.title, exact: true })).toBeVisible();

  const captureDir = path.join(scratch, 'screenshots-v2');
  fs.mkdirSync(captureDir, { recursive: true });
  await page.screenshot({ path: path.join(captureDir, `history-${testInfo.project.name}.png`), fullPage: false });

  await selectSession(page, active.title);
  await waitForPublish(request, 'watch.attach');
  await expect(composerOf(page)).toBeEnabled();
  await expect(page.getByText('Synthetic assistant response', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(captureDir, `attached-${testInfo.project.name}.png`), fullPage: true });

  await selectSession(page, approval.title);
  await waitForPublish(request, 'watch.attach');
  await expect(page.getByText('Allow the synthetic operation?', { exact: true })).toBeVisible();
  for (const label of ['Approve', 'Deny']) {
    const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(box && box.width >= 44 && box.height >= 44, `${label} control meets the touch-target minimum`).toBe(true);
  }
  await page.screenshot({ path: path.join(captureDir, `approval-${testInfo.project.name}.png`), fullPage: true });

  const unavailable = device('Visual unavailable PC');
  await seed(request, { device: { ...unavailable, status: 'offline', last_seen_at: null }, rows: [], helloError: true });
  await page.goto(`/chat?device=${unavailable.id}`);
  await waitForPublish(request, 'hello');
  await expect(page.getByText(/offline|unavailable|not connected|could not|unable/i).first()).toBeVisible();
  await page.screenshot({ path: path.join(captureDir, `unavailable-${testInfo.project.name}.png`), fullPage: true });
});
