import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import {
  ChatHarness,
  assertNoLeaks,
  chatNavOf,
  conversationOf,
  composerOf,
  freshEventFrame,
  headingOf,
  latestWatch,
  msg,
  nativeRow,
  openChat,
  openChatNav,
  snapshotFrame,
  type FixtureDevice,
  type FixtureSession,
} from '../support/chat-attach-fixture';

/**
 * AC16 Active/History tabs, AC17 surface and snippet labels, AC18 attachment lifecycle, AC19 metadata
 * alignment, AC20 scope exclusions. Behavior-first: roles, names and observable frames only.
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

const tabActive = (page: Page) => page.getByRole('tab', { name: /^Active \(\d+\)$/ });
const tabHistory = (page: Page) => page.getByRole('tab', { name: 'History', exact: true });

async function openDrawer(page: Page): Promise<void> {
  await openChatNav(page);
}

/** Fixture rows used by several AC16 tests: running, waiting, idle, unknown native rows and one legacy chat. */
function seedMix(device: FixtureDevice): Record<string, FixtureSession> {
  return {
    running: nativeRow(h, device, { title: 'Build agent', state: 'running', surface: 'cli', row: { snippet: 'Compiling the importer' } }),
    waiting: nativeRow(h, device, { title: 'Review agent', state: 'waiting', surface: 'vscode', row: { snippet: 'Approve the deploy?' } }),
    idle: nativeRow(h, device, { title: 'Idle agent', state: 'idle', surface: 'telegram' }),
    unknown: nativeRow(h, device, { title: 'Mystery agent', state: 'unknown', surface: 'mystery' }),
    legacy: h.addLegacySession(device, { title: 'Trip plan' }),
  };
}

test('AC16 the drawer has an accessible Active and History tablist with History selected by default', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  seedMix(laptop);
  await openChat(page, laptop);
  await openDrawer(page);

  const tablist = page.getByRole('tablist');
  await expect(tablist.getByRole('tab')).toHaveCount(2);
  await expect(tabHistory(page)).toHaveAttribute('aria-selected', 'true');
  await expect(tabActive(page)).toHaveAttribute('aria-selected', 'false');
  const panel = page.getByRole('tabpanel');
  await expect(panel).toHaveAttribute('aria-labelledby', (await tabHistory(page).getAttribute('id')) ?? '__missing__');
  await expect(panel.getByRole('button', { name: 'Trip plan', exact: true })).toBeVisible();
});

test('AC16 arrow keys, Home and End move focus and selection across the tabs', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  seedMix(laptop);
  await openChat(page, laptop);
  await openDrawer(page);

  await tabHistory(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tabActive(page)).toBeFocused();
  await expect(tabActive(page)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tabHistory(page)).toBeFocused();
  await expect(tabHistory(page)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tabActive(page)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabHistory(page)).toHaveAttribute('aria-selected', 'true');
});

test('AC16 the Active count includes only known running and waiting conversations for this device', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const desk = h.addDevice({ name: 'Desk mac' });
  seedMix(laptop);
  nativeRow(h, desk, { title: 'Other device running', state: 'running' });
  await openChat(page, laptop);
  await openDrawer(page);

  await expect(tabActive(page)).toHaveText('Active (2)');
});

test('AC16 an Active panel with nothing running says so', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  h.addLegacySession(laptop, { title: 'Only history' });
  nativeRow(h, laptop, { title: 'Quiet agent', state: 'idle' });
  await openChat(page, laptop);
  await openDrawer(page);

  await tabActive(page).click();
  await expect(page.getByText('Nothing is running right now.', { exact: true })).toBeVisible();
});

test('AC16 Active rows show title, origin badge, live state and an explicit Attach action', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  seedMix(laptop);
  await openChat(page, laptop);
  await openDrawer(page);
  await tabActive(page).click();

  const panel = page.getByRole('tabpanel');
  await expect(panel.getByText('Build agent', { exact: true })).toBeVisible();
  await expect(panel.getByText('CLI', { exact: true })).toBeVisible();
  await expect(panel.getByText('Streaming', { exact: true })).toBeVisible();
  await expect(panel.getByText('Needs you', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Attach', exact: true })).toHaveCount(2);
  await expect(panel.getByText('Idle agent', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('Mystery agent', { exact: true })).toHaveCount(0);
});

test('AC16 Attach on an Active row opens that chat with one watch', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const run = nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli' });
  await openChat(page, laptop);
  await openDrawer(page);
  await tabActive(page).click();

  await page.getByRole('tabpanel').getByRole('button', { name: 'Attach', exact: true }).click();
  await expect(headingOf(page)).toHaveText('Build agent');
  await expect.poll(() => h.attaches(run.id).length).toBe(1);
  expect(h.legacyCreates()).toEqual([]);
});

test('AC16 the row for the chat already open shows This chat and Open, and never a second watch', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const run = nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli' });
  nativeRow(h, laptop, { title: 'Second agent', state: 'running', surface: 'tui' });
  await openChat(page, laptop, run);
  const w = await latestWatch(h, run.id);
  h.emit(run.id, snapshotFrame(w, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'l1', messages: [msg('m1', 1, 'user', 'Go')] }));
  await expect(headingOf(page)).toHaveText('Build agent');

  await openDrawer(page);
  await tabActive(page).click();
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByText('This chat', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Open', exact: true })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Attach', exact: true })).toHaveCount(1);
  expect(h.attaches(run.id)).toHaveLength(1);
});

