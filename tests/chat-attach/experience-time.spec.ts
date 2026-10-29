import { test, expect, type Page } from '@playwright/test';
import { ChatHarness, assertNoLeaks, chatNavOf, nativeRow, openChat, openChatNav, switchDevice } from '../support/chat-attach-fixture';

/**
 * AC16 Active polling cadence (fake clock), AC17 local-day grouping across DST, AC19 live timing fields.
 * The clock is test-owned: `page.clock` drives the 3s poll and fixed "now" values drive date groups.
 * Expected dates come from a test-local Intl calculation, not from product code.
 * Simulated device; frontend contract only.
 */
test.use({ timezoneId: 'America/New_York' });

let h: ChatHarness;

test.beforeEach(async ({ page }, testInfo) => {
  h = new ChatHarness(testInfo);
  h.annotate();
  await h.install(page);
});

test.afterEach(() => {
  assertNoLeaks(h);
});

/** Fixed "now": Sunday 2026-11-01 12:00 EST, the day after DST ends in New York. */
const NOW = Date.parse('2026-11-01T17:00:00Z');

/** Test-owned local calendar day index in New York time. */
function localDayIndex(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000;
}

/** Rolling windows: Today, Yesterday, then local-date difference 2–6 is This week, the rest is Older. */
function expectedGroup(nowMs: number, activityMs: number): 'Today' | 'Yesterday' | 'This week' | 'Older' {
  const diff = localDayIndex(nowMs) - localDayIndex(activityMs);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff <= 6) return 'This week';
  return 'Older';
}

const listCount = () => h.requests.filter((r) => r.method === 'GET' && r.path === '/api/plugin/chat/sessions' && !r.query.cursor).length;

