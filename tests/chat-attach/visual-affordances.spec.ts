import { expect, test } from '@playwright/test';
import { ChatHarness, assertNoLeaks, composerOf, latestWatch, msg, nativeRow, openChat, snapshotFrame, stopOf } from '../support/chat-attach-fixture';

test('native approval retains Tulzo warning label and distinct accent / danger decisions', async ({ page }, testInfo) => {
  const h = new ChatHarness(testInfo);
  h.annotate();
  const device = h.addDevice();
  const row = nativeRow(h, device, { state: 'waiting' });
  await h.install(page);
  await openChat(page, device, row);
  const watch = await latestWatch(h, row.id);
  h.emit(row.id, snapshotFrame(watch, { through: 1, stateVersion: 'v1', state: 'waiting', pending: { requestId: 'approval-visual', kind: 'approval', prompt: 'Publish the report?' } }));
  const card = page.getByRole('region', { name: 'Approval needed', exact: true });
  await expect(card.getByText('Approval needed', { exact: true })).toBeVisible();
  const approve = card.getByRole('button', { name: 'Approve', exact: true });
  const deny = card.getByRole('button', { name: 'Deny', exact: true });
  const treatment = await card.evaluate((element) => {
    const token = (name: string) => {
      const probe = document.createElement('span');
      probe.style.color = `var(${name})`;
      element.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    const buttons = element.querySelectorAll('button');
    return { border: getComputedStyle(element).borderColor, ordinaryBorder: token('--color-border'), warning: token('--color-warning'), label: getComputedStyle(element.querySelector('.chat-card-label')!).color, accent: token('--color-accent'), danger: token('--color-danger'), approve: getComputedStyle(buttons[0]).backgroundColor, deny: getComputedStyle(buttons[1]).color };
  });
  expect(treatment.label).toBe(treatment.warning);
  expect(treatment.border).not.toBe(treatment.ordinaryBorder);
  expect(treatment.approve).toBe(treatment.accent);
  expect(treatment.deny).toBe(treatment.danger);
  await deny.click();
  await expect.poll(() => h.sent('SESSION_COMMAND').length).toBe(1);
  expect((h.sent('SESSION_COMMAND')[0].body as { frame: { command: unknown } }).frame.command).toEqual({ kind: 'answer', requestId: 'approval-visual', decision: 'deny' });
  await expect(approve).toBeDisabled();
  await approve.dispatchEvent('click');
  expect(h.sent('SESSION_COMMAND')).toHaveLength(1);
  assertNoLeaks(h);
});

test('native composer has a visible cue and detached Stop is muted while drafts remain editable', async ({ page }, testInfo) => {
  const h = new ChatHarness(testInfo);
  h.annotate();
  const device = h.addDevice();
  const row = nativeRow(h, device, { state: 'running' });
  await h.install(page);
  await openChat(page, device, row);
  const watch = await latestWatch(h, row.id);
  h.emit(row.id, snapshotFrame(watch, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'loop', messages: [msg('m', 1, 'assistant', 'Working')] }));
  await expect(page.getByText('Attached to Terminal session', { exact: true })).toBeVisible();
  await expect(composerOf(page)).toHaveAttribute('placeholder', 'Message your assistant…');
  const enabledColor = await stopOf(page).evaluate((element) => getComputedStyle(element).color);
  await page.getByRole('button', { name: 'Detach', exact: true }).click();
  await expect(stopOf(page)).toBeDisabled();
  const disabled = await stopOf(page).evaluate((element) => ({ color: getComputedStyle(element).color, cursor: getComputedStyle(element).cursor, opacity: getComputedStyle(element).opacity }));
  expect(disabled.color).not.toBe(enabledColor);
  expect(disabled.cursor).not.toBe('pointer');
  expect(Number(disabled.opacity)).toBeLessThan(1);
  await composerOf(page).fill('Keep an unsent draft');
  await composerOf(page).press('Enter');
  await stopOf(page).dispatchEvent('click');
  await expect(composerOf(page)).toHaveValue('Keep an unsent draft');
  expect(h.sent('SESSION_COMMAND')).toHaveLength(0);
  assertNoLeaks(h);
});
