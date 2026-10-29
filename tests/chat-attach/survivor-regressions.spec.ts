import { expect, test } from '@playwright/test';
import { ChatHarness, assertNoLeaks, chatNavOf, composerOf, conversationOf, latestWatch, msg, nativeRow, openChat, openChatNav, sendOf, snapshotFrame, stopOf, switchDevice } from '../support/chat-attach-fixture';

test('native presence loss blocks activation in the render-to-effect interval and after reconnect', async ({ page }, testInfo) => {
  await page.clock.install();
  const h = new ChatHarness(testInfo);
  h.annotate();
  const device = h.addDevice();
  const row = nativeRow(h, device, { state: 'running' });
  await h.install(page);
  await openChat(page, device, row);
  const watch = await latestWatch(h, row.id);
  h.emit(row.id, snapshotFrame(watch, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'loop', messages: [msg('m', 1, 'assistant', 'Current work')] }));
  await expect(page.getByText('Attached to Terminal session', { exact: true })).toBeVisible();
  await composerOf(page).fill('Never send offline');
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('.chat-presence.is-offline')) return;
      observer.disconnect();
      document.body.dataset.offlineActivationProbe = 'dispatched';
      // Observe the committed presence transition before passive cleanup where possible.
      document.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      document.querySelector<HTMLButtonElement>('.native-session-chat .chat-composer-tools .btn')?.click();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  device.status = 'offline';
  await page.clock.runFor(15_000);
  await expect(page.locator('body')).toHaveAttribute('data-offline-activation-probe', 'dispatched');
  await expect(stopOf(page)).toBeDisabled();
  await composerOf(page).press('Enter');
  await stopOf(page).dispatchEvent('click');
  expect(h.sent('SESSION_COMMAND')).toHaveLength(0);
  device.status = 'online';
  await page.clock.runFor(15_000);
  await expect(page.getByRole('button', { name: 'Retry attachment', exact: true })).toBeEnabled();
  await expect(sendOf(page)).toBeDisabled();
  await composerOf(page).press('Enter');
  expect(h.sent('SESSION_COMMAND')).toHaveLength(0);
  expect(h.attaches(row.id)).toHaveLength(1);
  assertNoLeaks(h);
});

test('a stalled discovery request becomes an explicit retry error instead of loading forever', async ({ page }, testInfo) => {
  await page.clock.install();
  const h = new ChatHarness(testInfo);
  h.annotate();
  const device = h.addDevice();
  await h.install(page);
  // StrictMode cancels its throwaway mount. Hold every list request, including the live mount.
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/plugin/chat/sessions', async (route) => {
    await held;
    await route.fulfill({ json: { sessions: [] } }).catch(() => undefined);
  });
  await openChat(page, device);
  await openChatNav(page);
  await expect(chatNavOf(page).getByText('Loading chats…', { exact: true })).toBeVisible();
  await page.clock.runFor(15_000);
  try {
    await expect(chatNavOf(page).getByRole('alert')).toContainText('Could not load chats.');
    await expect(chatNavOf(page).getByRole('button', { name: 'Retry chats', exact: true })).toBeEnabled();
    await expect(chatNavOf(page).getByText(/No chats yet/)).toHaveCount(0);
  } finally { release(); }
  assertNoLeaks(h);
});

test('a late canceled list cannot overwrite a device revisited after switching away', async ({ page }, testInfo) => {
  await page.clock.install();
  const h = new ChatHarness(testInfo);
  h.annotate();
  const a = h.addDevice({ name: 'A device' });
  const b = h.addDevice({ name: 'B device' });
  const row = h.addLegacySession(a, { title: 'Current A' });
  h.addLegacySession(b, { title: 'Current B' });
  h.setCatalog({ pageSize: 10, complete: true });
  await h.install(page);
  await openChat(page, a);
  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('button', { name: 'Current A', exact: true })).toBeVisible();
  let release!: () => void;
  let arrived!: () => void;
  const arrival = new Promise<void>((resolve) => { arrived = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  let hold = true;
  await page.route('**/api/plugin/chat/sessions', async (route) => {
    if (!hold || route.request().method() !== 'GET') return route.fallback();
    hold = false;
    arrived();
    await held;
    await route.fulfill({ json: { sessions: [{ ...row, title: 'Stale A' }] } }).catch(() => undefined);
  });
  await chatNavOf(page).getByRole('tab', { name: /^Active/ }).click();
  await page.clock.runFor(3000);
  await arrival;
  await switchDevice(page, b);
  await switchDevice(page, a);
  await chatNavOf(page).getByRole('tab', { name: 'History', exact: true }).click();
  await expect(chatNavOf(page).getByRole('button', { name: 'Current A', exact: true })).toBeVisible();
  release();
  await page.evaluate(() => fetch('/__settle'));
  await expect(chatNavOf(page).getByRole('button', { name: 'Stale A', exact: true })).toHaveCount(0);
  assertNoLeaks(h);
});

test('a stalled attached receive revokes controls and keeps the transcript explicitly stale', async ({ page }, testInfo) => {
  await page.clock.install();
  const h = new ChatHarness(testInfo);
  h.annotate();
  const device = h.addDevice();
  const row = nativeRow(h, device, { state: 'running' });
  await h.install(page);
  await openChat(page, device, row);
  const watch = await latestWatch(h, row.id);
  h.emit(row.id, snapshotFrame(watch, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'loop', messages: [msg('m', 1, 'assistant', 'Keep this history')] }));
  await expect(page.getByText('Attached to Terminal session', { exact: true })).toBeVisible();
  const gate = h.hold(`receive:${row.id}`);
  await page.clock.runFor(1200);
  await gate.arrived;
  await page.clock.runFor(15_000);
  await expect(page.getByText('Last transcript may be stale; live controls are unavailable.', { exact: true })).toBeVisible();
  await expect(conversationOf(page)).toContainText('Keep this history');
  await expect(stopOf(page)).toBeDisabled();
  await composerOf(page).fill('No command');
  await composerOf(page).press('Enter');
  expect(h.sent('SESSION_COMMAND')).toHaveLength(0);
  gate.release();
  await gate.done;
  assertNoLeaks(h);
});
