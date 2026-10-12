/**
 * Signed-in chat page helpers for the a11y and visual specs.
 *
 * They use the customer's session the `setup` project saved (tests/.auth/customer.json; it is
 * never signed out). A Clerk testing token on each page lets Clerk refresh its 60s session token
 * past bot protection. No sign-in per worker: those add up to Clerk's rate limit (429) when the
 * suite runs twice in a row.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { hasClerkTestEnv, storageStatePath } from './clerk-users';
import { hasSupabaseEnv } from './seed';
import {
  RICH_CONVERSATION,
  createChatDevice,
  createChatSession,
  deleteChatDevice,
  emitFrame,
  type ChatDevice,
} from './chat-fixtures';
import { blockThirdParty } from '../e2e/surface-helpers';

export const chatEnvReady = () => hasClerkTestEnv() && hasSupabaseEnv();

export const test = base.extend<{ device: ChatDevice; clerkToken: void }>({
  storageState: storageStatePath('customer'),
  clerkToken: [
    async ({ page }, use) => {
      if (hasClerkTestEnv()) await setupClerkTestingToken({ page });
      await use();
    },
    { auto: true },
  ],
  device: async ({}, use) => {
    const device = await createChatDevice({ presence: 'online' });
    await use(device);
    await deleteChatDevice(device);
  },
});

export { expect };

export type ChatState = 'empty' | 'conversation' | 'approval' | 'drawer';
export const CHAT_STATES: ChatState[] = ['empty', 'conversation', 'approval', 'drawer'];

/**
 * Open the chat in one of the reviewed states, with seeded relay data. The device
 * list is narrowed to this test's device so parallel workers' fixture devices don't
 * change the layout (a second device would add the device picker).
 */
export async function openChatState(page: Page, request: import('@playwright/test').APIRequestContext, device: ChatDevice, state: ChatState) {
  await blockThirdParty(page);
  await page.route('**/api/plugin/devices', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.devices = (body.devices as Array<{ id: string }>).filter((d) => d.id === device.apiKeyId);
    await route.fulfill({ response: res, json: body });
  });
  let sessionId: string | undefined;
  if (state !== 'empty') {
    await createChatSession(device, { title: 'Weekend in Lisbon', updatedMinutesAgo: 240, messages: [] });
    sessionId = await createChatSession(device, { title: 'Cheapest flights to Lisbon', updatedMinutesAgo: 120, messages: RICH_CONVERSATION });
  }
  const url = `/chat?device=${device.apiKeyId}${sessionId ? `&session=${sessionId}` : ''}`;
  await page.goto(url, { timeout: 60_000 });
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Your assistant is online' })).toBeVisible({ timeout: 20_000 });
  if (state === 'empty') {
    await expect(log).toContainText(/send a message/i);
    // The chats list has loaded (desktop sidebar).
    const nav = page.getByRole('navigation', { name: 'Chats' });
    if (await nav.isVisible()) await expect(nav).toContainText('No chats yet', { timeout: 15_000 });
  } else {
    await expect(log.getByRole('table')).toBeVisible({ timeout: 30_000 });
  }
  if (state === 'approval') {
    // Let the receive poll prime its cursor before the device emits.
    await page.waitForTimeout(2_500);
    await emitFrame(request, device, sessionId!, {
      type: 'ACTION_APPROVAL_REQUEST',
      actionId: 'act-visual',
      action: {
        actionId: 'act-visual',
        actionType: 'DELETE_WORKFLOW',
        target: 'wf-weekly-report',
        value: 'Delete workflow wf-weekly-report',
        reasoning: 'You asked me to remove the old weekly report workflow before creating the new one.',
      },
    });
    await expect(page.getByRole('region', { name: 'Approval needed' })).toBeVisible({ timeout: 15_000 });
  }
  if (state === 'drawer') {
    const toggle = page.getByRole('button', { name: 'Chats' });
    if (await toggle.isVisible()) {
      await toggle.click();
      await expect(page.getByRole('dialog', { name: 'Chats' })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: 'Chats' })).toBeVisible();
    }
  }
  // Settle: fonts, scroll position, the poll loop doesn't change the layout.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}
