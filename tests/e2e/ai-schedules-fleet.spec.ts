import { expect, fakeDevice, openAi, signedIn, test, text } from '../support/ai-fixtures';

test.describe('Schedules /ai/schedules', () => {
  signedIn();

  test.beforeEach(async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/schedules');
    await expect(text(page, 'Summarise my inbox')).toBeVisible();
  });

  test('lists schedules with cron and status', async ({ page, bridge }) => {
    await bridge.expectSent('SCHEDULE_LIST', {});
    await expect(text(page, '0 9 * * 1')).toBeVisible();
    await expect(text(page, 'Active')).toBeVisible();
    await expect(text(page, 'Post the daily digest')).toBeVisible();
    await expect(text(page, '30 18 * * *')).toBeVisible();
    await expect(text(page, 'Paused')).toBeVisible();
  });

  test('Pause and Resume', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Pause schedule: Summarise my inbox', exact: true }).click();
    await bridge.expectSent('SCHEDULE_PAUSE', { scheduleId: 'sch_1' });
    await expect(page.getByRole('button', { name: 'Resume schedule: Summarise my inbox', exact: true })).toBeVisible();
    await expect(page.getByText('Active', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Resume schedule: Post the daily digest', exact: true }).click();
    await bridge.expectSent('SCHEDULE_RESUME', { scheduleId: 'sch_2' });
    await expect(page.getByRole('button', { name: 'Pause schedule: Post the daily digest', exact: true })).toBeVisible();
  });

  test('Remove then Confirm remove', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Remove schedule: Post the daily digest', exact: true }).click();
    expect(bridge.callsOf('SCHEDULE_REMOVE')).toEqual([]);
    await page.getByRole('button', { name: 'Confirm remove', exact: true }).click();
    await bridge.expectSent('SCHEDULE_REMOVE', { scheduleId: 'sch_2' });
    await expect(page.getByText('Post the daily digest', { exact: true })).toHaveCount(0);
  });

  test('Run history lists runs, or says there are none', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Run history: Summarise my inbox', exact: true }).click();
    await bridge.expectSent('GET_SCHEDULE_RUNS', { scheduleId: 'sch_1' });
    await expect(text(page, '$0.12')).toBeVisible();
    await expect(text(page, '4 calls')).toBeVisible();

    await page.getByRole('button', { name: 'Run history: Post the daily digest', exact: true }).click();
    await bridge.expectSent('GET_SCHEDULE_RUNS', { scheduleId: 'sch_2' });
    await expect(text(page, 'No runs this month.')).toBeVisible();
  });

  test('Add schedule sends SCHEDULE_ADD and shows it', async ({ page, bridge }) => {
    await expect(page.getByRole('heading', { name: 'Add a schedule', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Cron expression', exact: true }).fill('0 7 * * *');
    await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Water the plants');
    await page.getByRole('button', { name: 'Add schedule', exact: true }).click();
    await bridge.expectSent('SCHEDULE_ADD', { cron: '0 7 * * *', prompt: 'Water the plants' });
    await expect(text(page, 'Water the plants')).toBeVisible();
  });

  for (const cron of ['0 7 * *', '0 7 * * * *']) {
    test(`cron "${cron}" is refused and nothing is sent`, async ({ page, bridge }) => {
      await page.getByRole('textbox', { name: 'Cron expression', exact: true }).fill(cron);
      await page.getByRole('textbox', { name: 'Prompt', exact: true }).fill('Water the plants');
      await page.getByRole('button', { name: 'Add schedule', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Cron needs 5 fields' })).toBeVisible();
      expect(bridge.callsOf('SCHEDULE_ADD')).toEqual([]);
    });
  }

  test('Reload declared schedules reports the counts', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Reload declared schedules', exact: true }).click();
    await bridge.expectSent('RELOAD_DECLARED_SCHEDULES', {});
    await expect(text(page, 'Reloaded: 1 added, 2 updated, 0 removed')).toBeVisible();
  });

  test('a failed change shows its error', async ({ page, bridge }) => {
    bridge.fail('SCHEDULE_PAUSE', 'Schedule is locked');
    await page.getByRole('button', { name: 'Pause schedule: Summarise my inbox', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Schedule is locked' })).toBeVisible();
  });
});

test.describe('Fleet /ai/fleet', () => {
  signedIn();

  test.beforeEach(async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/fleet');
    await expect(text(page, 'Reading inbox')).toBeVisible();
  });

  test('loads fleet, queue and browser status', async ({ page, bridge }) => {
    await bridge.expectSent('LIST_FLEET', {});
    await bridge.expectSent('LIST_QUEUE', {});
    await bridge.expectSent('DAEMON_BROWSER_STATUS', {});

    await expect(page.getByRole('heading', { name: 'Running now', exact: true })).toBeVisible();
    await expect(text(page, 'chat')).toBeVisible();
    await expect(text(page, 'researcher')).toBeVisible();
    await expect(text(page, 'running')).toBeVisible();
    await expect(text(page, /1,?200/)).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Queue', exact: true })).toBeVisible();
    await expect(text(page, '1 running · 1 waiting · 0 pending')).toBeVisible();
    await expect(text(page, 'Summarise my inbox')).toBeVisible();
    await expect(text(page, 'Draft a reply to Sam')).toBeVisible();
    await expect(text(page, 'waiting')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Headless browser', exact: true })).toBeVisible();
    await expect(text(page, 'Stopped')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop browser', exact: true })).toHaveCount(0);
  });

  test('Start then Stop the headless browser re-reads its status', async ({ page, bridge }) => {
    const before = bridge.callsOf('DAEMON_BROWSER_STATUS').length;
    await page.getByRole('button', { name: 'Start browser', exact: true }).click();
    await bridge.expectSent('DAEMON_BROWSER_START', {});
    await expect.poll(() => bridge.callsOf('DAEMON_BROWSER_STATUS').length).toBeGreaterThan(before);
    await expect(text(page, 'Running')).toBeVisible();

    const mid = bridge.callsOf('DAEMON_BROWSER_STATUS').length;
    await page.getByRole('button', { name: 'Stop browser', exact: true }).click();
    await bridge.expectSent('DAEMON_BROWSER_STOP', {});
    await expect.poll(() => bridge.callsOf('DAEMON_BROWSER_STATUS').length).toBeGreaterThan(mid);
    await expect(text(page, 'Stopped')).toBeVisible();
  });

  test('Refresh re-sends the three commands', async ({ page, bridge }) => {
    const commands = ['LIST_FLEET', 'LIST_QUEUE', 'DAEMON_BROWSER_STATUS'] as const;
    const before = commands.map((c) => bridge.callsOf(c).length);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    for (const [i, c] of commands.entries()) {
      await expect.poll(() => bridge.callsOf(c).length, { message: `${c} re-sent` }).toBeGreaterThan(before[i]);
    }
  });
});
