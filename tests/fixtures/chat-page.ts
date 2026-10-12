/**
 * Signed-in chat page helpers for the a11y and visual specs.
 *
 * The `setup` project signs each E2E user out after saving tests/.auth/<role>.json,
 * which revokes that Clerk session (its 60s token then stops refreshing), so a run
 * longer than a minute lands on /sign-in. These specs sign the customer in once per
 * worker instead and reuse that live session.
 */
import fs from 'fs';
import path from 'path';
import { test as base, expect, type Page } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { E2E_USERS, hasClerkTestEnv } from './clerk-users';
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

export const test = base.extend<{ device: ChatDevice }, { customerState: string }>({
  customerState: [
    async ({ browser }, use, workerInfo) => {
      await clerkSetup();
      const file = path.join(workerInfo.project.outputDir, `.chat-auth-${workerInfo.workerIndex}.json`);
      const context = await browser.newContext({ baseURL: workerInfo.project.use.baseURL });
      try {
        const page = await context.newPage();
        await blockThirdParty(page);
        await page.goto('/', { timeout: 60_000 });
        await clerk.signIn({ page, emailAddress: E2E_USERS.customer.email });
        await page.goto('/', { timeout: 60_000 });
        await context.storageState({ path: file });
      } finally {
        await context.close();
      }
      await use(file);
      fs.rmSync(file, { force: true });
    },
    { scope: 'worker' },
  ],
  storageState: async ({ customerState }, use) => use(customerState),
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