/** A loopback round trip after a clock advance, so requests started by that advance are recorded. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => fetch('/__settle').catch(() => undefined));
}

async function openActive(page: Page): Promise<void> {
  await openChatNav(page);
  await page.getByRole('tab', { name: /^Active \(\d+\)$/ }).click();
}

test.describe('AC16 Active polling', () => {
  test('polls the advertised discovery source every 3 seconds while Active is selected', async ({ page }) => {
    await page.clock.install({ time: new Date(NOW) });
    const laptop = h.addDevice({ name: 'Studio laptop' });
    nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli' });
    h.setCatalog({ pageSize: 10, complete: true });
    await openChat(page, laptop);
    await openChatNav(page);
    const base = listCount();

    await openActive(page);
    await page.clock.runFor(3_000);
    await expect.poll(listCount).toBe(base + 1);
    await page.clock.runFor(3_000);
    await expect.poll(listCount).toBe(base + 2);
  });

  test('stops polling while History is selected', async ({ page }) => {
    await page.clock.install({ time: new Date(NOW) });
    const laptop = h.addDevice({ name: 'Studio laptop' });
    nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli' });
    h.setCatalog({ pageSize: 10, complete: true });
    await openChat(page, laptop);
    await openActive(page);
    const base = listCount();
    await page.clock.runFor(3_000);
    await expect.poll(listCount).toBe(base + 1);
    const before = listCount();

    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await page.clock.runFor(9_000);
    await settle(page);
    expect(listCount()).toBe(before);
  });

  test('stops polling while the document is hidden and resumes when visible', async ({ page }) => {
    await page.clock.install({ time: new Date(NOW) });
    const laptop = h.addDevice({ name: 'Studio laptop' });
    nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli' });
    h.setCatalog({ pageSize: 10, complete: true });
    await openChat(page, laptop);
    await openActive(page);
    const start = listCount();
    await page.clock.runFor(3_000);
    await expect.poll(listCount).toBe(start + 1);
    const visibleBase = listCount();

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(9_000);
    await settle(page);
    expect(listCount()).toBe(visibleBase);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(3_000);
    await expect.poll(listCount).toBe(visibleBase + 1);
  });

  test('a device change stops the old poll; the new device gets exactly one poll per interval', async ({ page }) => {
    await page.clock.install({ time: new Date(NOW) });
    const laptop = h.addDevice({ name: 'Studio laptop' });
    const desk = h.addDevice({ name: 'Desk mac' });
    nativeRow(h, laptop, { title: 'Laptop agent', state: 'running', surface: 'cli' });
    nativeRow(h, desk, { title: 'Desk agent', state: 'running', surface: 'tui' });
    h.setCatalog({ pageSize: 10, complete: true });
    await openChat(page, laptop);
    await openActive(page);
    await page.clock.runFor(3_000);
    await expect.poll(listCount).toBeGreaterThan(0);

    await switchDevice(page, desk);
    await openActive(page);
    const afterSwitch = listCount();
    await page.clock.runFor(3_000);
    await expect.poll(listCount).toBe(afterSwitch + 1);
    await settle(page);
    expect(listCount()).toBe(afterSwitch + 1);
  });

  test('an in-flight poll is not overlapped by another one', async ({ page }) => {
    await page.clock.install({ time: new Date(NOW) });
    const laptop = h.addDevice({ name: 'Studio laptop' });
    nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli' });
    h.setCatalog({ pageSize: 10, complete: true });
    await openChat(page, laptop);
    await openChatNav(page);

    const gate = h.hold('list');
    await page.getByRole('tab', { name: /^Active \(\d+\)$/ }).click();
    await gate.arrived;
    const parked = listCount();
    await page.clock.runFor(9_000);
    await settle(page);
    expect(listCount()).toBe(parked);

    gate.release();
    await gate.done;
    await page.clock.runFor(3_000);
    await expect.poll(listCount).toBe(parked + 1);
  });

  test('with no advertised catalog, Active does not poll a native-only source', async ({ page }) => {
    await page.clock.install({ time: new Date(NOW) });
    const laptop = h.addDevice({ name: 'Studio laptop' });
    nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli' });
    h.setCatalog(null);
    await openChat(page, laptop);
    await openActive(page);
    const base = listCount();
    await page.clock.runFor(9_000);
    await settle(page);
    expect(listCount()).toBe(base);
  });
});

test.describe('AC17 local-day grouping', () => {
  test('groups by last activity into Today, Yesterday, This week and Older, with DST-correct local days', async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    const laptop = h.addDevice({ name: 'Studio laptop' });
    const rows: Array<{ title: string; la?: string; created?: string; updated?: string }> = [
      { title: 'Morning today', la: '2026-11-01T09:00:00-05:00' },
      { title: 'Early today', la: '2026-11-01T00:30:00-05:00', created: '2026-10-01T08:00:00-04:00' },
      { title: 'Late Oct 31', la: '2026-10-31T23:30:00-04:00' },
      { title: 'Noon Oct 31', la: '2026-10-31T12:00:00-04:00' },
      { title: 'Thursday', la: '2026-10-29T10:00:00-04:00' },
      { title: 'Fallback updated', updated: '2026-10-27T10:00:00-04:00', created: '2026-08-01T10:00:00-04:00' },
      { title: 'Monday six days', la: '2026-10-26T10:00:00-04:00' },
      { title: 'Sunday seven days', la: '2026-10-25T10:00:00-04:00' },
    ];
    for (const r of rows) {
      h.addLegacySession(laptop, {
        title: r.title,
        row: {
          lastActivity: r.la ? Date.parse(r.la) : undefined,
          createdAt: r.created,
          updatedAt: r.updated,
        },
      });
    }
    await openChat(page, laptop);
    await openChatNav(page);
    const nav = chatNavOf(page);

    const headings = page.getByText(/^(Today|Yesterday|This week|Older)$/);
    await expect(headings).toHaveCount(4);
    const actual: Array<{ title: string; group: string; y: number }> = [];
    const headingBoxes: Array<{ name: string; y: number }> = [];
    for (let i = 0; i < 4; i++) {
      const box = await headings.nth(i).boundingBox();
      headingBoxes.push({ name: (await headings.nth(i).textContent())!, y: box!.y });
    }
    for (const r of rows) {
      const row = nav.getByRole('button', { name: r.title, exact: true });
      const y = (await row.boundingBox())!.y;
      const above = headingBoxes.filter((hb) => hb.y <= y).at(-1);
      actual.push({ title: r.title, group: above?.name ?? '', y });
    }
    for (const r of rows) {
      const activity = r.la ? Date.parse(r.la) : Date.parse((r.updated ?? r.created)!);
      const got = actual.find((a) => a.title === r.title)!;
      expect(got.group, `${r.title}`).toBe(expectedGroup(NOW, activity));
    }
    const expectedOrder = ['Morning today', 'Early today', 'Late Oct 31', 'Noon Oct 31', 'Thursday', 'Fallback updated', 'Monday six days', 'Sunday seven days'];
    expect([...actual].sort((a, b) => a.y - b.y).map((a) => a.title)).toEqual(expectedOrder);
  });

  test('an empty section is omitted', async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    const laptop = h.addDevice({ name: 'Studio laptop' });
    h.addLegacySession(laptop, { title: 'Just now', row: { lastActivity: Date.parse('2026-11-01T11:00:00-05:00') } });
    await openChat(page, laptop);
    await openChatNav(page);
    await expect(page.getByText('Today', { exact: true })).toBeVisible();
    await expect(page.getByText('Yesterday', { exact: true })).toHaveCount(0);
    await expect(page.getByText('This week', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Older', { exact: true })).toHaveCount(0);
  });

  test('the spring-forward week uses local days, not 24-hour durations', async ({ page }) => {
    const spring = Date.parse('2026-03-09T12:00:00-04:00');
    await page.clock.setFixedTime(new Date(spring));
    const laptop = h.addDevice({ name: 'Studio laptop' });
    h.addLegacySession(laptop, { title: 'Sunday late', row: { lastActivity: Date.parse('2026-03-08T23:45:00-04:00') } });
    h.addLegacySession(laptop, { title: 'Saturday noon', row: { lastActivity: Date.parse('2026-03-07T12:00:00-05:00') } });
    h.addLegacySession(laptop, { title: 'Last week', row: { lastActivity: Date.parse('2026-03-02T10:00:00-05:00') } });
    await openChat(page, laptop);
    await openChatNav(page);

    expect(expectedGroup(spring, Date.parse('2026-03-08T23:45:00-04:00'))).toBe('Yesterday');
    await expect(page.getByText('Yesterday', { exact: true })).toBeVisible();
    await expect(page.getByText('This week', { exact: true })).toBeVisible();
    await expect(page.getByText('Older', { exact: true })).toBeVisible();
    const nav = chatNavOf(page);
    const yBox = await nav.getByRole('button', { name: 'Sunday late', exact: true }).boundingBox();
    const sBox = await nav.getByRole('button', { name: 'Saturday noon', exact: true }).boundingBox();
    const lBox = await nav.getByRole('button', { name: 'Last week', exact: true }).boundingBox();
    expect(yBox!.y).toBeLessThan(sBox!.y);
    expect(sBox!.y).toBeLessThan(lBox!.y);
  });

  test('a row shows its local time for the last activity', async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    const laptop = h.addDevice({ name: 'Studio laptop' });
    h.addLegacySession(laptop, { title: 'Timed chat', row: { lastActivity: Date.parse('2026-11-01T09:00:00-05:00') } });
    await openChat(page, laptop);
    await openChatNav(page);
    await expect(chatNavOf(page).getByText(/9:00\s?AM/i)).toBeVisible();
  });
});

test.describe('AC19 live timing fields', () => {
  test('Active rows show started and last-output times relative to now', async ({ page }) => {
    await page.clock.setFixedTime(new Date(NOW));
    const laptop = h.addDevice({ name: 'Studio laptop' });
    nativeRow(h, laptop, {
      title: 'Timed agent',
      state: 'running',
      surface: 'cli',
      timing: { startedAt: NOW - 5 * 60_000, lastChunkAt: NOW - 30_000 },
    });
    await openChat(page, laptop);
    await openChatNav(page);
    await page.getByRole('tab', { name: /^Active \(\d+\)$/ }).click();

    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText(/started .*5 ?min/i)).toBeVisible();
    await expect(panel.getByText(/last output .*(30 ?s|just now)/i)).toBeVisible();
  });
});
