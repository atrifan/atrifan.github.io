import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ChatHarness,
  assertNoLeaks,
  chatNavOf,
  composerOf,
  conversationOf,
  errorFrame,
  latestWatch,
  msg,
  nativeRow,
  openChat,
  openChatNav,
  snapshotFrame,
} from '../support/chat-attach-fixture';
import { focusChatControl, settleChatDrawer } from '../support/chat-visual-capture';

/**
 * Visual capture only (not an assertion of design fit): successful screenshots of the states the visual reviewer must open.
 * Simulated device; frontend contract only. Runs in the four light/dark × desktop/mobile projects.
 */
const NOW = Date.parse('2026-10-29T09:05:00Z');
test.use({ timezoneId: 'America/New_York' });

async function themeEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await settleChatDrawer(page);
  const evidence = await page.evaluate(() => ({
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
    drawerOverflow: (() => { const el = document.getElementById('chat-drawer'); return el ? el.scrollWidth - el.clientWidth : 0; })(),
    focus: { name: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent, visible: document.activeElement?.matches(':focus-visible') },
    targets: Array.from(document.querySelectorAll<HTMLButtonElement>('.chat-app button')).filter((el) => el.getClientRects().length > 0).map((el) => ({ name: el.getAttribute('aria-label') || el.textContent, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })),
  }));
  const dark = testInfo.project.use.colorScheme === 'dark';
  expect(evidence.prefersDark).toBe(dark);
  expect(evidence.colorScheme).toBe(dark ? 'dark' : 'light');
  expect(evidence.bodyBackground).toBe(dark ? 'rgb(22, 22, 22)' : 'rgb(251, 250, 248)');
  expect(evidence.pageOverflow).toBeLessThanOrEqual(0);
  expect(evidence.drawerOverflow).toBeLessThanOrEqual(0);
  for (const target of evidence.targets) {
    expect(target.width, `${target.name} touch width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.name} touch height`).toBeGreaterThanOrEqual(44);
  }
  const files = ['ChatApp.tsx', 'NativeSessionChat.tsx', 'SessionsDrawer.tsx', 'session-contract.ts', 'native-session-port.ts', 'model/session-attachment.ts', 'model/session-list.ts', 'ChatApp.css', 'SessionDiscovery.css', 'RemoteChat.css'];
  const sourceSHA = Object.fromEntries(files.map((file) => [file, createHash('sha256').update(readFileSync(path.resolve(__dirname, '../../src/views/remote-chat', file))).digest('hex')]));
  const sourceGeneration = createHash('sha256').update(JSON.stringify(sourceSHA)).digest('hex');
  await testInfo.attach(`${name}-theme`, { body: JSON.stringify({ ...evidence, state: name, project: testInfo.project.name, label: 'simulated device; frontend contract only', image: testInfo.outputPath(`capture-${name}.png`), sourceGeneration, sourceSHA }, null, 2), contentType: 'application/json' });
}