test('AC16 Tab reaches the tablist and Enter activates the focused Attach action', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const run = nativeRow(h, laptop, { title: 'Keyboard agent', state: 'running', surface: 'cli' });
  await openChat(page, laptop);
  await openDrawer(page);

  await tabHistory(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tabActive(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const attach = page.getByRole('tabpanel').getByRole('button', { name: 'Attach', exact: true });
  await expect(attach).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(headingOf(page)).toHaveText('Keyboard agent');
  await expect.poll(() => h.attaches(run.id).length).toBe(1);
});

test('AC17 History rows show title, last-message snippet, origin badge and a genuine site chip only when supplied', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  h.addLegacySession(laptop, { title: 'Research notes', row: { snippet: 'Found three pricing pages', domain: 'example.com' } });
  h.addLegacySession(laptop, { title: 'No site chat', row: { snippet: 'Plain snippet' } });
  await openChat(page, laptop);
  await openDrawer(page);

  const nav = chatNavOf(page);
  await expect(nav.getByText('Found three pricing pages', { exact: true })).toBeVisible();
  await expect(nav.getByText('example.com', { exact: true })).toHaveCount(1);
  await expect(nav.getByText('Plain snippet', { exact: true })).toBeVisible();
  await expect(nav.getByText('Web chat', { exact: true })).toHaveCount(2);
  await expect(nav.getByText('No site chat', { exact: true })).toHaveCount(1);
});

test('AC17 a missing snippet or site never fabricates a preview from the title or native session id', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  nativeRow(h, laptop, { title: 'Quiet title', state: 'idle', nativeSessionId: 'native-quiet-id' });
  await openChat(page, laptop);
  await openDrawer(page);

  const nav = chatNavOf(page);
  await expect(nav.getByText('Quiet title', { exact: true })).toHaveCount(1);
  await expect(nav.getByText('native-quiet-id')).toHaveCount(0);
  await expect(nav.getByText('Unknown surface', { exact: true })).toHaveCount(0);
});

test('AC17 the drawer has no synthetic Other bucket', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  nativeRow(h, laptop, { title: 'Cli chat', state: 'idle', surface: 'cli' });
  await openChat(page, laptop);
  await openDrawer(page);

  await expect(page.getByText(/^Other/)).toHaveCount(0);
  await expect(page.getByText('Other (CLI/Telegram)')).toHaveCount(0);
});

const SURFACE_LABELS: Array<[string | null, string]> = [
  ['chrome', 'Panel'],
  ['panel', 'Panel'],
  ['cli', 'CLI'],
  ['tui', 'CLI'],
  ['stream', 'CLI'],
  ['telegram', 'Telegram'],
  ['schedule', 'Schedule'],
  ['scheduler', 'Schedule'],
  ['vscode', 'IDE'],
  ['jetbrains', 'IDE'],
  ['mystery', 'Mystery'],
  [null, 'Unknown surface'],
];

for (const [surface, label] of SURFACE_LABELS) {
  test(`AC17 surface ${surface ?? '(missing)'} is labelled ${label}`, async ({ page }) => {
    const laptop = h.addDevice({ name: 'Studio laptop' });
    nativeRow(h, laptop, { title: 'Labelled row', state: 'idle', surface });
    await openChat(page, laptop);
    await openDrawer(page);

    await expect(chatNavOf(page).getByText(label, { exact: true })).toBeVisible();
  });
}

