import fs from 'fs';
import { test as base, expect, type Page, type APIRequestContext, type Locator } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';
import { storageStatePath, hasClerkTestEnv } from '../fixtures/clerk-users';
import { hasSupabaseEnv } from '../fixtures/seed';
import {
  CHAT_DEVICE_NAME,
  RICH_CONVERSATION,
  createChatDevice,
  createChatSession,
  deleteChatDevice,
  emitFrame,
  listDeviceSessions,
  waitForDeviceFrame,
  type ChatDevice,
} from '../fixtures/chat-fixtures';
import { blockThirdParty } from './surface-helpers';

/**
 * Remote chat page (/chat?device=<apiKeyId>[&session=<id>]): the observable contract only.
 * Each test owns a fixture device (and its sessions); the device side of the relay is
 * simulated with emitFrame (device -> page) and waitForDeviceFrame (page -> device).
 */

const AUTH = storageStatePath('customer');
const FRAME_TIMEOUT = 15_000;

/**
 * Signed-in tests use the customer's session saved by the `setup` project (never signed out),
 * with a Clerk testing token per page so the 60s session token refreshes past bot protection.
 * No sign-in per worker: those hit Clerk's rate limit (429) when the suite runs twice in a row.
 */
const test = base.extend<{ clerkToken: void }>({
  storageState: AUTH,
  clerkToken: [
    async ({ page }, use) => {
      if (hasClerkTestEnv()) await setupClerkTestingToken({ page });
      await use();
    },
    { auto: true },
  ],
});

function chatUrl(device: ChatDevice, sessionId?: string): string {
  return `/chat?device=${encodeURIComponent(device.apiKeyId)}${sessionId ? `&session=${encodeURIComponent(sessionId)}` : ''}`;
}

async function openChat(page: Page, device: ChatDevice, sessionId?: string): Promise<void> {
  await blockThirdParty(page);
  await page.goto(chatUrl(device, sessionId), { timeout: 60_000 });
}

const conversation = (page: Page) => page.getByRole('log', { name: 'Conversation' });
const composer = (page: Page) => page.getByRole('textbox', { name: 'Message' });
const sendButton = (page: Page) => page.getByRole('button', { name: 'Send', exact: true });
const stopButton = (page: Page) => page.getByRole('button', { name: 'Stop', exact: true });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const sessionParam = (page: Page) => new URL(page.url()).searchParams.get('session');

/** Send `text` from the composer; returns the session id once the device inbox has it. */
async function sendAndAwaitDevice(page: Page, request: APIRequestContext, device: ChatDevice, text: string): Promise<string> {
  await composer(page).fill(text);
  await composer(page).press('Enter');
  await expect(conversation(page).getByRole('article', { name: 'You' }).filter({ hasText: text })).toBeVisible({ timeout: FRAME_TIMEOUT });
  await expect.poll(() => sessionParam(page), { timeout: FRAME_TIMEOUT }).not.toBeNull();
  const sessionId = sessionParam(page)!;
  const env = await waitForDeviceFrame(request, device, (e) => e.frame.type === 'SEND_MESSAGE' && e.frame.text === text);
  expect(env.sessionId).toBe(sessionId);
  return sessionId;
}

const TARGET_TOLERANCE_PX = 0.01;

async function expectMinTarget(loc: Locator, label: string): Promise<void> {
  await expect(loc, label).toBeVisible();
  const box = await loc.boundingBox();
  expect(box, `${label} has a box`).not.toBeNull();
  // Layout boxes are fractional (43.99998 for a 44px min-width under the mobile device scale), so
  // compare with a tolerance far below a visible pixel.
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44 - TARGET_TOLERANCE_PX);
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44 - TARGET_TOLERANCE_PX);
}

const APPROVAL_FRAME = (allowAlways = false) => ({
  type: 'ACTION_APPROVAL_REQUEST',
  actionId: 'act-1',
  action: {
    actionId: 'act-1',
    actionType: 'DELETE_WORKFLOW',
    target: 'wf-e2e',
    value: 'Delete workflow wf-e2e',
    reasoning: 'Clean up the test workflow',
    ...(allowAlways ? { allowAlways: true } : {}),
  },
});

