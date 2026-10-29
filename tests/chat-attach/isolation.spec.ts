import { test, expect, type Page } from '@playwright/test';
import {
  ChatHarness,
  assertNoLeaks,
  chatNavOf,
  commandResultFrame,
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
  openChatNav,
  snapshotFrame,
  switchDevice,
  type NativeIdentity,
} from '../support/chat-attach-fixture';

/**
 * AC6 isolation across devices, sessions and in-flight responses; AC12 scoped detach and
 * wrong-watch frames; AC13 delayed results after retry and after a session switch.
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

async function goNewChat(page: Page): Promise<void> {
  await openChatNav(page);
  await chatNavOf(page).getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(headingOf(page)).toHaveText('New chat');
}

test('AC6 a slow history response for one chat cannot change a new chat opened before it settles', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const old = h.addLegacySession(laptop, { title: 'Old A chat', messages: [{ role: 'user', text: 'Old A question' }] });
  const gate = h.hold(`history:${old.id}`);

  await openChat(page, laptop, old);
  await expect(headingOf(page)).toHaveText('Old A chat');
  await gate.arrived;
  await goNewChat(page);
  gate.release();

  await expect(headingOf(page)).toHaveText('New chat');
  await expect(conversationOf(page).getByRole('article').filter({ hasText: 'Old A question' })).toHaveCount(0);
  await expect(composerOf(page)).toBeEnabled();
});

test('AC6 a stale create that finishes after a native chat is opened does not take over the view or send text', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const native = nativeRow(h, laptop, { title: 'Native target', state: 'idle' });
  h.addLegacySession(laptop, { title: 'Unrelated' });
  const gate = h.hold('create');

  await openChat(page, laptop);
  await composerOf(page).fill('Typed before switching');
  await composerOf(page).press('Enter');
  await gate.arrived;

  await openChatNav(page);
  const target = chatNavOf(page).getByRole('button', { name: 'Native target', exact: true });
  await expect(target).toBeVisible();
  await target.click();
  await expect(headingOf(page)).toHaveText('Native target');
  await expect(page).toHaveURL(new RegExp(`session=${native.id}`));
  gate.release();
  await gate.done;
  await expect(headingOf(page)).toHaveText('Native target');
  await expect(page).toHaveURL(new RegExp(`session=${native.id}`));
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
});

test('AC6 a stale create that finishes after another chat is opened does not take over the view or send text', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const other = h.addLegacySession(laptop, { title: 'Unrelated' });
  const gate = h.hold('create');

  await openChat(page, laptop);
  await composerOf(page).fill('Typed before switching');
  await composerOf(page).press('Enter');
  await gate.arrived;

  await openChatNav(page);
  const target = chatNavOf(page).getByRole('button', { name: 'Unrelated', exact: true });
  await expect(target).toBeVisible();
  await target.click();
  await expect(headingOf(page)).toHaveText('Unrelated');
  await expect(page).toHaveURL(new RegExp(`session=${other.id}`));
  gate.release();
  await gate.done;
  await expect(headingOf(page)).toHaveText('Unrelated');
  await expect(page).toHaveURL(new RegExp(`session=${other.id}`));
  expect(h.sent('SEND_MESSAGE', other.id)).toEqual([]);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
});

test('AC6 the same native session id on two devices stays on its own device and relay chat', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const desk = h.addDevice({ name: 'Desk mac' });
  const sameNative = 'native-shared-id';
  const a = nativeRow(h, laptop, { title: 'Laptop copy', state: 'running', nativeSessionId: sameNative });
  const b = nativeRow(h, desk, { title: 'Desk copy', state: 'running', nativeSessionId: sameNative });

  await openChat(page, laptop, a);
  const wa = await latestWatch(h, a.id);
  h.emit(a.id, snapshotFrame(wa, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'l1', messages: [msg('m1', 1, 'assistant', 'Laptop text')] }));
  await expect(conversationOf(page).getByRole('article').filter({ hasText: 'Laptop text' })).toBeVisible();

  await switchDevice(page, desk);
  await openChatNav(page);
  await chatNavOf(page).getByRole('button', { name: 'Desk copy', exact: true }).click();
  await expect(headingOf(page)).toHaveText('Desk copy');
  const wb = await latestWatch(h, b.id);
  expect(wb.nativeSessionId).toBe(sameNative);
  h.emit(b.id, snapshotFrame(wb, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'l2', messages: [msg('m1', 1, 'assistant', 'Desk text')] }));

  await expect(conversationOf(page).getByRole('article').filter({ hasText: 'Desk text' })).toBeVisible();
  await expect(conversationOf(page).getByRole('article').filter({ hasText: 'Laptop text' })).toHaveCount(0);
});

for (const target of ['New chat', 'another chat'] as const) {
  test(`AC12 moving one watch to ${target} sends only its scoped release and the other watch keeps receiving`, async ({ page, context }) => {
    const laptop = h.addDevice({ name: 'Studio laptop' });
    const row = nativeRow(h, laptop, { title: 'Shared native', state: 'running', nativeSessionId: 'native-shared' });
    h.addLegacySession(laptop, { title: 'Other chat' });

    await openChat(page, laptop, row);
    const watchA: NativeIdentity = await latestWatch(h, row.id);

    const page2 = await context.newPage();
    await h.install(page2);
    await openChat(page2, laptop, row);
    await expect.poll(() => h.attaches(row.id).length).toBe(2);
    await primed(h, row.id);
    const watchB = h.attaches(row.id)[1];
    h.emit(row.id, snapshotFrame(watchB, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'l5', messages: [msg('m1', 1, 'assistant', 'Shared start')] }));
    await expect(conversationOf(page2).getByRole('article').filter({ hasText: 'Shared start' })).toBeVisible();

    if (target === 'New chat') await goNewChat(page);
    else {
      await openChatNav(page);
      await chatNavOf(page).getByRole('button', { name: 'Other chat', exact: true }).click();
      await expect(headingOf(page)).toHaveText('Other chat');
    }
    await expect.poll(() => h.sent('SESSION_DETACH', row.id).length).toBe(1);
    const release = h.sent('SESSION_DETACH', row.id)[0].body as { frame: { watchId: string } };
    expect(release.frame.watchId).toBe(watchA.watchId);
    expect(h.sent('SESSION_COMMAND')).toEqual([]);

    h.emit(row.id, eventFrame(watchA, 2, { kind: 'message', message: msg('m2', 2, 'assistant', 'Only A sees this', false) }));
    h.emit(row.id, eventFrame({ watchId: watchB.watchId, nativeSessionId: 'native-other' }, 2, { kind: 'message', message: msg('m3', 3, 'assistant', 'Wrong native', false) }));
    // Foreign identities do not consume watch B's next native event sequence.
    h.emit(row.id, freshEventFrame(watchB, 1, 2, { kind: 'message', message: msg('m4', 4, 'assistant', 'B keeps going', false) }));

    await expect(conversationOf(page2).getByRole('article').filter({ hasText: 'B keeps going' })).toBeVisible();
    await expect(conversationOf(page2).getByRole('article').filter({ hasText: 'Only A sees this' })).toHaveCount(0);
    await expect(conversationOf(page2).getByRole('article').filter({ hasText: 'Wrong native' })).toHaveCount(0);
    await page2.close();
  });
}

test('AC13 after retry, a delayed snapshot for the old watch is ignored and the new watch is used', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Retry target', state: 'running' });

  await openChat(page, laptop, row);
  const first = await latestWatch(h, row.id);
  await expect(page.getByText(/couldn.t|could not|unable|timed out|not respond/i)).toBeVisible({ timeout: 25_000 });

  await page.getByRole('button', { name: 'Retry attachment', exact: true }).click();
  await expect.poll(() => h.attaches(row.id).length).toBe(2);
  await primed(h, row.id);
  const second = h.attaches(row.id)[1];
  expect(second.watchId).not.toBe(first.watchId);

  h.emit(row.id, snapshotFrame(first, { through: 1, stateVersion: 'v0', state: 'running', loopId: 'old', messages: [msg('m1', 1, 'assistant', 'Old watch text')] }));
  h.emit(row.id, snapshotFrame(second, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'new', messages: [msg('m2', 1, 'assistant', 'New watch text')] }));

  await expect(conversationOf(page).getByRole('article').filter({ hasText: 'New watch text' })).toBeVisible();
  await expect(conversationOf(page).getByRole('article').filter({ hasText: 'Old watch text' })).toHaveCount(0);
});

test('AC13 a command result that arrives after switching chats does not change the chat now on screen', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Steered chat', state: 'running' });

  await openChat(page, laptop, row);
  const w = await latestWatch(h, row.id);
  h.emit(row.id, snapshotFrame(w, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'l8', messages: [msg('m1', 1, 'user', 'Start')] }));
  await composerOf(page).fill('Late steer');
  await composerOf(page).press('Enter');
  await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);
  const commandId = (h.sent('SESSION_COMMAND', row.id)[0].body as { frame: { commandId: string } }).frame.commandId;

  await goNewChat(page);
  h.emit(row.id, commandResultFrame(w, commandId, 'applied'));
  h.emit(row.id, freshEventFrame(w, 1, 2, { kind: 'message', message: msg('m2', 2, 'assistant', 'Late reply', false) }));

  await expect(headingOf(page)).toHaveText('New chat');
  await expect(conversationOf(page).getByRole('article').filter({ hasText: 'Late reply' })).toHaveCount(0);
  await expect(conversationOf(page).getByRole('article')).toHaveCount(0);
});