test('AC18 after attaching, the banner names the surface session and Detach keeps the transcript read-only', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const run = nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli' });
  await openChat(page, laptop, run);
  const w = await latestWatch(h, run.id);
  h.emit(run.id, snapshotFrame(w, { through: 2, stateVersion: 'v1', state: 'running', loopId: 'l1', messages: [msg('m1', 1, 'user', 'Build it'), msg('m2', 2, 'assistant', 'Building now')] }));

  await expect(page.getByText('Attached to CLI session', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Detach', exact: true }).click();

  await expect.poll(() => h.sent('SESSION_DETACH', run.id).length).toBe(1);
  expect((h.sent('SESSION_DETACH', run.id)[0].body as { frame: { watchId: string } }).frame.watchId).toBe(w.watchId);
  await expect(conversationOf(page).getByRole('article').filter({ hasText: 'Building now' })).toBeVisible();
  await expect(headingOf(page)).toHaveText('Build agent');
  await expect(page.getByRole('button', { name: /^(Reattach|Attach again)$/ })).toBeVisible();
  await composerOf(page).fill('Still there?');
  await composerOf(page).press('Enter');
  expect(h.sent('SESSION_COMMAND')).toEqual([]);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
  expect(h.legacyCreates()).toEqual([]);
  expect(h.sent('SESSION_DETACH')).toHaveLength(1);
});

test('AC18 authoritative completion removes the streaming indication and keeps the finished text', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const run = nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli' });
  await openChat(page, laptop, run);
  const w = await latestWatch(h, run.id);
  h.emit(run.id, snapshotFrame(w, { through: 2, stateVersion: 'v1', state: 'running', loopId: 'l1', messages: [msg('m1', 1, 'user', 'Build it'), msg('m2', 2, 'assistant', 'Half done', true)] }));
  await expect(page.getByText('Streaming', { exact: true }).first()).toBeVisible();

  h.emit(run.id, freshEventFrame(w, 2, 3, { kind: 'message', message: msg('m2', 2, 'assistant', 'All done.', false) }));
  h.emit(run.id, freshEventFrame(w, 2, 4, { kind: 'state', stateVersion: 'v2', state: 'idle', loopId: null, pending: null }));

  await expect(page.getByText('Streaming', { exact: true })).toHaveCount(0);
  await expect(conversationOf(page).getByRole('article', { name: 'Assistant' }).filter({ hasText: 'All done.' })).toBeVisible();
});

test('AC18 a turn that already finished before attachment shows This turn already finished with its history and no new turn', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const run = nativeRow(h, laptop, { title: 'Done agent', state: 'running', surface: 'cli', timing: { loopId: 'loop-5' } });
  await openChat(page, laptop);
  await openDrawer(page);
  await tabActive(page).click();
  await page.getByRole('tabpanel').getByRole('button', { name: 'Attach', exact: true }).click();

  const w = await latestWatch(h, run.id);
  h.emit(
    run.id,
    snapshotFrame(w, { through: 3, stateVersion: 'v9', state: 'idle', loopId: null, messages: [msg('m1', 1, 'user', 'Run it'), msg('m2', 2, 'assistant', 'It finished.')] }),
  );

  await expect(page.getByText('This turn already finished', { exact: true })).toBeVisible();
  await expect(conversationOf(page).getByRole('article').filter({ hasText: 'It finished.' })).toBeVisible();
  expect(h.sent('SESSION_COMMAND')).toEqual([]);
  expect(h.sent('SEND_MESSAGE')).toEqual([]);
});

test('AC19 an invalid lastActivity falls back to the parseable updated_at and renders without crashing', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  h.addLegacySession(laptop, {
    title: 'Bad stamp chat',
    row: { lastActivity: 'not-a-number', updatedAt: '2026-10-29T10:00:00-04:00', createdAt: '2026-08-01T10:00:00-04:00' },
  });
  await openChat(page, laptop);
  await openDrawer(page);

  await expect(chatNavOf(page).getByRole('button', { name: 'Bad stamp chat', exact: true })).toBeVisible();
  await expect(page.getByText(/NaN|Invalid Date/)).toHaveCount(0);
});

test('AC19 a native row can announce its listing fields without a Rename or Delete action', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  nativeRow(h, laptop, { title: 'Read only agent', state: 'idle', surface: 'cli', row: { snippet: 'Done for now' } });
  await openChat(page, laptop);
  await openDrawer(page);

  await expect(chatNavOf(page).getByText('Done for now', { exact: true })).toBeVisible();
  await expect(chatNavOf(page).getByRole('button', { name: 'Rename chat Read only agent' })).toHaveCount(0);
  await expect(chatNavOf(page).getByRole('button', { name: 'Delete chat Read only agent' })).toHaveCount(0);
});

test('AC20 the drawer has no global search box, CLI alias picker or session picker', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  seedMix(laptop);
  await openChat(page, laptop);
  await openDrawer(page);

  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: /session|alias/i })).toHaveCount(0);
  await expect(page.getByText(/^\/sessions/)).toHaveCount(0);
});

test('AC19 and AC16 the drawer panels and the attached state have no serious or critical axe issues', async ({ page }) => {
  const laptop = h.addDevice({ name: 'Studio laptop' });
  const run = nativeRow(h, laptop, { title: 'Build agent', state: 'running', surface: 'cli', row: { snippet: 'Compiling' } });
  h.addLegacySession(laptop, { title: 'Trip plan', row: { snippet: 'Lisbon weekend', domain: 'example.com' } });
  await openChat(page, laptop, run);
  const w = await latestWatch(h, run.id);
  h.emit(run.id, snapshotFrame(w, { through: 1, stateVersion: 'v1', state: 'running', loopId: 'l1', messages: [msg('m1', 1, 'assistant', 'Compiling')] }));
  await openDrawer(page);

  const scan = async (label: string) => {
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.cl-footer').analyze();
    const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking, `${label}: ${blocking.map((v) => v.id).join(', ')}`).toEqual([]);
  };
  await scan('history panel');
  await tabActive(page).click();
  await scan('active panel');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
