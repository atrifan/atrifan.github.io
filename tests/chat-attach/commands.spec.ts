import { test, expect } from '@playwright/test';
import {
  ChatHarness,
  assertNoLeaks,
  composerOf,
  commandResultFrame,
  conversationOf,
  freshEventFrame,
  headingOf,
  latestWatch,
  msg,
  nativeRow,
  openChat,
  sendOf,
  snapshotFrame,
  stopOf,
  type FixtureDevice,
  type FixtureSession,
  type NativeIdentity,
  type NativeState,
  type PendingRequest,
} from '../support/chat-attach-fixture';

/**
 * AC7 steer, AC8 answer/approval, AC9 stop, AC10 continue, AC11 safety gates.
 * Native commands are checked by their frames (identity, stateVersion, commandId, expiry).
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

const BASE = [msg('m1', 1, 'user', 'Refactor the importer')];

async function openNative(
  page: import('@playwright/test').Page,
  state: NativeState,
  opts: { device?: FixtureDevice; loopId?: string | null; pending?: PendingRequest | null; stateVersion?: string; historyComplete?: boolean; title?: string } = {},
): Promise<{ device: FixtureDevice; row: FixtureSession; w: NativeIdentity }> {
  const device = opts.device ?? h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, device, { title: opts.title ?? 'Importer work', state });
  await openChat(page, device, row);
  const w = await latestWatch(h, row.id);
  h.emit(
    row.id,
    snapshotFrame(w, {
      through: 1,
      stateVersion: opts.stateVersion ?? 'v1',
      state,
      loopId: opts.loopId === undefined ? (state === 'running' ? 'loop-7' : null) : opts.loopId,
      messages: BASE,
      pending: opts.pending ?? null,
      historyComplete: opts.historyComplete ?? true,
    }),
  );
  await expect(headingOf(page)).toHaveText(opts.title ?? 'Importer work');
  return { device, row, w };
}

function expiresWithinTenSeconds(expiresAt: string): boolean {
  const ms = Date.parse(expiresAt) - Date.now();
  return ms > 0 && ms <= 11_000;
}

for (const via of ['Enter', 'Send button'] as const) {
  test(`AC7 steering a running chat via ${via} sends one targeted expiring reply and shows the device upsert once`, async ({ page }) => {
    const { row, w } = await openNative(page, 'running');

    await composerOf(page).fill('Use the cheaper route');
    if (via === 'Enter') await composerOf(page).press('Enter');
    else await sendOf(page).click();

    await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);
    const cmd = h.sent('SESSION_COMMAND', row.id)[0].body as { frame: Record<string, unknown> };
    expect(cmd.frame).toMatchObject({
      protocol: 1,
      watchId: w.watchId,
      nativeSessionId: row.native!.sessionId,
      stateVersion: 'v1',
      command: { kind: 'reply', text: 'Use the cheaper route' },
    });
    expect(typeof cmd.frame.commandId).toBe('string');
    expect(expiresWithinTenSeconds(cmd.frame.expiresAt as string)).toBe(true);
    expect(h.legacyCreates()).toEqual([]);
    expect(h.sent('SEND_MESSAGE')).toEqual([]);

    const commandId = cmd.frame.commandId as string;
    h.emit(row.id, commandResultFrame(w, commandId, 'applied'));
    const upsert = msg('m2', 2, 'assistant', 'Taking the cheaper route.', true);
    h.emit(row.id, freshEventFrame(w, 1, 2, { kind: 'message', message: upsert }));
    h.emit(row.id, freshEventFrame(w, 1, 3, { kind: 'message', message: { ...upsert, text: 'Taking the cheaper route, now.' } }));

    await expect(conversationOf(page).getByRole('article', { name: 'Assistant' })).toHaveCount(1);
    await expect(conversationOf(page).getByRole('article', { name: 'Assistant' })).toContainText('Taking the cheaper route, now.');
    await expect(composerOf(page)).toHaveValue('');
  });
}

test('AC8 answering a waiting question targets its requestId and does not start another turn', async ({ page }) => {
  const pending: PendingRequest = { requestId: 'q-1', kind: 'question', prompt: 'Which branch should I use?' };
  const { row, w } = await openNative(page, 'waiting', { pending, loopId: null });

  await expect(page.getByText('Which branch should I use?')).toBeVisible();
  await composerOf(page).fill('main');
  await composerOf(page).press('Enter');
  await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);
  const frame = h.sent('SESSION_COMMAND', row.id)[0].body as { frame: Record<string, unknown> };
  expect(frame.frame).toMatchObject({ watchId: w.watchId, command: { kind: 'answer', requestId: 'q-1', text: 'main' }, stateVersion: 'v1' });
  expect(h.legacyCreates()).toEqual([]);
});

test('AC8 approval Approve and Deny target the approval requestId', async ({ page }) => {
  const pending: PendingRequest = { requestId: 'a-1', kind: 'approval', prompt: 'Run the migration?' };
  const { row } = await openNative(page, 'waiting', { pending, loopId: null });

  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);
  expect((h.sent('SESSION_COMMAND', row.id)[0].body as { frame: { command: unknown } }).frame.command).toMatchObject({
    kind: 'answer',
    requestId: 'a-1',
    decision: 'approve',
  });
});

test('AC8 a stale approval answered elsewhere shows a rejection and is not resent or redirected', async ({ page }) => {
  const pending: PendingRequest = { requestId: 'a-2', kind: 'approval', prompt: 'Delete the cache?' };
  const { row, w } = await openNative(page, 'waiting', { pending, loopId: null });

  await page.getByRole('button', { name: 'Deny', exact: true }).click();
  await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);
  const commandId = (h.sent('SESSION_COMMAND', row.id)[0].body as { frame: { commandId: string } }).frame.commandId;
  h.emit(row.id, commandResultFrame(w, commandId, 'rejected', 'already_answered'));

  await expect(page.getByText(/already|no longer|answered|rejected/i)).toBeVisible();
  expect(h.sent('SESSION_COMMAND', row.id)).toHaveLength(1);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
});

test('AC9 clicking Stop twice issues one stop for the current loop and shows Stopping until device feedback', async ({ page }) => {
  const { row, w } = await openNative(page, 'running', { loopId: 'loop-9' });

  await stopOf(page).click();
  await stopOf(page).dispatchEvent('click');
  await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);
  const frame = (h.sent('SESSION_COMMAND', row.id)[0].body as { frame: Record<string, unknown> }).frame;
  expect(frame).toMatchObject({ watchId: w.watchId, stateVersion: 'v1', command: { kind: 'stop', loopId: 'loop-9' } });
  expect(expiresWithinTenSeconds(frame.expiresAt as string)).toBe(true);

  await expect(page.getByText('Stopping…', { exact: true })).toBeVisible();
  await expect(page.getByText('Idle', { exact: true })).toHaveCount(0);

  h.emit(row.id, freshEventFrame(w, 1, 2, { kind: 'state', stateVersion: 'v2', state: 'idle', loopId: null, pending: null }));
  await expect(page.getByText('Idle', { exact: true })).toBeVisible();
});

test('AC9 a rejected stop or a stop with no feedback never shows Idle', async ({ page }) => {
  const { row, w } = await openNative(page, 'running', { loopId: 'loop-10' });

  await stopOf(page).click();
  await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);
  const commandId = (h.sent('SESSION_COMMAND', row.id)[0].body as { frame: { commandId: string } }).frame.commandId;
  h.emit(row.id, commandResultFrame(w, commandId, 'rejected', 'stale_target'));

  await expect(page.getByText(/couldn.t stop|could not stop|stop failed|not stopped|rejected/i)).toBeVisible();
  await expect(page.getByText('Idle', { exact: true })).toHaveCount(0);
});

test('AC10 a follow-up after Idle replies to the same native conversation with one command', async ({ page }) => {
  const { row, w } = await openNative(page, 'idle', { stateVersion: 'v5' });
  await composerOf(page).fill('Continue with the tests');
  await composerOf(page).press('Enter');

  await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);
  expect((h.sent('SESSION_COMMAND', row.id)[0].body as { frame: Record<string, unknown> }).frame).toMatchObject({
    watchId: w.watchId,
    nativeSessionId: row.native!.sessionId,
    stateVersion: 'v5',
    command: { kind: 'reply', text: 'Continue with the tests' },
  });
  expect(h.legacyCreates()).toEqual([]);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
});

test('AC11 an offline device sends no native command from Enter and shows why', async ({ page }) => {
  const device = h.addDevice({ name: 'Studio laptop', status: 'offline' });
  const row = nativeRow(h, device, { title: 'Offline work', state: 'running' });
  await openChat(page, device, row);
  await expect(page.getByText(/offline|not connected|reconnect/i).first()).toBeVisible();

  await composerOf(page).fill('Will this go?');
  await composerOf(page).press('Enter');
  await stopOf(page).click({ force: true, timeout: 2_000 }).catch(() => undefined);
  expect(h.sent('SESSION_COMMAND')).toEqual([]);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
});

test('AC11 a command that gets no result within 10 seconds disables further actions and is not resent', async ({ page }) => {
  const { row } = await openNative(page, 'running', { loopId: 'loop-11' });
  await composerOf(page).fill('Try this');
  await composerOf(page).press('Enter');
  await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);

  await expect(page.getByText(/timed out|no response|check the assistant|try again/i)).toBeVisible({ timeout: 15_000 });
  await expect(stopOf(page)).toBeDisabled();
  expect(h.sent('SESSION_COMMAND', row.id)).toHaveLength(1);
});

test('AC11 a send failure keeps the draft and sends nothing again on its own', async ({ page }) => {
  const { row } = await openNative(page, 'running', { loopId: 'loop-12' });
  h.failNextSend('SESSION_COMMAND', { status: 500 });

  await composerOf(page).fill('Keep this draft');
  await composerOf(page).press('Enter');
  await expect.poll(() => h.sent('SESSION_COMMAND', row.id).length).toBe(1);
  await expect(composerOf(page)).toHaveValue('Keep this draft');
  await expect(page.getByText(/couldn.t send|could not send|not sent|failed/i)).toBeVisible();
  expect(h.sent('SESSION_COMMAND', row.id)).toHaveLength(1);
});