test('visual capture: Active list shows a streaming run and a waiting question', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(NOW));
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice({ name: 'Simulated laptop' });
  const running = nativeRow(harness, device, { title: 'Review the importer', state: 'running', surface: 'cli', row: { snippet: 'Checking cancellation and retry behavior' }, timing: { startedAt: NOW - 300_000, lastChunkAt: NOW - 30_000 } });
  nativeRow(harness, device, { title: 'Pick the release branch', state: 'waiting', surface: 'panel', row: { snippet: 'Waiting for an answer' }, timing: { startedAt: NOW - 120_000, lastChunkAt: NOW - 10_000 } });
  harness.setCatalog({ pageSize: 10, complete: true });
  await harness.install(page);
  await openChat(page, device, running);
  await openChatNav(page);
  await chatNavOf(page).getByRole('tab', { name: 'Active (2)', exact: true }).click();
  await expect(chatNavOf(page).getByText('This chat', { exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByText('Started 5 min ago', { exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByText('Last output 30s ago', { exact: true })).toBeVisible();
  await settleChatDrawer(page);
  await focusChatControl(page, chatNavOf(page).getByRole('button', { name: 'Attach', exact: true }));
  await themeEvidence(page, testInfo, 'active-streaming-waiting');
  await page.screenshot({ path: testInfo.outputPath('capture-active-streaming-waiting.png'), fullPage: true });
  assertNoLeaks(harness);
});

test('visual capture: pending approval in an attached transcript', async ({ page }, testInfo) => {
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(harness, device, { title: 'Release check', state: 'waiting' });
  harness.setCatalog({ pageSize: 10, complete: true });
  await harness.install(page);
  await openChat(page, device, row);
  const w = await latestWatch(harness, row.id);
  harness.emit(row.id, snapshotFrame(w, {
    through: 1, stateVersion: 'v1', state: 'waiting',
    messages: [msg('m1', 1, 'user', 'Ship the release')],
    pending: { requestId: 'a-access', kind: 'approval', prompt: 'Approve the production deploy?' },
  }));
  await expect(page.getByText('Approve the production deploy?')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Approval needed', exact: true }).getByText('Approval needed', { exact: true })).toBeVisible();
  await focusChatControl(page, page.getByRole('button', { name: 'Approve', exact: true }));
  await themeEvidence(page, testInfo, 'pending-approval');
  await page.screenshot({ path: testInfo.outputPath('capture-pending-approval.png'), fullPage: true });
  assertNoLeaks(harness);
});

test('visual capture: detached read-only transcript', async ({ page }, testInfo) => {
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice({ name: 'Simulated laptop' });
  const row = nativeRow(harness, device, { title: 'Review the importer', state: 'running', surface: 'cli' });
  harness.setCatalog({ pageSize: 10, complete: true });
  await harness.install(page);
  await openChat(page, device, row);
  const w = await latestWatch(harness, row.id);
  harness.emit(row.id, snapshotFrame(w, { through: 2, stateVersion: 'v1', state: 'running', loopId: 'loop-review', messages: [
    msg('u1', 1, 'user', 'Review the importer without changing production data.'),
    msg('a1', 2, 'assistant', 'The cancellation guard is in place.', true),
  ] }));
  await expect(page.getByText('Attached to CLI session', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Detach', exact: true }).click();
  await expect(conversationOf(page).getByText('The cancellation guard is in place.', { exact: true })).toBeVisible();
  await expect(page.getByText('Detached. Transcript is read-only.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeDisabled();
  await themeEvidence(page, testInfo, 'detached');
  await page.screenshot({ path: testInfo.outputPath('capture-detached.png'), fullPage: true });
  assertNoLeaks(harness);
});

test('visual capture: integration upgrade notice after native metadata is lost', async ({ page }, testInfo) => {
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
  await themeEvidence(page, testInfo, 'upgrade-unavailable');
  await page.screenshot({ path: testInfo.outputPath('capture-upgrade-unavailable.png'), fullPage: true });
  assertNoLeaks(harness);
});

test('visual capture: attachment error with retry available', async ({ page }, testInfo) => {
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice({ name: 'Simulated laptop' });
  const row = nativeRow(harness, device, { title: 'Review the importer', state: 'running', surface: 'cli' });
  harness.setCatalog({ pageSize: 10, complete: true });
  await harness.install(page);
  await openChat(page, device, row);
  const w = await latestWatch(harness, row.id);
  harness.emit(row.id, snapshotFrame(w, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'loop-review', messages: [msg('m1', 1, 'assistant', 'Retained history after connection loss.')] }));
  await expect(page.getByText('Attached to CLI session', { exact: true })).toBeVisible();
  harness.emit(row.id, errorFrame(w, 'internal', 'Could not attach to this conversation: the bridge restarted.'));
  await expect(page.getByRole('button', { name: 'Retry attachment', exact: true })).toBeVisible();
  await themeEvidence(page, testInfo, 'error-retry');
  await page.screenshot({ path: testInfo.outputPath('capture-error-retry.png'), fullPage: true });
  assertNoLeaks(harness);
});

test('visual capture: settled multi-day History with long metadata and keyboard focus', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(NOW));
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice({ name: 'Simulated laptop' });
  const longTitle = 'Review the importer and its deliberately long cross-device cancellation and recovery checklist';
  const activities = [NOW - 60_000, NOW - 86_400_000, NOW - 3 * 86_400_000, NOW - 9 * 86_400_000];
  activities.forEach((lastActivity, i) => nativeRow(harness, device, { title: i === 0 ? longTitle : ['Yesterday review', 'Earlier this week', 'Previous release'][i - 1], state: 'idle', surface: ['cli', 'panel', 'vscode', 'telegram'][i], row: { lastActivity, updatedAt: new Date(lastActivity).toISOString(), snippet: i === 0 ? 'A deliberately long last-message preview that should truncate cleanly without pushing the site chip or local time outside the drawer.' : undefined, domain: i === 0 ? 'review-tools.staging.example.com' : undefined } }));
  harness.setCatalog({ pageSize: 10, complete: true });
  await harness.install(page);
  await openChat(page, device);
  await openChatNav(page);
  await settleChatDrawer(page);
  for (const group of ['Today', 'Yesterday', 'This week', 'Older']) await expect(chatNavOf(page).getByRole('heading', { name: group, exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: 'Previous release', exact: true })).toBeInViewport({ ratio: 1 });
  await focusChatControl(page, chatNavOf(page).getByRole('button', { name: longTitle, exact: true }));
  await themeEvidence(page, testInfo, 'history-multiday');
  await page.screenshot({ path: testInfo.outputPath('capture-history-multiday.png'), fullPage: true });
  assertNoLeaks(harness);
});

test('visual capture: recovered attachment after retry with focused composer', async ({ page }, testInfo) => {
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice({ name: 'Simulated laptop' });
  const row = nativeRow(harness, device, { title: 'Review the importer', state: 'running', surface: 'cli' });
  await harness.install(page);
  await openChat(page, device, row);
  const first = await latestWatch(harness, row.id);
  harness.emit(row.id, errorFrame(first, 'internal', 'Could not attach to this conversation: the bridge restarted.'));
  await page.getByRole('button', { name: 'Retry attachment', exact: true }).click();
  await expect.poll(() => harness.attaches(row.id).length).toBe(2);
  const second = await latestWatch(harness, row.id);
  expect(second.watchId).not.toBe(first.watchId);
  harness.emit(row.id, snapshotFrame(second, { through: 2, stateVersion: 'v2', state: 'running', loopId: 'loop-recovered', messages: [msg('u1', 1, 'user', 'Review the importer without changing production data.'), msg('a1', 2, 'assistant', '## Import review\n\nReattached safely. Checking the cancellation and retry paths.', true)] }));
  await expect(page.getByText('Attached to CLI session', { exact: true })).toBeVisible();
  await expect(composerOf(page)).toHaveAttribute('placeholder', 'Message your assistant…');
  await page.keyboard.press('Tab');
  await composerOf(page).focus();
  await expect(composerOf(page)).toBeFocused();
  expect(await composerOf(page).evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  const accent = await composerOf(page).evaluate((element) => { const probe = document.createElement('span'); probe.style.color = 'var(--color-accent)'; element.parentElement!.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; });
  await expect(page.locator('.chat-composer-box')).toHaveCSS('border-color', accent);
  await themeEvidence(page, testInfo, 'recovered-attached');
  await page.screenshot({ path: testInfo.outputPath('capture-recovered-attached.png'), fullPage: true });
  expect(harness.sent('SESSION_COMMAND')).toHaveLength(0);
  assertNoLeaks(harness);
});

test('visual capture: empty History with device picker and both tabs', async ({ page }, testInfo) => {
  const harness = new ChatHarness(testInfo);
  harness.annotate();
  const device = harness.addDevice({ name: 'Simulated laptop' });
  harness.addDevice({ name: 'Simulated desktop' });
  harness.setCatalog({ pageSize: 10, complete: true });
  await harness.install(page);
  await openChat(page, device);
  await openChatNav(page);
  await settleChatDrawer(page);
  await expect(chatNavOf(page).getByText(/No chats yet/)).toBeVisible();
  await expect(chatNavOf(page).getByRole('combobox', { name: 'Assistant' })).toBeVisible();
  await expect(chatNavOf(page).getByRole('tab', { name: 'History', exact: true })).toHaveAttribute('aria-selected', 'true');
  await focusChatControl(page, chatNavOf(page).getByRole('tab', { name: 'History', exact: true }));
  await themeEvidence(page, testInfo, 'history-empty');
  await page.screenshot({ path: testInfo.outputPath('capture-history-empty.png'), fullPage: true });
  assertNoLeaks(harness);
});
