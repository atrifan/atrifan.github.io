import { test, expect } from '@playwright/test';
import {
  ChatHarness,
  assertNoLeaks,
  chatNavOf,
  headingOf,
  nativeRow,
  openChat,
  openChatNav,
  switchDevice,
} from '../support/chat-attach-fixture';

/**
 * AC2 — discovery: rows, source/state labels, ordering, optional catalog paging.
 * AC4 — actual plain payload (no native capability) shows the upgrade notice.
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

test('AC2 rows show title, source and native state, newest first, and other devices stay hidden', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const desk = h.addDevice({ name: 'Desk mac' });
  h.addLegacySession(laptop, { title: 'Trip plan', updatedMinutesAgo: 5 });
  nativeRow(h, laptop, { title: 'Running row', state: 'running', surface: 'Terminal', updatedMinutesAgo: 1 });
  nativeRow(h, laptop, { title: 'Waiting row', state: 'waiting', surface: 'Editor', updatedMinutesAgo: 2 });
  nativeRow(h, laptop, { title: 'Idle row', state: 'idle', surface: 'Terminal', updatedMinutesAgo: 3 });
  nativeRow(h, laptop, { title: 'Unknown row', state: 'unknown', surface: null, updatedMinutesAgo: 4 });
  nativeRow(h, desk, { title: 'Other device row', state: 'running', surface: 'Terminal', updatedMinutesAgo: 0 });

  await openChat(page, laptop);
  await openChatNav(page);
  const nav = chatNavOf(page);

  await expect(nav.getByRole('button', { name: 'Other device row', exact: true })).toHaveCount(0);
  for (const title of ['Running row', 'Waiting row', 'Idle row', 'Unknown row', 'Trip plan']) {
    await expect(nav.getByRole('button', { name: title, exact: true })).toBeVisible();
  }

  await expect(nav.getByText('Web chat', { exact: true })).toHaveCount(1);
  await expect(nav.getByText('Terminal', { exact: true })).toHaveCount(2);
  await expect(nav.getByText('Editor', { exact: true })).toHaveCount(1);
  await expect(nav.getByText('Unknown surface', { exact: true })).toHaveCount(1);
  await expect(nav.getByText('Running', { exact: true })).toHaveCount(1);
  await expect(nav.getByText('Waiting on you', { exact: true })).toHaveCount(1);
  await expect(nav.getByText('Idle', { exact: true })).toHaveCount(1);
  await expect(nav.getByText('Status unavailable', { exact: true })).toHaveCount(1);

  const order = ['Running row', 'Waiting row', 'Idle row', 'Unknown row', 'Trip plan'];
  const tops: number[] = [];
  for (const title of order) {
    const box = await nav.getByRole('button', { name: title, exact: true }).boundingBox();
    tops.push(box!.y);
  }
  expect(tops).toEqual([...tops].sort((a, b) => a - b));

  await expect(nav.getByRole('button', { name: 'Rename chat Running row' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Delete chat Running row' })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Rename chat Trip plan' })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Delete chat Trip plan' })).toBeVisible();
});

test('AC2 switching device shows only that device rows and its own state', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const desk = h.addDevice({ name: 'Desk mac' });
  h.addLegacySession(laptop, { title: 'Laptop chat' });
  nativeRow(h, desk, { title: 'Desk running', state: 'running', surface: 'Terminal' });

  await openChat(page, laptop);
  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('button', { name: 'Laptop chat', exact: true })).toBeVisible();
  await switchDevice(page, desk);
  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('button', { name: 'Desk running', exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: 'Laptop chat', exact: true })).toHaveCount(0);
});

test('AC2 an advertised next page loads more rows once and is shown as not all chats', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  // The fixture serves reverse insertion order: withhold Chat three until page 2.
  h.addLegacySession(laptop, { title: 'Chat three', updatedMinutesAgo: 3 });
  const one = h.addLegacySession(laptop, { title: 'Chat one', updatedMinutesAgo: 1 });
  h.sessions.push(one); // Repeat the same ID across pages to exercise unique merging.
  h.addLegacySession(laptop, { title: 'Chat two', updatedMinutesAgo: 2 });
  h.setCatalog({ pageSize: 2, complete: false });

  const firstResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/plugin/chat/sessions');
  await openChat(page, laptop);
  const firstPayload = await (await firstResponse).json();
  expect(firstPayload.sessions.map((row: { title: string }) => row.title)).toEqual(['Chat two', 'Chat one']);
  expect(firstPayload.catalog).toEqual({ version: 1, complete: false, nextCursor: 'i:2' });
  await openChatNav(page);
  const nav = chatNavOf(page);
  await expect(nav.getByRole('button', { name: 'Chat three', exact: true })).toHaveCount(0);
  await expect(page.getByText(/not all chats|may not show all|incomplete/i)).toBeVisible();

  const nextResponse = page.waitForResponse((response) => new URL(response.url()).searchParams.get('cursor') === 'i:2');
  await page.getByRole('button', { name: 'Load more chats', exact: true }).click();
  const nextPayload = await (await nextResponse).json();
  expect(nextPayload.sessions.map((row: { title: string }) => row.title)).toEqual(['Chat one', 'Chat three']);
  expect(nextPayload.catalog).toEqual({ version: 1, complete: false, nextCursor: null });
  await expect(nav.getByRole('button', { name: 'Chat three', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Chat one', exact: true })).toHaveCount(1);
  await expect(nav.getByRole('button', { name: 'Chat two', exact: true })).toHaveCount(1);
  await expect(nav.getByRole('button', { name: 'Chat three', exact: true })).toHaveCount(1);
  const tops = await Promise.all(['Chat one', 'Chat two', 'Chat three'].map(async (title) =>
    (await nav.getByRole('button', { name: title, exact: true }).boundingBox())!.y,
  ));
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  await expect(page.getByText(/not all chats|may not show all|incomplete/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more chats', exact: true })).toHaveCount(0);
  expect(h.requests.filter((r) => r.path === '/api/plugin/chat/sessions' && r.query.cursor).length).toBe(1);
});

test('AC2 a complete catalog does not claim it is incomplete', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  h.addLegacySession(laptop, { title: 'Chat one', updatedMinutesAgo: 1 });
  h.addLegacySession(laptop, { title: 'Chat two', updatedMinutesAgo: 2 });
  h.setCatalog({ pageSize: 10, complete: true });

  await openChat(page, laptop);
  await openChatNav(page);
  await expect(chatNavOf(page).getByRole('button', { name: 'Chat two', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more chats', exact: true })).toHaveCount(0);
  await expect(page.getByText(/not all chats|may not show all|incomplete/i)).toHaveCount(0);
});

test('AC4 a plain payload without native watch support shows the upgrade notice and no legacy fallback', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, {
    title: 'Plain payload row',
    state: 'running',
    caps: { watch: false, reply: false, answer: false, stop: false },
  });

  await openChat(page, laptop, row);
  await expect(
    page.getByText('Other assistant conversations are unavailable. This connection needs an assistant integration upgrade.'),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Message' }).fill('Try anyway');
  await page.getByRole('textbox', { name: 'Message' }).press('Enter');
  await expect.poll(() => h.sent('SESSION_COMMAND').length).toBe(0);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
  expect(h.legacyCreates()).toEqual([]);
  await expect(headingOf(page)).toHaveText('Plain payload row');
});

test('AC4 an active native row with no watch capability is never guessed as attached', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const row = nativeRow(h, laptop, { title: 'Old integration row', state: 'running', protocol: 2 });

  await openChat(page, laptop, row);
  await expect(
    page.getByText('Other assistant conversations are unavailable. This connection needs an assistant integration upgrade.'),
  ).toBeVisible();
  await expect.poll(() => h.sent('SESSION_ATTACH').length).toBe(0);
});