const signedInReady = () => !hasClerkTestEnv() || !hasSupabaseEnv();

test.describe('chat surface (desktop)', () => {
  test.skip(signedInReady(), 'needs Clerk dev keys and Supabase service-role env');

  let device: ChatDevice | undefined;
  test.beforeEach(() => {
    test.skip(!fs.existsSync(AUTH), `missing ${AUTH} (run the setup project)`);
  });
  test.afterEach(async () => {
    await deleteChatDevice(device);
    device = undefined;
  });

  test.describe('header and presence', () => {
    test('new chat shows "New chat" heading and the device name', async ({ page }) => {
      device = await createChatDevice({ presence: 'online' });
      await openChat(page, device);
      await expect(heading(page)).toHaveText('New chat');
      await expect(page.getByText(CHAT_DEVICE_NAME).first()).toBeVisible();
    });

    // A request made while Clerk is still refreshing the 60s session token answers 401. That is a
    // failed load, not "no devices" and not "no chats": the page tries again.
    test('a 401 while the session refreshes is retried, not shown as "Connect your assistant"', async ({ page }) => {
      device = await createChatDevice();
      const sid = await createChatSession(device, { title: 'Trip plan' });
      for (const p of ['/api/plugin/devices', '/api/plugin/chat/sessions']) {
        let first = true;
        await page.route(
          (url) => url.pathname === p,
          (route) => {
            if (!first) return route.fallback();
            first = false;
            return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) });
          },
        );
      }
      await openChat(page, device, sid);
      await expect(heading(page)).toHaveText('Trip plan', { timeout: 10_000 });
      await expect(page.getByRole('heading', { name: 'Connect your assistant' })).toHaveCount(0);
      await expect(composer(page)).toBeVisible();
    });

    test('a 401 on the saved messages is retried: the conversation still shows', async ({ page }) => {
      device = await createChatDevice();
      const sid = await createChatSession(device, { title: 'Trip plan', messages: RICH_CONVERSATION });
      const path = `/api/plugin/chat/sessions/${sid}/messages`;
      const requests: string[] = [];
      let first = true;
      await page.route(
        (url) => url.pathname === path,
        (route) => {
          requests.push(route.request().url());
          if (!first) return route.fallback();
          first = false;
          return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) });
        },
      );
      await openChat(page, device, sid);
      const log = conversation(page);
      await expect(log).toContainText('Compare the two cheapest flights to Lisbon', { timeout: 10_000 });
      await expect(log.getByRole('article', { name: 'Assistant' }).getByRole('table')).toBeVisible({ timeout: 10_000 });
      expect(requests.length).toBeGreaterThanOrEqual(2);
    });

    test('an open chat shows its title as the heading', async ({ page }) => {
      device = await createChatDevice();
      const sid = await createChatSession(device, { title: 'Trip plan', messages: RICH_CONVERSATION });
      await openChat(page, device, sid);
      await expect(heading(page)).toHaveText('Trip plan');
    });

    test('presence online', async ({ page }) => {
      device = await createChatDevice({ presence: 'online' });
      await openChat(page, device);
      const status = page.getByRole('status').filter({ hasText: /Your assistant/ });
      await expect(status).toContainText('Your assistant is online');
      await expect(status).not.toContainText('offline');
      await expect(page.getByText('Messages will be delivered when your assistant reconnects.')).toHaveCount(0);
    });

    test('presence offline shows last seen and the delivery note', async ({ page }) => {
      device = await createChatDevice({ presence: 'offline' });
      await openChat(page, device);
      const status = page.getByRole('status').filter({ hasText: /Your assistant/ });
      await expect(status).toContainText('Your assistant is offline');
      await expect(status).toContainText('Last seen 25 min ago');
      await expect(status).not.toContainText('online');
      await expect(page.getByText('Messages will be delivered when your assistant reconnects.')).toBeVisible();
    });

    test('presence never connected shows the delivery note', async ({ page }) => {
      device = await createChatDevice({ presence: 'never' });
      await openChat(page, device);
      const status = page.getByRole('status').filter({ hasText: /Your assistant/ });
      await expect(status).toContainText("Your assistant hasn't connected yet");
      await expect(status).not.toContainText(/is (online|offline)/);
      await expect(page.getByText('Messages will be delivered when your assistant reconnects.')).toBeVisible();
    });
  });

  test.describe('chats drawer', () => {
    test('Chats navigation is visible without a click and lists chats newest first', async ({ page }) => {
      device = await createChatDevice();
      await createChatSession(device, { title: 'Older chat', updatedMinutesAgo: 30 });
      const sid = await createChatSession(device, { title: 'Trip plan', updatedMinutesAgo: 1 });
      await openChat(page, device, sid);
      const nav = page.getByRole('navigation', { name: 'Chats' });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('button', { name: 'New chat' })).toBeVisible();
      const trip = nav.getByRole('button', { name: 'Trip plan', exact: true });
      const older = nav.getByRole('button', { name: 'Older chat', exact: true });
      await expect(trip).toBeVisible();
      await expect(older).toBeVisible();
      await expect(trip).toHaveAttribute('aria-current', 'page');
      await expect(older).not.toHaveAttribute('aria-current', 'page');
      await expect(nav.getByRole('button', { name: 'Rename chat Trip plan' })).toBeVisible();
      await expect(nav.getByRole('button', { name: 'Delete chat Trip plan' })).toBeVisible();
      const tripY = (await trip.boundingBox())!.y;
      const olderY = (await older.boundingBox())!.y;
      expect(tripY).toBeLessThan(olderY);
    });

    test('clicking a chat opens it with its history', async ({ page }) => {
      device = await createChatDevice();
      const sid = await createChatSession(device, { title: 'Trip plan', messages: RICH_CONVERSATION, updatedMinutesAgo: 5 });
      await openChat(page, device);
      await expect(heading(page)).toHaveText('New chat');
      await page.getByRole('navigation', { name: 'Chats' }).getByRole('button', { name: 'Trip plan', exact: true }).click();
      await expect(heading(page)).toHaveText('Trip plan');
      await expect(conversation(page)).toContainText('Compare the two cheapest flights to Lisbon');
      await expect.poll(() => sessionParam(page)).toBe(sid);
    });

    test('rename persists (Enter)', async ({ page }) => {
      device = await createChatDevice();
      const sid = await createChatSession(device, { title: 'Trip plan' });
      await openChat(page, device, sid);
      const nav = page.getByRole('navigation', { name: 'Chats' });
      await nav.getByRole('button', { name: 'Rename chat Trip plan' }).click();
      const input = page.getByRole('textbox', { name: 'Chat title' });
      await expect(input).toHaveValue('Trip plan');
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
      await input.fill('Lisbon weekend');
      await input.press('Enter');
      await expect(nav.getByRole('button', { name: 'Lisbon weekend', exact: true })).toBeVisible();
      await expect(heading(page)).toHaveText('Lisbon weekend');
      await expect.poll(async () => (await listDeviceSessions(device!)).find((s) => s.id === sid)?.title).toBe('Lisbon weekend');
      await page.reload();
      await expect(page.getByRole('navigation', { name: 'Chats' }).getByRole('button', { name: 'Lisbon weekend', exact: true })).toBeVisible();
    });

    test('rename via Save; Escape and Cancel keep the old title', async ({ page }) => {
      device = await createChatDevice();
      const sid = await createChatSession(device, { title: 'Trip plan' });
      await openChat(page, device, sid);
      const nav = page.getByRole('navigation', { name: 'Chats' });

      await nav.getByRole('button', { name: 'Rename chat Trip plan' }).click();
      await page.getByRole('textbox', { name: 'Chat title' }).fill('Nope one');
      await page.getByRole('textbox', { name: 'Chat title' }).press('Escape');
      await expect(nav.getByRole('button', { name: 'Trip plan', exact: true })).toBeVisible();

      await nav.getByRole('button', { name: 'Rename chat Trip plan' }).click();
      await page.getByRole('textbox', { name: 'Chat title' }).fill('Nope two');
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(nav.getByRole('button', { name: 'Trip plan', exact: true })).toBeVisible();
      expect((await listDeviceSessions(device)).find((s) => s.id === sid)?.title).toBe('Trip plan');

      await nav.getByRole('button', { name: 'Rename chat Trip plan' }).click();
      await page.getByRole('textbox', { name: 'Chat title' }).fill('Saved title');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(nav.getByRole('button', { name: 'Saved title', exact: true })).toBeVisible();
      await expect.poll(async () => (await listDeviceSessions(device!)).find((s) => s.id === sid)?.title).toBe('Saved title');
    });

    test('delete: cancel keeps it, confirm removes the open chat', async ({ page }) => {
      device = await createChatDevice();
      const sid = await createChatSession(device, { title: 'Trip plan', messages: RICH_CONVERSATION });
      await openChat(page, device, sid);
      const nav = page.getByRole('navigation', { name: 'Chats' });

      await nav.getByRole('button', { name: 'Delete chat Trip plan' }).click();
      await expect(page.getByText('Delete this chat?')).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(nav.getByRole('button', { name: 'Trip plan', exact: true })).toBeVisible();
      expect((await listDeviceSessions(device)).map((s) => s.id)).toContain(sid);

      await nav.getByRole('button', { name: 'Delete chat Trip plan' }).click();
      await expect(page.getByText('Delete this chat?')).toBeVisible();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(nav.getByRole('button', { name: 'Trip plan', exact: true })).toHaveCount(0);
      await expect(heading(page)).toHaveText('New chat');
      await expect.poll(async () => (await listDeviceSessions(device!)).map((s) => s.id)).not.toContain(sid);
    });

    test('New chat empties the conversation', async ({ page }) => {
      device = await createChatDevice();
      const sid = await createChatSession(device, { title: 'Trip plan', messages: RICH_CONVERSATION });
      await openChat(page, device, sid);
      await expect(conversation(page)).toContainText('Compare the two cheapest flights');
      await page.getByRole('navigation', { name: 'Chats' }).getByRole('button', { name: 'New chat' }).click();
      await expect(heading(page)).toHaveText('New chat');
      await expect(conversation(page).getByRole('article')).toHaveCount(0);
      await expect(conversation(page)).toContainText(/send a message/i);
    });
  });

  test.describe('conversation and composer', () => {
    test('empty chat log is live and prompts to send a message', async ({ page }) => {
      device = await createChatDevice();
      await openChat(page, device);
      const log = conversation(page);
      await expect(log).toBeVisible();
      await expect(log).toHaveAttribute('aria-live', /.+/);
      await expect(log).toContainText(/send a message/i);
    });

    test('history renders as You/Assistant articles with markdown table and code', async ({ page }) => {
      device = await createChatDevice();
      const sid = await createChatSession(device, { title: 'Trip plan', messages: RICH_CONVERSATION });
      await openChat(page, device, sid);
      const log = conversation(page);
      await expect(log.getByRole('article', { name: 'You' })).toHaveCount(2);
      await expect(log.getByRole('article', { name: 'Assistant' })).toHaveCount(2);
      const table = log.getByRole('article', { name: 'Assistant' }).getByRole('table');
      await expect(table).toBeVisible();
      await expect(table.getByRole('cell', { name: 'Ryanair' })).toBeVisible();
      await expect(log.locator('pre code')).toContainText("const offers = await search");
    });

    test('Send is disabled when empty; Shift+Enter and Alt+Enter insert newlines', async ({ page }) => {
      device = await createChatDevice();
      await openChat(page, device);
      const box = composer(page);
      await expect(box).toBeVisible();
      await expect(sendButton(page)).toBeDisabled();
      await box.fill('line one');
      await expect(sendButton(page)).toBeEnabled();
      await box.press('Shift+Enter');
      await box.pressSequentially('line two');
      await expect(box).toHaveValue('line one\nline two');
      await box.fill('line one');
      await box.press('Alt+Enter');
      await box.pressSequentially('line two');
      await expect(box).toHaveValue('line one\nline two');
      await expect(conversation(page).getByRole('article', { name: 'You' })).toHaveCount(0);
    });

    test('attach, voice and read-aloud controls', async ({ page }) => {
      device = await createChatDevice();
      await openChat(page, device);
      await expect(page.getByRole('button', { name: 'Attach file' })).toBeVisible();
      const accept = await page.locator('input[type="file"]').first().getAttribute('accept');
      expect(accept ?? '').toContain('image/');
      await expect(page.getByRole('button', { name: 'Start voice input' })).toBeVisible();
      const speak = page.getByRole('button', { name: 'Read answers aloud' });
      await expect(speak).toHaveAttribute('aria-pressed', 'false');
      await speak.click();
      const mute = page.getByRole('button', { name: 'Mute spoken answers' });
      await expect(mute).toHaveAttribute('aria-pressed', 'true');
    });
  });

  test.describe('sending and streaming', () => {
    test.setTimeout(90_000);

    test('Enter sends: clears input, device receives it, chat appears in the list', async ({ page, request }) => {
      device = await createChatDevice();
      await openChat(page, device);
      const text = `Plan a day in Porto ${Date.now()}`;
      await composer(page).fill(text);
      await composer(page).press('Enter');
      await expect(composer(page)).toHaveValue('');
      await expect(conversation(page).getByRole('article', { name: 'You' }).filter({ hasText: text })).toBeVisible({ timeout: FRAME_TIMEOUT });
      await expect.poll(() => sessionParam(page), { timeout: FRAME_TIMEOUT }).not.toBeNull();
      const sid = sessionParam(page);
      const env = await waitForDeviceFrame(request, device, (e) => e.frame.type === 'SEND_MESSAGE' && e.frame.text === text);
      expect(env.sessionId).toBe(sid);
      await expect(page.getByRole('navigation', { name: 'Chats' }).getByRole('button', { name: text, exact: true })).toBeVisible({ timeout: FRAME_TIMEOUT });
    });

    test('streams chunks, swaps Stop/Send, and the answer survives reload', async ({ page, request }) => {
      device = await createChatDevice();
      await openChat(page, device);
      const sid = await sendAndAwaitDevice(page, request, device, `Say hello ${Date.now()}`);
      await expect(stopButton(page)).toBeVisible({ timeout: FRAME_TIMEOUT });
      await expect(sendButton(page)).toHaveCount(0);
      await emitFrame(request, device, sid, { type: 'STREAM_CHUNK', delta: 'Hello ' });
      await emitFrame(request, device, sid, { type: 'STREAM_CHUNK', delta: 'from the device' });
      const answer = conversation(page).getByRole('article', { name: 'Assistant' }).last();
      await expect(answer).toContainText('Hello from the device', { timeout: FRAME_TIMEOUT });
      await emitFrame(request, device, sid, {
        type: 'STREAM_DONE',
        inputTokens: 10,
        outputTokens: 5,
        message: { role: 'assistant', content: 'Hello from the device' },
      });
      await expect(stopButton(page)).toHaveCount(0, { timeout: FRAME_TIMEOUT });
      await expect(sendButton(page)).toBeVisible();
      await page.reload();
      await expect.poll(() => sessionParam(page)).toBe(sid);
      await expect(conversation(page).getByRole('article', { name: 'Assistant' })).toContainText('Hello from the device', { timeout: FRAME_TIMEOUT });
    });

    test('answer delivered only in STREAM_DONE is shown', async ({ page, request }) => {
      device = await createChatDevice();
      await openChat(page, device);
      const sid = await sendAndAwaitDevice(page, request, device, `Answer at the end ${Date.now()}`);
      await emitFrame(request, device, sid, {
        type: 'STREAM_DONE',
        inputTokens: 0,
        outputTokens: 0,
        message: { role: 'assistant', content: 'Only in done' },
      });
      await expect(conversation(page).getByRole('article', { name: 'Assistant' })).toContainText('Only in done', { timeout: FRAME_TIMEOUT });
    });

    test('Stop sends STOP_STREAM to the device', async ({ page, request }) => {
      device = await createChatDevice();
      await openChat(page, device);
      const sid = await sendAndAwaitDevice(page, request, device, `Long answer ${Date.now()}`);
      await emitFrame(request, device, sid, { type: 'STREAM_CHUNK', delta: 'Working on it' });
      await expect(stopButton(page)).toBeVisible({ timeout: FRAME_TIMEOUT });
      await stopButton(page).click();
      const env = await waitForDeviceFrame(request, device, (e) => e.frame.type === 'STOP_STREAM');
      expect(env.frame.type).toBe('STOP_STREAM');
    });
  });

  test.describe('approvals and forms', () => {
    test.setTimeout(90_000);

    test('approval request: Approve sends approve and shows Approved', async ({ page, request }) => {
      device = await createChatDevice();
      await openChat(page, device);
      const sid = await sendAndAwaitDevice(page, request, device, `Clean up ${Date.now()}`);
      await emitFrame(request, device, sid, APPROVAL_FRAME());
      const region = page.getByRole('region', { name: 'Approval needed' });
      await expect(region).toBeVisible({ timeout: FRAME_TIMEOUT });
      await expect(region).toContainText('DELETE_WORKFLOW');
      await expect(region).toContainText('wf-e2e');
      await expect(region).toContainText('Clean up the test workflow');
      for (const name of ['Approve', 'Deny', 'Guide me', 'Queue']) {
        await expect(region.getByRole('button', { name, exact: true })).toBeVisible();
      }
      await expect(region.getByRole('button', { name: 'Always allow' })).toHaveCount(0);
      await region.getByRole('button', { name: 'Approve', exact: true }).click();
      const env = await waitForDeviceFrame(request, device, (e) => e.frame.type === 'ACTION_APPROVAL_RESPONSE');
      expect(env.frame).toMatchObject({ type: 'ACTION_APPROVAL_RESPONSE', actionId: 'act-1', decision: 'approve' });
      await expect(region).toHaveCount(0);
      await expect(conversation(page)).toContainText('Approved');
    });

    test('approval request: Deny sends deny and shows Denied; allowAlways adds Always allow', async ({ page, request }) => {
      device = await createChatDevice();
      await openChat(page, device);
      const sid = await sendAndAwaitDevice(page, request, device, `Clean up ${Date.now()}`);
      await emitFrame(request, device, sid, APPROVAL_FRAME(true));
      const region = page.getByRole('region', { name: 'Approval needed' });
      await expect(region).toBeVisible({ timeout: FRAME_TIMEOUT });
      await expect(region.getByRole('button', { name: 'Always allow' })).toBeVisible();
      await region.getByRole('button', { name: 'Deny', exact: true }).click();
      const env = await waitForDeviceFrame(request, device, (e) => e.frame.type === 'ACTION_APPROVAL_RESPONSE');
      expect(env.frame).toMatchObject({ type: 'ACTION_APPROVAL_RESPONSE', actionId: 'act-1', decision: 'deny' });
      await expect(region).toHaveCount(0);
      await expect(conversation(page)).toContainText('Denied');
    });

    test('interactive form: Submit sends FORM_RESPONSE and echoes the answer', async ({ page, request }) => {
      device = await createChatDevice();
      await openChat(page, device);
      const sid = await sendAndAwaitDevice(page, request, device, `Book a trip ${Date.now()}`);
      await emitFrame(request, device, sid, {
        type: 'INTERACTIVE_FORM',
        form: { id: 'form-1', title: 'Trip details', steps: [{ title: 'Trip', fields: [{ id: 'city', type: 'text', label: 'City' }] }] },
      });
      const form = page.getByRole('region', { name: 'Trip details' });
      await expect(form).toBeVisible({ timeout: FRAME_TIMEOUT });
      await form.getByRole('textbox', { name: 'City' }).fill('Lisbon');
      await form.getByRole('button', { name: 'Submit' }).click();
      const env = await waitForDeviceFrame(request, device, (e) => e.frame.type === 'FORM_RESPONSE');
      expect(env.frame).toMatchObject({ type: 'FORM_RESPONSE', formId: 'form-1', data: { city: 'Lisbon' } });
      await expect(conversation(page).getByRole('article', { name: 'You' }).filter({ hasText: 'City: Lisbon' })).toBeVisible({ timeout: FRAME_TIMEOUT });
    });
  });

  test.describe('page policy', () => {
    test('no ads and robots noindex', async ({ page }) => {
      device = await createChatDevice();
      await openChat(page, device);
      await expect(composer(page)).toBeVisible();
      await expect(page.locator('ins.adsbygoogle')).toHaveCount(0);
      await expect(page.getByLabel(/advertisement/i)).toHaveCount(0);
      const robots = await page.locator('meta[name="robots"]').getAttribute('content');
      expect(robots ?? '').toContain('noindex');
    });
  });
});

