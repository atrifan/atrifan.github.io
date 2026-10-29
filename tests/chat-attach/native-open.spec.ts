import { test, expect } from '@playwright/test';
import {
  ChatHarness,
  assertNoLeaks,
  composerOf,
  conversationOf,
  eventFrame,
  freshEventFrame,
  headingOf,
  latestWatch,
  primed,
  msg,
  nativeRow,
  openChat,
  snapshotFrame,
  stopOf,
} from '../support/chat-attach-fixture';

/**
 * AC3 — opening native rows is read-only; AC5 — history/replay join; AC13 — attach/history errors.
 * Simulated device; frontend contract only.
 */
let h: ChatHarness;

test.beforeEach(async ({ page }, testInfo) => {
  h = new ChatHarness(testInfo);
  h.annotate();
  await h.install(page);
});

test.afterEach(() => {
  assertNoLeaks(h);
});

const RUNNING_MESSAGES = [
  msg('m1', 1, 'user', 'Summarize the build logs'),
  msg('m2', 2, 'assistant', 'Partial answ', true),
];

test('AC3 a deep link to a running native chat shows full history read-only and keeps the relay UUID', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Build review', state: 'running' });

  await openChat(page, laptop, row);
  const w = await latestWatch(h, row.id);
  h.emit(row.id, snapshotFrame(w, { through: 20, stateVersion: 'v1', state: 'running', loopId: 'loop-1', messages: RUNNING_MESSAGES }));

  await expect(headingOf(page)).toHaveText('Build review');
  await expect(conversationOf(page).getByRole('article', { name: 'You' }).filter({ hasText: 'Summarize the build logs' })).toBeVisible();
  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' }).filter({ hasText: 'Partial answ' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`session=${row.id}`));
  expect(h.legacyCreates()).toEqual([]);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
  expect(h.sent('SESSION_COMMAND')).toEqual([]);
  expect(h.sent('STOP_STREAM')).toEqual([]);
});

test('AC5 a snapshot the device sends in the same instant as the attach is not lost before the first poll', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Instant agent', state: 'running' });
  h.onAttach(row.id, (w) =>
    h.emit(row.id, snapshotFrame(w, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'loop-3', messages: [msg('m1', 1, 'assistant', 'Instant answer')] })),
  );

  await openChat(page, laptop, row);
  await expect(headingOf(page)).toHaveText('Instant agent');
  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' }).filter({ hasText: 'Instant answer' })).toBeVisible();
});

test('AC3 reopening a native chat re-attaches with a fresh watch and shows each message once', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Build review', state: 'idle' });
  const messages = [msg('m1', 1, 'user', 'First question'), msg('m2', 2, 'assistant', 'First answer.')];

  await openChat(page, laptop, row);
  const first = await latestWatch(h, row.id);
  h.emit(row.id, snapshotFrame(first, { through: 2, stateVersion: 'v1', state: 'idle', messages }));
  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' })).toHaveCount(1);

  await page.reload();
  await expect.poll(() => h.attaches(row.id).length).toBe(2);
  await primed(h, row.id);
  const second = h.attaches(row.id)[1];
  expect(second.watchId).not.toBe(first.watchId);
  h.emit(row.id, snapshotFrame(second, { through: 2, stateVersion: 'v1', state: 'idle', messages }));

  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' })).toHaveCount(1);
  await expect(conversationOf(page).getByRole('article', { name: 'You' })).toHaveCount(1);
  expect(h.legacyCreates()).toEqual([]);
});

test('AC5 late snapshot after events 21 and 22, with repeats, leaves each message once and the final text complete', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Build review', state: 'running' });

  await openChat(page, laptop, row);
  const w = await latestWatch(h, row.id);
  const partial = msg('m2', 2, 'assistant', 'Partial answ', true);

  h.emit(row.id, eventFrame(w, 18, { kind: 'message', message: partial }));
  h.emit(row.id, eventFrame(w, 19, { kind: 'message', message: partial }));
  h.emit(row.id, eventFrame(w, 20, { kind: 'message', message: partial }));
  h.emit(row.id, eventFrame(w, 21, { kind: 'message', message: msg('m2', 2, 'assistant', 'Partial answer grows', true) }));
  h.emit(row.id, eventFrame(w, 22, { kind: 'message', message: msg('m2', 2, 'assistant', 'Partial answer grows again', true) }));
  h.emit(
    row.id,
    snapshotFrame(w, { through: 20, stateVersion: 'v1', state: 'running', loopId: 'loop-1', messages: [msg('m1', 1, 'user', 'Summarize the build logs'), partial] }),
  );
  h.emit(row.id, eventFrame(w, 21, { kind: 'message', message: msg('m2', 2, 'assistant', 'Partial answer grows again', true) }));
  const final = msg('m2', 2, 'assistant', 'Partial answer grows again. Done.', false);
  h.emit(row.id, eventFrame(w, 23, { kind: 'message', message: final }));
  h.emit(row.id, eventFrame(w, 23, { kind: 'message', message: final }));

  const assistant = conversationOf(page).getByRole('article', { name: 'Assistant' });
  await expect(assistant).toHaveCount(1);
  await expect(assistant).toContainText('Partial answer grows again. Done.');
  await expect(conversationOf(page).getByRole('article', { name: 'You' })).toHaveCount(1);
  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' }).filter({ hasText: 'Partial answ' })).toHaveCount(1);
});

