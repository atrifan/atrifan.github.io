import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN_USER,
  GIGS_ENV_MISSING,
  ROOM_TAB_IDS,
  newApi,
  openRoom,
  projectTag,
  roomPanel,
  roomScreenshotMasks,
  roomTab,
  seedRoomScenario,
  signIn,
  type RoomScenario,
  type RoomTabId,
} from '../support/gigs-ui';

/**
 * Visual baselines for every job room tab (customer view) in light/dark x desktop/mobile.
 *
 * The room is seeded per project with fixed texts (a fixed per-project word, the fixed
 * 1 Mar 2027 deadline): milestones, messages, a progress update, an answered
 * clarification and revision, an approved scope change (Version 2), a submission with
 * changes requested and a validated resubmission. Ids never reach the page text.
 * Masked: ad slots, Clerk widgets and every [data-volatile] (times that depend on now).
 */

test.skip(GIGS_ENV_MISSING, 'gigs e2e env not set');

const word = (tag: string) => `zqvr${tag}`;

async function shot(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot(name, { fullPage: true, mask: roomScreenshotMasks(page) });
}

/** Wait until the tab shows its seeded content. */
async function ready(page: Page, tab: RoomTabId, s: RoomScenario): Promise<void> {
  const panel = roomPanel(page);
  switch (tab) {
    case 'plan':
      await expect(panel).toContainText(s.texts.plan);
      await expect(panel).toContainText('Version 2');
      break;
    case 'status':
      await expect(page.getByRole('list', { name: 'Contract progress' })).toBeVisible();
      break;
    case 'activity':
      await expect(page.getByRole('list', { name: 'Activity' })).toContainText(s.texts.progressSummary);
      break;
    case 'artifacts':
      await expect(page.getByRole('list', { name: 'Submissions' }).getByRole('listitem')).toHaveCount(2);
      break;
    case 'milestones':
      await expect(panel).toContainText('1 of 3 done');
      break;
    case 'messages':
      await expect(page.getByRole('log', { name: 'Messages' })).toContainText(s.texts.providerMessage);
      break;
    case 'steering':
      await expect(page.getByRole('list', { name: 'Steering requests' })).toContainText(s.texts.clarificationAnswer);
      break;
    case 'qa':
      await expect(panel).toContainText(s.texts.qaReason);
      break;
    case 'delivery':
      await expect(page.locator('[data-slot="delivery"]')).toBeVisible();
      break;
  }
}

test.describe('job room', () => {
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

  for (const tab of ROOM_TAB_IDS) {
    test(`${tab} tab`, async ({ page, context }) => {
      await signIn(context, s.customer);
      await openRoom(page, s.contractId, tab);
      await expect(roomTab(page, tab)).toHaveAttribute('aria-selected', 'true');
      await ready(page, tab, s);
      await shot(page, `gigs-room-${tab}.png`);
    });
  }
});
