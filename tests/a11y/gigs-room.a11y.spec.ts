import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN_USER,
  GIGS_ENV_MISSING,
  ROOM_TAB_IDS,
  createSteering,
  expectNoBlockingAxe,
  expectNoHorizontalScroll,
  newApi,
  openRoom,
  projectTag,
  roomPanel,
  roomTab,
  seedActiveContract,
  seedEstimatedScopeChange,
  seedRoomScenario,
  signIn,
  uid,
  type RoomScenario,
  type RoomTabId,
} from '../support/gigs-ui';

/**
 * axe (wcag2a + wcag2aa, serious/critical fail) and no horizontal scroll on every
 * job room tab (customer), the provider's Activity, Milestones and Steering tabs with
 * their forms, a scope change waiting for an estimate / for approval, and a delivered
 * room's Artifacts, QA and Delivery tabs, in light/dark x desktop/mobile.
 */

test.skip(GIGS_ENV_MISSING, 'gigs e2e env not set');

async function check(page: Page): Promise<void> {
  await expectNoBlockingAxe(page);
  await expectNoHorizontalScroll(page);
}

async function openTab(page: Page, contractId: string, tab: RoomTabId): Promise<void> {
  await openRoom(page, contractId, tab);
  await expect(roomTab(page, tab)).toHaveAttribute('aria-selected', 'true');
  await expect(roomPanel(page)).toBeVisible();
  await page.waitForTimeout(300);
}

const word = (tag: string) => `zqar${tag}`;

test.describe('job room: active contract', () => {
  test.describe.configure({ mode: 'default', timeout: 90_000 });
  let s: RoomScenario;

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(180_000);
    const api = await newApi(playwright, testInfo);
    try {
      s = await seedRoomScenario(api, word(projectTag(testInfo)), { openQuestion: true });
    } finally {
      await api.dispose();
    }
  });

  for (const tab of ROOM_TAB_IDS) {
    test(`customer: ${tab}`, async ({ page, context }) => {
      await signIn(context, s.customer);
      await openTab(page, s.contractId, tab);
      if (tab === 'steering') await expect(page.getByRole('textbox', { name: 'What do you need?' })).toBeVisible();
      if (tab === 'messages') await expect(page.getByRole('log', { name: 'Messages' })).toContainText(s.texts.providerMessage);
      await check(page);
    });
  }

  test('provider: activity with the progress form', async ({ page, context }) => {
    await signIn(context, s.provider);
    await openTab(page, s.contractId, 'activity');
    await expect(page.getByRole('textbox', { name: 'Progress update' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Activity' })).toContainText(s.texts.progressSummary);
    await check(page);
  });

  test('provider: milestones with status selects and the add form', async ({ page, context }) => {
    await signIn(context, s.provider);
    await openTab(page, s.contractId, 'milestones');
    await expect(page.getByRole('combobox', { name: `Status of ${s.texts.milestones[0]}` })).toBeVisible();
    await expect(page.getByLabel('Milestone title')).toBeVisible();
    await check(page);
  });

  test('provider: steering with an answer form', async ({ page, context }) => {
    await signIn(context, s.provider);
    await openTab(page, s.contractId, 'steering');
    await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeVisible();
    await check(page);
  });
});

test.describe('job room: scope change estimate', () => {
  test.describe.configure({ mode: 'default', timeout: 90_000 });
  const customer = uid('a11yscopecust');
  const provider = uid('a11yscopeprov');
  let estimated = '';
  let waiting = '';

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(150_000);
    const api = await newApi(playwright, testInfo);
    try {
      const title = `CSV importer for the ${word(projectTag(testInfo))} shop`;
      // one contract with a re-estimated scope change waiting for the customer...
      estimated = (await seedActiveContract(api, { customer, provider, title, plan: 'Plan.' })).contractId;
      await seedEstimatedScopeChange(api, { customer, provider, contractId: estimated }, {
        message: 'Also accept semicolon separated files.',
        specChanges: ['Accept semicolon separated files'],
        deltaCents: 5000,
        etaDays: 3,
        deliverableChanges: ['Sample semicolon file'],
      });
      // ...and one with a scope change waiting for the provider's estimate
      waiting = (await seedActiveContract(api, { customer, provider, title, plan: 'Plan.' })).contractId;
      await createSteering(api, customer, waiting, {
        message: 'Add an XLSX import.',
        requested_kind: 'scope_change',
        spec_changes: ['Import XLSX files'],
      });
    } finally {
      await api.dispose();
    }
  });

  test('customer: "New estimate" with Approve and Reject, work paused', async ({ page, context }) => {
    await signIn(context, customer);
    await openTab(page, estimated, 'steering');
    await expect(page.getByRole('heading', { name: 'New estimate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Work is paused' })).toBeVisible();
    await check(page);
  });

  test('provider: the estimate form', async ({ page, context }) => {
    await signIn(context, provider);
    await openTab(page, waiting, 'steering');
    await expect(page.getByLabel('Price change (€)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send estimate' })).toBeVisible();
    await check(page);
  });
});

test.describe('job room: delivered', () => {
  test.describe.configure({ mode: 'default', timeout: 90_000 });
  test.skip(!ADMIN_USER, 'QA_E2E_ADMIN_USER not set');
  let s: RoomScenario;

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(180_000);
    const api = await newApi(playwright, testInfo);
    try {
      s = await seedRoomScenario(api, word(projectTag(testInfo)), { deliver: true });
    } finally {
      await api.dispose();
    }
  });

  for (const tab of ['status', 'artifacts', 'qa', 'delivery'] as const) {
    test(`customer: ${tab}`, async ({ page, context }) => {
      await signIn(context, s.customer);
      await openTab(page, s.contractId, tab);
      if (tab === 'artifacts') await expect(page.getByRole('list', { name: 'Submissions' })).toBeVisible();
      if (tab === 'qa') await expect(roomPanel(page)).toContainText(s.texts.qaReason);
      if (tab === 'delivery') await expect(page.locator('[data-slot="delivery"]')).toBeVisible();
      await check(page);
    });
  }
});