test.describe('chat surface (mobile)', () => {
  test.skip(signedInReady(), 'needs Clerk dev keys and Supabase service-role env');
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  let device: ChatDevice | undefined;
  test.beforeEach(() => {
    test.skip(!fs.existsSync(AUTH), `missing ${AUTH} (run the setup project)`);
  });
  test.afterEach(async () => {
    await deleteChatDevice(device);
    device = undefined;
  });

  const chatsButton = (page: Page) => page.getByRole('button', { name: 'Chats', exact: true });
  const drawer = (page: Page) => page.getByRole('dialog', { name: 'Chats' });

  test('drawer is closed initially; Escape and Close chats close it and restore focus', async ({ page }) => {
    device = await createChatDevice();
    await createChatSession(device, { title: 'Trip plan' });
    await openChat(page, device);
    await expect(composer(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Chats' })).toBeHidden();
    const btn = chatsButton(page);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');

    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer(page)).toBeHidden();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toBeFocused();

    await btn.click();
    await expect(drawer(page)).toBeVisible();
    await drawer(page).getByRole('button', { name: 'Close chats' }).click();
    await expect(drawer(page)).toBeHidden();
    await expect(btn).toBeFocused();
  });

  test('picking a chat opens it and closes the drawer', async ({ page }) => {
    device = await createChatDevice();
    const sid = await createChatSession(device, { title: 'Trip plan', messages: RICH_CONVERSATION });
    await openChat(page, device);
    await chatsButton(page).click();
    await drawer(page).getByRole('button', { name: 'Trip plan', exact: true }).click();
    await expect(drawer(page)).toBeHidden();
    await expect(heading(page)).toHaveText('Trip plan');
    await expect(conversation(page)).toContainText('Compare the two cheapest flights');
    await expect.poll(() => sessionParam(page)).toBe(sid);
  });

  test('no horizontal scroll; composer sits at the bottom', async ({ page }) => {
    device = await createChatDevice();
    await openChat(page, device);
    await expect(composer(page)).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390);
    for (const [label, loc] of [['Message', composer(page)], ['Send', sendButton(page)]] as const) {
      const box = await loc.boundingBox();
      expect(box, label).not.toBeNull();
      expect(box!.x, `${label} left`).toBeGreaterThanOrEqual(0);
      expect(box!.y, `${label} top`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${label} right`).toBeLessThanOrEqual(390);
      expect(box!.y + box!.height, `${label} bottom`).toBeLessThanOrEqual(844);
      expect(box!.y + box!.height, `${label} near bottom`).toBeGreaterThanOrEqual(844 - 160);
    }
  });

  test('on-screen keyboard (viewport 390x500) keeps composer and last message visible', async ({ page }) => {
    device = await createChatDevice();
    const sid = await createChatSession(device, { title: 'Trip plan', messages: RICH_CONVERSATION });
    await openChat(page, device, sid);
    await expect(conversation(page).getByRole('article').last()).toContainText('Sure, this is the snippet');
    await composer(page).focus();
    await page.setViewportSize({ width: 390, height: 500 });
    await expect(async () => {
      const boxes: Record<string, { x: number; y: number; width: number; height: number } | null> = {
        Message: await composer(page).boundingBox(),
        Send: await sendButton(page).boundingBox(),
      };
      for (const [label, box] of Object.entries(boxes)) {
        expect(box, label).not.toBeNull();
        expect(box!.y, `${label} top`).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, `${label} right`).toBeLessThanOrEqual(390);
        expect(box!.y + box!.height, `${label} bottom`).toBeLessThanOrEqual(500);
      }
      const last = await conversation(page).getByRole('article').last().boundingBox();
      expect(last, 'last message').not.toBeNull();
      expect(last!.y + last!.height, 'last message intersects viewport').toBeGreaterThan(0);
      expect(last!.y, 'last message intersects viewport').toBeLessThan(500);
      expect(last!.y + last!.height, 'last message ends above composer').toBeLessThanOrEqual(boxes.Message!.y);
    }).toPass({ timeout: 5_000 });
  });

  test('touch targets are at least 44x44', async ({ page }) => {
    device = await createChatDevice();
    await createChatSession(device, { title: 'Trip plan' });
    await openChat(page, device);
    await composer(page).fill('x');
    await expectMinTarget(sendButton(page), 'Send');
    await expectMinTarget(page.getByRole('button', { name: 'Attach file' }), 'Attach file');
    await expectMinTarget(chatsButton(page), 'Chats');
    await chatsButton(page).click();
    await expectMinTarget(drawer(page).getByRole('button', { name: 'New chat' }), 'New chat');
    await expectMinTarget(drawer(page).getByRole('button', { name: 'Rename chat Trip plan' }), 'Rename chat');
    await expectMinTarget(drawer(page).getByRole('button', { name: 'Delete chat Trip plan' }), 'Delete chat');
  });

  test('approval buttons are at least 44x44', async ({ page, request }) => {
    test.setTimeout(90_000);
    device = await createChatDevice();
    await openChat(page, device);
    const sid = await sendAndAwaitDevice(page, request, device, `Clean up ${Date.now()}`);
    await emitFrame(request, device, sid, APPROVAL_FRAME());
    const region = page.getByRole('region', { name: 'Approval needed' });
    await expect(region).toBeVisible({ timeout: FRAME_TIMEOUT });
    await expectMinTarget(region.getByRole('button', { name: 'Approve', exact: true }), 'Approve');
    await expectMinTarget(region.getByRole('button', { name: 'Deny', exact: true }), 'Deny');
  });
});

base.describe('chat surface (signed out)', () => {
  base.use({ storageState: { cookies: [], origins: [] } });

  base('GET /chat is the public landing: what remote chat is, sign in, get the assistant; indexable, no ads', async ({ page }) => {
    await blockThirdParty(page);
    const res = await page.goto('/chat', { timeout: 60_000 });
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Talk to your assistant from anywhere' })).toBeVisible();
    const signIn = page.locator('#main').getByRole('link', { name: 'Sign in to chat' });
    await expect(signIn).toHaveAttribute('href', /^\/sign-in\?redirect_url=%2Fchat$/);
    await expect(page.locator('#main').getByRole('link', { name: 'Get the assistant' })).toHaveAttribute('href', '/docs');
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/chat$/);
    await expect(page.locator('[data-ad-slot], .ad-banner, ins.adsbygoogle')).toHaveCount(0);
  });

  base('the landing\'s Sign in goes to the hub sign-in and comes back to /chat', async ({ page }) => {
    await blockThirdParty(page);
    await page.goto('/chat', { timeout: 60_000 });
    await page.locator('#main').getByRole('link', { name: 'Sign in to chat' }).click();
    await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Fchat/);
  });
});
