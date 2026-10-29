import { test, expect } from '@playwright/test';
import { ChatHarness, assertNoLeaks, chatNavOf, composerOf, conversationOf, headingOf, messageArticles, openChat, openChatNav, polled, sendOf, stopOf } from '../support/chat-attach-fixture';

/**
 * AC1 — legacy compatibility. Plain relay sessions with an online device keep the existing web chat
 * behavior. Simulated device; frontend contract only.
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

test('AC1 a new web chat creates exactly one relay session and sends one legacy SEND_MESSAGE', async ({ page }) => {
  const device = h.addDevice({ name: 'Studio laptop' });
  await openChat(page, device);
  await expect(headingOf(page)).toHaveText('New chat');

  await composerOf(page).fill('Plan a Lisbon weekend');
  await composerOf(page).press('Enter');
  await expect(messageArticles(page, 'You', 'Plan a Lisbon weekend')).toBeVisible();

  await expect.poll(() => h.sent('SEND_MESSAGE').length).toBe(1);
  expect(h.legacyCreates()).toHaveLength(1);
  const created = h.sessions.find((s) => s.api_key_id === device.id);
  expect(created).toBeDefined();
  const send = h.sent('SEND_MESSAGE')[0];
  expect(send.relayId).toBe(created!.id);
  expect(send.body).toMatchObject({ frame: { type: 'SEND_MESSAGE', text: 'Plan a Lisbon weekend' } });
  expect(h.sent().filter((r) => r.frameType?.startsWith('SESSION_'))).toEqual([]);
});

test('AC1 a seeded rich chat reloads with its labels, and rename and delete keep working', async ({ page }) => {
  const device = h.addDevice({ name: 'Studio laptop' });
  const trip = h.addLegacySession(device, {
    title: 'Trip plan',
    messages: [
      { role: 'user', text: 'Compare the two cheapest flights to Lisbon next Friday.' },
      { role: 'assistant', text: 'Here are the options:\n\n| Airline | Departs | Price |\n|---|---|---|\n| TAP | 07:10 | €89 |\n| Ryanair | 13:45 | €74 |' },
    ],
  });
  h.addLegacySession(device, { title: 'Older chat', updatedMinutesAgo: 60 });

  await openChat(page, device, trip);
  await expect(headingOf(page)).toHaveText('Trip plan');
  const log = conversationOf(page);
  await expect(log.getByRole('article', { name: 'You' })).toHaveCount(1);
  await expect(log.getByRole('article', { name: 'Assistant' }).getByRole('table')).toBeVisible();
  await expect(log.getByRole('article', { name: 'Assistant' }).getByRole('cell', { name: 'Ryanair' })).toBeVisible();

  await page.reload();
  await expect(headingOf(page)).toHaveText('Trip plan');
  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' }).getByRole('table')).toBeVisible();

  const nav = chatNavOf(page);
  await openChatNav(page);
  await nav.getByRole('button', { name: 'Rename chat Trip plan' }).click();
  await page.getByRole('textbox', { name: 'Chat title' }).fill('Saved title');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(nav.getByRole('button', { name: 'Saved title', exact: true })).toBeVisible();

  await openChatNav(page);
  await nav.getByRole('button', { name: 'Delete chat Saved title' }).click();
  await expect(page.getByText('Delete this chat?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Saved title', exact: true })).toHaveCount(0);
  await openChatNav(page);
  await expect(nav.getByRole('button', { name: 'Older chat', exact: true })).toBeVisible();
});

test('AC1 streamed chunks and a final STREAM_DONE render as one assistant message', async ({ page }) => {
  const device = h.addDevice({ name: 'Studio laptop' });
  const chat = h.addLegacySession(device, { title: 'Streaming chat', messages: [{ role: 'user', text: 'Say hi' }] });
  await openChat(page, device, chat);
  await expect(messageArticles(page, 'You', 'Say hi')).toBeVisible();

  await composerOf(page).fill('Are you there?');
  await composerOf(page).press('Enter');
  await expect.poll(() => h.sent('SEND_MESSAGE', chat.id).length).toBe(1);

  await polled(h, chat.id);
  h.emit(chat.id, { type: 'STREAM_CHUNK', delta: 'Hel' });
  h.emit(chat.id, { type: 'STREAM_CHUNK', delta: 'lo' });
  const bubble = conversationOf(page).getByRole('article', { name: 'Assistant' });
  await expect(bubble).toHaveCount(1);
  await expect(bubble.getByText('Hello', { exact: true })).toBeVisible();
  await expect(stopOf(page)).toBeVisible();

  h.emit(chat.id, { type: 'STREAM_DONE', message: { role: 'assistant', content: 'Hello' } });
  await expect(stopOf(page)).toHaveCount(0);
  await expect(bubble).toHaveCount(1);
  await expect(bubble.getByText('Hello', { exact: true })).toBeVisible();
  await expect(sendOf(page)).toBeVisible();
});
