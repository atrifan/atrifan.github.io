import { test, expect } from '@playwright/test';
import { ChatHarness, assertNoLeaks, chatNavOf, composerOf, conversationOf, latestWatch, msg, nativeRow, openChat, openChatNav, sendOf, snapshotFrame, stopOf } from '../support/chat-attach-fixture';
import { settleChatDrawer } from '../support/chat-visual-capture';

test('consumer evidence: Open keeps the current watch, snapshots show simulated History, Active and attached states', async ({ page }, testInfo) => {
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice({ name: 'Simulated laptop' });
  const row = nativeRow(harness, device, { title: 'Review the importer', state: 'running', surface: 'cli', row: { snippet: 'Checking cancellation and retry behavior', domain: 'example.com' } });
  harness.addLegacySession(device, { title: 'Release notes', row: { snippet: 'Summarize changes for the team' } });
  harness.setCatalog({ pageSize: 10, complete: true });
  await harness.install(page);
  await openChat(page, device, row);
  const watch = await latestWatch(harness, row.id);
  harness.emit(row.id, snapshotFrame(watch, { through: 7, stateVersion: 'v1', state: 'running', loopId: 'loop-review', messages: [
    msg('u1', 1, 'user', 'Review the importer without changing production data.'),
    msg('a1', 2, 'assistant', '## Import review\n\nThe cancellation guard is in place. I am checking the remaining cases.', true),
  ] }));
  await expect(page.getByText('Attached to CLI session', { exact: true })).toBeVisible();
  await openChatNav(page);
  await settleChatDrawer(page);
  await page.screenshot({ path: testInfo.outputPath('simulated-frontend-history.png'), fullPage: true });
  await chatNavOf(page).getByRole('tab', { name: 'Active (1)', exact: true }).click();
  await expect(chatNavOf(page).getByText('This chat', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('simulated-frontend-active.png'), fullPage: true });
  await chatNavOf(page).getByRole('button', { name: 'Open', exact: true }).click();
  expect(harness.attaches(row.id)).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('simulated-frontend-attached.png'), fullPage: true });
  await page.getByRole('button', { name: 'Detach', exact: true }).click();
  await expect(conversationOf(page).getByText('Import review', { exact: true })).toBeVisible();
  await composerOf(page).fill('Do not send while detached');
  await composerOf(page).press('Enter');
  expect(harness.sent('SESSION_COMMAND')).toHaveLength(0);
  await expect.poll(() => harness.sent('SESSION_DETACH').length).toBe(1);
  assertNoLeaks(harness);
});

test('consumer guard: metadata loss during refresh cannot turn an imported conversation into a legacy send path', async ({ page }, testInfo) => {
  await page.clock.install();
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice();
  const row = nativeRow(harness, device, { title: 'Imported work', state: 'running', surface: 'cli' });
  harness.setCatalog({ pageSize: 10, complete: true });
  await harness.install(page);
  await openChat(page, device, row);
  const watch = await latestWatch(harness, row.id);
  harness.emit(row.id, snapshotFrame(watch, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'native-loop', messages: [msg('m1', 1, 'assistant', 'Native history')] }));
  await expect(page.getByText('Attached to CLI session', { exact: true })).toBeVisible();
  await openChatNav(page);
  await chatNavOf(page).getByRole('tab', { name: 'Active (1)', exact: true }).click();
  delete row.native;
  await page.clock.runFor(3000);
  if (await page.getByRole('dialog', { name: 'Chats' }).isVisible()) await page.getByRole('button', { name: 'Close chats', exact: true }).click();
  await expect(page.getByText('Other assistant conversations are unavailable. This connection needs an assistant integration upgrade.', { exact: true })).toBeVisible();
  await composerOf(page).fill('Never use a legacy fallback');
  await composerOf(page).press('Enter');
  expect(harness.sent('SESSION_COMMAND')).toHaveLength(0);
  expect(harness.sent('SEND_MESSAGE')).toHaveLength(0);
  expect(harness.legacyCreates()).toHaveLength(0);
  expect(harness.requests.filter((request) => request.path.endsWith('/messages'))).toHaveLength(0);
  assertNoLeaks(harness);
});

test('consumer guard: a web turn that loses presence cannot steer or stop from click or Enter', async ({ page }, testInfo) => {
  await page.clock.install();
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice();
  await harness.install(page);
  await openChat(page, device);
  await composerOf(page).fill('Start a web turn');
  await composerOf(page).press('Enter');
  await expect.poll(() => harness.sent('SEND_MESSAGE').length).toBe(1);
  device.status = 'offline';
  await page.clock.runFor(15_000);
  await expect(page.getByText('Assistant offline. Steering, stop and pending responses are unavailable until it reconnects.', { exact: true })).toBeVisible();
  await composerOf(page).fill('Do not steer offline');
  await composerOf(page).press('Enter');
  await expect(sendOf(page)).toBeDisabled();
  await sendOf(page).dispatchEvent('click');
  await composerOf(page).fill('');
  await expect(stopOf(page)).toBeDisabled();
  await stopOf(page).dispatchEvent('click');
  expect(harness.sent('SEND_MESSAGE')).toHaveLength(1);
  expect(harness.sent('STOP_STREAM')).toHaveLength(0);
  assertNoLeaks(harness);
});

test('consumer guard: a failed discovery is an explicit retry state, not an empty catalog', async ({ page }, testInfo) => {
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice();
  harness.addLegacySession(device, { title: 'Recovered history' });
  await harness.install(page);
  let fail = true;
  await page.route('**/api/plugin/chat/sessions', async (route) => {
    if (fail && route.request().method() === 'GET') {
      fail = false;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulated"}' });
    } else await route.fallback();
  });
  await openChat(page, device);
  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('alert')).toContainText('Could not load chats.');
  await expect(chatNavOf(page).getByText(/No chats yet/)).toHaveCount(0);
  await chatNavOf(page).getByRole('button', { name: 'Retry chats', exact: true }).click();
  await expect(chatNavOf(page).getByRole('button', { name: 'Recovered history', exact: true })).toBeVisible();
  assertNoLeaks(harness);
});
