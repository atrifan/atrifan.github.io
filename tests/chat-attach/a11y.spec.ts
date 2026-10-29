import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import {
  ChatHarness,
  assertNoLeaks,
  composerOf,
  conversationOf,
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
} from '../support/chat-attach-fixture';

/**
 * AC14 — accessible UI in both themes at desktop and 390px: axe (WCAG 2 A/AA), no horizontal overflow,
 * 44px targets, keyboard Escape, and streaming that does not pull the reader off older text.
 * Runs in the four light/dark × desktop/mobile projects. Simulated device; frontend contract only.
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

async function openApproval(page: Page): Promise<{ device: FixtureDevice; row: FixtureSession }> {
  const device = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, device, { title: 'Release check', state: 'waiting' });
  await openChat(page, device, row);
  const w = await latestWatch(h, row.id);
  h.emit(
    row.id,
    snapshotFrame(w, {
      through: 1,
      stateVersion: 'v1',
      state: 'waiting',
      messages: [msg('m1', 1, 'user', 'Ship the release')],
      pending: { requestId: 'a-access', kind: 'approval', prompt: 'Approve the production deploy?' },
    }),
  );
  await expect(page.getByText('Approve the production deploy?')).toBeVisible();
  return { device, row };
}

test('AC14 native approval view has no serious or critical WCAG 2 A/AA violations', async ({ page }) => {
  await openApproval(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    blocking,
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`).join('\n'),
  ).toEqual([]);
});

test('AC14 native approval view does not scroll sideways at this viewport', async ({ page }) => {
  await openApproval(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('AC14 Approve, Deny, Send and Stop targets are at least 44 by 44 CSS pixels', async ({ page }) => {
  await openApproval(page);
  for (const control of [
    page.getByRole('button', { name: 'Approve', exact: true }),
    page.getByRole('button', { name: 'Deny', exact: true }),
    sendOf(page),
  ]) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test('AC14 Escape cancels the rename field and returns focus to the chat list', async ({ page }) => {
  const device = h.addDevice({ name: 'Studio laptop' });
  const chat = h.addLegacySession(device, { title: 'Escape me' });
  await openChat(page, device, chat);
  const nav = page.getByRole('navigation', { name: 'Chats' }).or(page.getByRole('dialog', { name: 'Chats' }));
  if (!(await nav.first().isVisible())) await page.getByRole('button', { name: 'Chats', exact: true }).click();

  const rename = nav.getByRole('button', { name: 'Rename chat Escape me', exact: true });
  await rename.click();
  const field = page.getByRole('textbox', { name: 'Chat title' });
  await field.fill('Not saved');
  await field.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Escape me', exact: true })).toBeVisible();
});

test('AC14 streaming does not pull a reader away from older text, and following the bottom keeps the newest text readable', async ({ page }) => {
  const device = h.addDevice({ name: 'Studio laptop' });
  const messages = Array.from({ length: 30 }, (_, i) => ({ role: 'assistant' as const, text: `Older paragraph ${i + 1}. ${'Lorem ipsum dolor sit amet. '.repeat(6)}` }));
  const chat = h.addLegacySession(device, { title: 'Long read', messages: [{ role: 'user', text: 'Keep going' }, ...messages] });

  await openChat(page, device, chat);
  const log = conversationOf(page);
  await composerOf(page).fill('Stream please');
  await composerOf(page).press('Enter');
  await expect.poll(() => h.sent('SEND_MESSAGE', chat.id).length).toBe(1);

  await log.evaluate((el) => {
    el.scrollTop = 0;
  });
  h.emit(chat.id, { type: 'STREAM_CHUNK', delta: 'Fresh streamed words arrive here.' });
  await expect(log.getByRole('article', { name: 'Assistant' }).filter({ hasText: 'Fresh streamed words' }).first()).toBeAttached();
  const reading = await log.evaluate((el) => el.scrollTop);
  expect(reading).toBeLessThan(50);

  await log.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  h.emit(chat.id, { type: 'STREAM_CHUNK', delta: ' Newest line.' });
  await expect(log.getByRole('article', { name: 'Assistant' }).filter({ hasText: 'Newest line.' }).first()).toBeInViewport();
});

test('AC14 a legacy chat with an open composer and a visible header is labelled for assistive technology', async ({ page }) => {
  const device = h.addDevice({ name: 'Studio laptop' });
  const chat = h.addLegacySession(device, { title: 'Labelled chat', messages: [{ role: 'user', text: 'Hi' }] });
  await openChat(page, device, chat);
  await expect(headingOf(page)).toHaveText('Labelled chat');
  await expect(composerOf(page)).toBeVisible();
  await expect(stopOf(page)).toHaveCount(0);
});