test('AC13 a snapshot marked historyComplete false warns about partial history and sends no native command', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Long review', state: 'running' });

  await openChat(page, laptop, row);
  const w = await latestWatch(h, row.id);
  h.emit(
    row.id,
    snapshotFrame(w, {
      through: 40,
      stateVersion: 'v3',
      state: 'running',
      loopId: 'loop-2',
      messages: [msg('m9', 9, 'assistant', 'Recent part only')],
      historyComplete: false,
    }),
  );

  await expect(page.getByText(/partial history|history is incomplete|earlier messages (are|were) not/i)).toBeVisible();
  await composerOf(page).fill('Steer this');
  await composerOf(page).press('Enter');
  await stopOf(page).click({ force: true, timeout: 2_000 }).catch(() => undefined);
  await expect.poll(() => h.sent('SESSION_COMMAND').length).toBe(0);
});

test('AC4 a legacy session without native metadata keeps the normal composer and no upgrade notice', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const legacy = h.addLegacySession(laptop, { title: 'Plain chat' });

  await openChat(page, laptop, legacy);
  await expect(headingOf(page)).toHaveText('Plain chat');
  await expect(page.getByText('This connection needs an assistant integration upgrade.')).toHaveCount(0);
  await expect(composerOf(page)).toBeEnabled();
});

test('AC15 a deep link to a missing or other-device row shows conversation unavailable and creates no chat', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const desk = h.addDevice({ name: 'Desk mac' });
  const deskRow = nativeRow(h, desk, { title: 'Desk only', state: 'running' });

  await openChat(page, laptop, deskRow);
  await expect(page.getByText(/conversation unavailable/i)).toBeVisible();
  await expect(headingOf(page)).not.toHaveText('New chat');
  expect(h.legacyCreates()).toEqual([]);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
});

test('AC13 attach timeout shows a readable error, and retry attaches a fresh watch without sending text', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Slow attach', state: 'running' });

  await openChat(page, laptop, row);
  await latestWatch(h, row.id);
  await expect(page.getByText(/couldn.t|could not|unable|timed out|not respond/i)).toBeVisible({ timeout: 25_000 });
  await expect(conversationOf(page).getByRole('article')).toHaveCount(0);

  await page.getByRole('button', { name: 'Retry attachment', exact: true }).click();
  await expect.poll(() => h.attaches(row.id).length).toBe(2);
  await primed(h, row.id);
  expect(h.attaches(row.id)[1].watchId).not.toBe(h.attaches(row.id)[0].watchId);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
  expect(h.sent('SESSION_COMMAND')).toEqual([]);

  h.emit(row.id, snapshotFrame(h.attaches(row.id)[1], { through: 1, stateVersion: 'v1', state: 'running', messages: [msg('m1', 1, 'user', 'Still there')] }));
  await expect(conversationOf(page).getByRole('article', { name: 'You' }).filter({ hasText: 'Still there' })).toBeVisible();
});

test('AC13 a malformed snapshot shows a connection error, not an empty chat, and sends nothing', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Broken snapshot', state: 'running' });

  await openChat(page, laptop, row);
  const w = await latestWatch(h, row.id);
  h.emit(row.id, { ...snapshotFrame(w, { through: 1, stateVersion: 'v1', state: 'running' }), messages: 'not-a-list' });

  await expect(page.getByText(/couldn.t|could not|unable|problem/i)).toBeVisible();
  await expect(conversationOf(page).getByRole('article')).toHaveCount(0);
  await composerOf(page).fill('Anything');
  await composerOf(page).press('Enter');
  await expect.poll(() => h.sent('SESSION_COMMAND').length).toBe(0);
});

test('AC13 a duplicate event is applied once and a sequence gap stops applying events', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Gap review', state: 'running' });

  await openChat(page, laptop, row);
  const w = await latestWatch(h, row.id);
  h.emit(row.id, snapshotFrame(w, { through: 5, stateVersion: 'v1', state: 'running', messages: [msg('m1', 1, 'user', 'Start')] }));
  h.emit(row.id, freshEventFrame(w, 5, 6, { kind: 'message', message: msg('m2', 2, 'assistant', 'Second', false) }));
  h.emit(row.id, eventFrame(w, 6, { kind: 'message', message: msg('m2', 2, 'assistant', 'Second', false) }));
  h.emit(row.id, eventFrame(w, 8, { kind: 'message', message: msg('m3', 3, 'assistant', 'After gap', false) }));

  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' }).filter({ hasText: 'Second' })).toHaveCount(1);
  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' }).filter({ hasText: 'After gap' })).toHaveCount(0);
  await expect(page.getByText(/out of sync|resync|reload|couldn.t|could not/i)).toBeVisible();
});

test('AC13 more than 1,000 buffered events before a snapshot shows a readable error', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Flood', state: 'running' });

  await openChat(page, laptop, row);
  const w = await latestWatch(h, row.id);
  for (let seq = 1; seq <= 1001; seq++) {
    h.emit(row.id, eventFrame(w, seq, { kind: 'message', message: msg(`f${seq}`, seq, 'assistant', `flood ${seq}`, true) }));
  }
  await expect(page.getByText(/too many|out of sync|couldn.t|could not|reload/i)).toBeVisible({ timeout: 20_000 });
});
