import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import {
  ADMIN_USER,
  AD_SLOT,
  FIXED_DEADLINE_TEXT,
  GIGS_ENV_MISSING,
  ROOM_TAB_IDS,
  ROOM_TAB_NAMES,
  SUBMITTED_REPO,
  addMilestone,
  approveSteering,
  auth,
  createSteering,
  expectNoHorizontalScroll,
  expireTopupCheckout,
  getSteering,
  listRoomMessages,
  markQa,
  mockStripeCheckout,
  newApi,
  newProjectContext,
  openRoom,
  postRoomMessage,
  roomPanel,
  roomTab,
  seedActiveContract,
  seedContract,
  seedEstimatedScopeChange,
  sendProject,
  signIn,
  startQaReview,
  statusWith,
  uid,
  uniqueWord,
} from '../support/gigs-ui';
import { FAKE_SHA_HEAD } from '../support/fake-github';

// Behaviour-only UI tests for the gigs job room on /gigs/contracts/:id (tabs, plan and
// versions, status, activity and progress, artifacts, milestones, messages, steering,
// QA, delivery). Runs under `npm run test:e2e:gigs`.

test.skip(GIGS_ENV_MISSING, 'gigs e2e env not set');

const POLL = { timeout: 15_000 };
const CHECKOUT_URL = /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/;
const AUTHOR = /\b(You|Customer|Provider|Tulzo)\b/;
const SHORT_SHA = FAKE_SHA_HEAD.slice(0, 7);
const ARROW = '→';

type Seeded = Awaited<ReturnType<typeof seedContract>>;

function parties(prefix: string) {
  return { customer: uid(`${prefix}cust`), provider: uid(`${prefix}prov`) };
}

async function seedIn<T>(
  playwright: Parameters<typeof newApi>[0],
  testInfo: Parameters<typeof newApi>[1],
  fn: (api: APIRequestContext) => Promise<T>,
): Promise<T> {
  const api = await newApi(playwright, testInfo);
  try {
    return await fn(api);
  } finally {
    await api.dispose();
  }
}

/** The innermost element holding `text` together with an author label: one message in the log. */
function messageEntry(log: Locator, text: string): Locator {
  return log.locator('*').filter({ hasText: text }).filter({ hasText: AUTHOR }).last();
}

function messagesLog(page: Page): Locator {
  return page.getByRole('log', { name: 'Messages' });
}

function steeringItem(page: Page, text: string): Locator {
  return page.getByRole('list', { name: 'Steering requests' }).getByRole('listitem').filter({ hasText: text });
}

/** The "Version history" ordered list's own items (one per contract version). */
function versionItems(page: Page): Locator {
  return roomPanel(page).locator('ol').filter({ hasText: /\bVersion 1\b/ }).last().locator(':scope > li');
}

function versionItem(page: Page, n: number): Locator {
  return versionItems(page).filter({ hasText: new RegExp(`\\bVersion ${n}\\b`) });
}

function currentStep(page: Page): Locator {
  return page.getByRole('list', { name: 'Contract progress' }).locator('[aria-current="step"]');
}

async function goTab(page: Page, id: (typeof ROOM_TAB_IDS)[number]): Promise<void> {
  await roomTab(page, id).click();
  await expect(roomTab(page, id)).toHaveAttribute('aria-selected', 'true');
}

// ---------------------------------------------------------------------------
// 1. Shell: tabs, ?tab=, mobile, no ads, access control

test.describe('job room: tabs and access', () => {
  const { customer, provider } = parties('shell');
  const W = uniqueWord('room');
  const plan = `Room plan ${W}: stream, validate, test.`;
  let seeded: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    seeded = await seedIn(playwright, testInfo, (api) =>
      seedContract(api, { customer, provider, title: `Room job ${W}`, plan }),
    );
  });

  test('a "Job room" h2 with nine tabs in order; ?tab=<id> opens that tab with exactly one panel', async ({ page, context }) => {
    await signIn(context, customer);
    await openRoom(page, seeded.contractId);
    await expect(page.getByRole('heading', { level: 2, name: 'Job room' })).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Job room' }).getByRole('tab')).toHaveText(
      ROOM_TAB_IDS.map((id) => new RegExp(`^\\s*${ROOM_TAB_NAMES[id]}\\b`)),
    );
    for (const id of ROOM_TAB_IDS) {
      await openRoom(page, seeded.contractId, id);
      await expect(roomTab(page, id), id).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tab', { selected: true }), id).toHaveCount(1);
      await expect(roomPanel(page), id).toHaveCount(1);
      await expect(roomPanel(page), id).toBeVisible();
    }
  });

  test('clicking a tab updates ?tab= and arrow keys move the selection', async ({ page, context }) => {
    await signIn(context, customer);
    await openRoom(page, seeded.contractId);
    for (const id of ROOM_TAB_IDS) {
      await goTab(page, id);
      await expect.poll(() => new URL(page.url()).searchParams.get('tab'), { message: id }).toBe(id);
      await expect(roomPanel(page)).toHaveCount(1);
    }
    await roomTab(page, 'messages').focus();
    await page.keyboard.press('ArrowRight');
    await expect(roomTab(page, 'steering')).toBeFocused();
    await expect(roomTab(page, 'steering')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(roomTab(page, 'milestones')).toBeFocused();
    await expect(roomTab(page, 'milestones')).toHaveAttribute('aria-selected', 'true');
  });

  test('no ad slot on any tab', async ({ page, context }) => {
    await signIn(context, customer);
    await openRoom(page, seeded.contractId);
    for (const id of ROOM_TAB_IDS) {
      await goTab(page, id);
      await expect(page.locator(AD_SLOT), id).toHaveCount(0);
    }
  });

  test('mobile (390px): the same tablist scrolls inside itself, the page never scrolls sideways', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(context, customer);
    await openRoom(page, seeded.contractId);
    const tablist = page.getByRole('tablist', { name: 'Job room' });
    await expect(tablist.getByRole('tab')).toHaveCount(ROOM_TAB_IDS.length);
    const box = await tablist.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await expectNoHorizontalScroll(page);
    await roomTab(page, 'delivery').scrollIntoViewIfNeeded();
    await goTab(page, 'delivery');
    await expect(roomTab(page, 'delivery')).toBeInViewport();
    await expectNoHorizontalScroll(page);
    await goTab(page, 'plan');
    await expect(roomPanel(page)).toContainText(plan);
    await expectNoHorizontalScroll(page);
  });

  test('a stranger gets 404 on the page and 403 on the room API; an unknown id is 404', async ({ browser, request }, testInfo) => {
    const stranger = uid('roomstranger');
    const ctx = await newProjectContext(browser, testInfo, stranger);
    try {
      const p = await ctx.newPage();
      const res = await p.goto(`/gigs/contracts/${seeded.contractId}?tab=messages`);
      expect(res?.status()).toBe(404);
    } finally {
      await ctx.close();
    }
    for (const path of ['', '/messages', '/activity', '/milestones', '/steering', '/qa']) {
      const res = await request.get(`/api/contracts/${seeded.contractId}${path}`, { headers: auth(stranger) });
      expect(res.status(), path).toBe(403);
      const body = await res.json();
      expect(typeof body.error, path).toBe('string');
      expect(typeof body.message, path).toBe('string');
    }
    const post = await request.post(`/api/contracts/${seeded.contractId}/messages`, {
      headers: auth(stranger),
      data: { body: 'let me in' },
    });
    expect(post.status()).toBe(403);
    const unknown = await request.get('/api/contracts/00000000-0000-4000-8000-000000000001', { headers: auth(customer) });
    expect(unknown.status()).toBe(404);
    expect(typeof (await unknown.json()).error).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// 2. Plan and Status

test.describe('job room: plan and status', () => {
  const pending = parties('planpend');
  const active = parties('planact');
  const W = uniqueWord('plan');
  const plan = `Plan ${W}: stream the file, validate with a schema, add tests.`;
  let pendingContract: Seeded;
  let activeContract: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    await seedIn(playwright, testInfo, async (api) => {
      pendingContract = await seedContract(api, { ...pending, title: `Plan job ${W}`, plan });
      activeContract = await seedActiveContract(api, { ...active, title: `Plan active job ${W}`, plan });
    });
  });

  for (const role of ['customer', 'provider'] as const) {
    test(`${role}: Plan shows the bid plan, current terms and a one-version history`, async ({ page, context }) => {
      await signIn(context, pending[role]);
      await openRoom(page, pendingContract.contractId, 'plan');
      const panel = roomPanel(page);
      await expect(panel).toContainText(plan);
      await expect(panel.getByRole('heading', { name: 'Current terms' })).toBeVisible();
      await expect(panel).toContainText('Price');
      await expect(panel).toContainText('€300');
      await expect(panel).toContainText('Deadline');
      await expect(panel).toContainText(FIXED_DEADLINE_TEXT);
      await expect(panel).toContainText('Version 1');
      await expect(panel.getByRole('heading', { name: 'Version history' })).toBeVisible();
      await expect(versionItems(page)).toHaveCount(1);
      await expect(versionItem(page, 1)).toContainText('Current');
    });
  }

  test('Status before payment: "Awaiting payment", progress steps with "Paid" current, deadline', async ({ page, context }) => {
    await signIn(context, pending.customer);
    await openRoom(page, pendingContract.contractId, 'status');
    const panel = roomPanel(page);
    await expect(panel).toContainText('Awaiting payment');
    const steps = page.getByRole('list', { name: 'Contract progress' }).getByRole('listitem');
    await expect(steps).toHaveText([/Paid/, /In progress/, /In QA/, /Delivered/, /Completed/]);
    await expect(currentStep(page)).toHaveCount(1);
    await expect(currentStep(page)).toContainText('Paid');
    await expect(panel).toContainText('Deadline');
    await expect(panel).toContainText(FIXED_DEADLINE_TEXT);
  });

  for (const role of ['customer', 'provider'] as const) {
    test(`${role}: Status after payment reads "In progress" with that step current`, async ({ page, context }) => {
      await signIn(context, active[role]);
      await openRoom(page, activeContract.contractId, 'status');
      await expect(roomPanel(page)).toContainText('In progress');
      await expect(currentStep(page)).toHaveCount(1);
      await expect(currentStep(page)).toContainText('In progress');
      await expect(page.getByRole('status').filter({ hasText: 'Work is paused' })).toHaveCount(0);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Activity and progress updates

test.describe('job room: activity and progress updates', () => {
  test.describe.configure({ timeout: 120_000 });
  const p = parties('activity');
  const W = uniqueWord('activity');
  let c: Seeded;
  let pendingC: Seeded;
  const pendingParties = parties('actpend');

  test.beforeAll(async ({ playwright }, testInfo) => {
    await seedIn(playwright, testInfo, async (api) => {
      c = await seedActiveContract(api, { ...p, title: `Activity job ${W}`, plan: 'Activity plan.' });
      pendingC = await seedContract(api, { ...pendingParties, title: `Activity pending ${W}`, plan: 'Pending plan.' });
    });
  });

  test('customer: an Activity list and no progress form', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'activity');
    await expect(page.getByRole('list', { name: 'Activity' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Activity' }).getByRole('listitem').first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Progress update' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Post update' })).toHaveCount(0);
  });

  test('provider: no progress form before the contract is paid', async ({ page, context }) => {
    await signIn(context, pendingParties.provider);
    await openRoom(page, pendingC.contractId, 'activity');
    await expect(page.getByRole('list', { name: 'Activity' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Progress update' })).toHaveCount(0);
  });

  test('provider posts an update: summary in Activity (customer sees it without reload), details only in Messages', async ({
    page,
    context,
    browser,
  }, testInfo) => {
    const summary = `Parser done ${W}`;
    const details = `Details ${W}: streams a 10 MB file in under a second.`;

    const customerCtx = await newProjectContext(browser, testInfo, p.customer);
    try {
      const customerPage = await customerCtx.newPage();
      await openRoom(customerPage, c.contractId, 'activity');
      await expect(customerPage.getByRole('list', { name: 'Activity' })).toBeVisible();
      await expect(customerPage.getByRole('list', { name: 'Activity' })).not.toContainText(summary);

      await signIn(context, p.provider);
      await openRoom(page, c.contractId, 'activity');
      await page.getByRole('textbox', { name: 'Progress update' }).fill(summary);
      await page.getByRole('textbox', { name: 'Details' }).fill(details);
      await page.getByRole('button', { name: 'Post update' }).click();

      const providerActivity = page.getByRole('list', { name: 'Activity' });
      await expect(providerActivity).toContainText(summary);
      // oldest first: the new update is the last entry
      await expect(providerActivity.getByRole('listitem').last()).toContainText(summary);
      await expect(providerActivity).not.toContainText(details);

      const customerActivity = customerPage.getByRole('list', { name: 'Activity' });
      await expect(customerActivity).toContainText(summary, POLL);
      await expect(customerActivity).not.toContainText(details);

      for (const viewer of [page, customerPage]) {
        await goTab(viewer, 'messages');
        const log = messagesLog(viewer);
        await expect(log).toContainText(details, POLL);
        const entry = messageEntry(log, details);
        await expect(entry).toContainText('Progress update');
        await expect(entry).toContainText(summary);
      }
      await expect(messageEntry(messagesLog(customerPage), details)).toContainText('Provider');
    } finally {
      await customerCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Messages: authors, polling, optimistic send, failure + retry

test.describe('job room: messages', () => {
  test.describe.configure({ timeout: 90_000 });
  const p = parties('msgs');
  const W = uniqueWord('msgs');
  let c: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    c = await seedIn(playwright, testInfo, (api) => seedActiveContract(api, { ...p, title: `Messages job ${W}`, plan: 'Plan.' }));
  });

  test('a message the provider posts appears for the customer within ~10 s, labelled "Provider"', async ({
    page,
    context,
    request,
  }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'messages');
    const log = messagesLog(page);
    await expect(log).toBeVisible();
    const body = `From the provider ${uniqueWord('poll')}`;
    await expect(log).not.toContainText(body);
    await postRoomMessage(request, p.provider, c.contractId, body);
    await expect(log).toContainText(body, POLL);
    await expect(messageEntry(log, body)).toContainText('Provider');
  });

  test('send: shows "Sending…" at once, loses it when confirmed; author is "You", the provider sees "Customer"', async ({
    page,
    context,
    browser,
  }, testInfo) => {
    const body = `Optimistic hello ${uniqueWord('opt')}`;
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'messages');
    const posts = new RegExp(`/api/contracts/${c.contractId}/messages(\\?|$)`);
    await page.route(posts, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await new Promise((r) => setTimeout(r, 2_000));
      return route.continue();
    });
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill(body);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const log = messagesLog(page);
    await expect(log).toContainText(body, { timeout: 1_500 });
    await expect(messageEntry(log, body)).toContainText(/Sending(…|\.\.\.)/, { timeout: 1_500 });
    await expect(messageEntry(log, body)).not.toContainText(/Sending(…|\.\.\.)/, POLL);
    await expect(messageEntry(log, body)).toContainText('You');
    await page.unroute(posts);

    const providerCtx = await newProjectContext(browser, testInfo, p.provider);
    try {
      const pp = await providerCtx.newPage();
      await openRoom(pp, c.contractId, 'messages');
      await expect(messagesLog(pp)).toContainText(body);
      await expect(messageEntry(messagesLog(pp), body)).toContainText('Customer');
    } finally {
      await providerCtx.close();
    }
  });

  test('a failed send shows "Not sent" and "Retry", which resends it once', async ({ page, context, request }) => {
    const body = `Flaky network ${uniqueWord('retry')}`;
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'messages');
    const posts = new RegExp(`/api/contracts/${c.contractId}/messages(\\?|$)`);
    await page.route(posts, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'server_error', message: 'Something went wrong' }),
          })
        : route.continue(),
    );
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill(body);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const log = messagesLog(page);
    await expect(messageEntry(log, body)).toContainText('Not sent');
    const retry = page.getByRole('button', { name: 'Retry' });
    await expect(retry).toBeVisible();
    expect((await listRoomMessages(request, p.customer, c.contractId)).filter((m) => m.body === body)).toHaveLength(0);

    await page.unroute(posts);
    await retry.click();
    await expect(messageEntry(log, body)).not.toContainText('Not sent', POLL);
    await expect(messageEntry(log, body)).not.toContainText(/Sending(…|\.\.\.)/, POLL);
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await expect
      .poll(async () => (await listRoomMessages(request, p.customer, c.contractId)).filter((m) => m.body === body).length)
      .toBe(1);

    await page.reload();
    await expect(messagesLog(page)).toContainText(body);
    await expect(messageEntry(messagesLog(page), body)).not.toContainText('Not sent');
  });

  test('message times are marked data-volatile', async ({ page, context, request }) => {
    // Tests in this file can run in separate workers (each with its own beforeAll seed), so
    // don't rely on messages another test posted.
    await postRoomMessage(request, p.customer, c.contractId, `Timestamp check ${uniqueWord('vol')}`);
    await signIn(context, p.provider);
    await openRoom(page, c.contractId, 'messages');
    await expect(messagesLog(page).getByText(AUTHOR).first()).toBeVisible();
    expect(await messagesLog(page).locator('[data-volatile]').count()).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Milestones

test.describe('job room: milestones', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });
  const p = parties('miles');
  const W = uniqueWord('miles');
  const seededTitle = `Row validation ${W}`;
  const addedTitle = `Schema and parser ${W}`;
  let c: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    c = await seedIn(playwright, testInfo, async (api) => {
      const s = await seedActiveContract(api, { ...p, title: `Milestones job ${W}`, plan: 'Plan.' });
      await addMilestone(api, p.provider, s.contractId, seededTitle, 'in_progress');
      return s;
    });
  });

  function milestone(page: Page, title: string): Locator {
    return page.getByRole('list', { name: 'Milestones' }).getByRole('listitem').filter({ hasText: title });
  }

  test('provider adds a milestone and changes statuses; the count and labels follow and persist', async ({ page, context, request }) => {
    await signIn(context, p.provider);
    await openRoom(page, c.contractId, 'milestones');
    const panel = roomPanel(page);
    await expect(milestone(page, seededTitle)).toContainText('In progress');
    await expect(panel).toContainText('0 of 1 done');

    await page.getByLabel('Milestone title').fill(addedTitle);
    await page.getByRole('button', { name: 'Add milestone' }).click();
    await expect(milestone(page, addedTitle)).toContainText('Not started');
    await expect(panel).toContainText('0 of 2 done');

    const select = page.getByRole('combobox', { name: `Status of ${addedTitle}` });
    await expect(select.locator('option')).toHaveText(['Not started', 'In progress', 'Done', 'Blocked']);
    await select.selectOption({ label: 'Done' });
    await expect(panel).toContainText('1 of 2 done');
    await page.getByRole('combobox', { name: `Status of ${seededTitle}` }).selectOption({ label: 'Blocked' });
    await expect(milestone(page, seededTitle)).toContainText('Blocked');

    await expect
      .poll(async () => {
        const res = await request.get(`/api/contracts/${c.contractId}/milestones`, { headers: auth(p.customer) });
        const list = ((await res.json()).milestones ?? []) as Array<{ title: string; status: string }>;
        return list.map((m) => `${m.title}=${m.status}`).sort();
      })
      .toEqual([`${addedTitle}=done`, `${seededTitle}=blocked`].sort());

    await page.reload();
    await expect(roomTab(page, 'milestones')).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toContainText('1 of 2 done');
    await expect(page.getByRole('combobox', { name: `Status of ${addedTitle}` })).toHaveValue('done');
  });

  test('customer: read-only list with labels, no selects and no add form', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'milestones');
    const panel = roomPanel(page);
    await expect(panel).toContainText('1 of 2 done');
    await expect(milestone(page, addedTitle)).toContainText('Done');
    await expect(milestone(page, seededTitle)).toContainText('Blocked');
    await expect(panel.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByLabel('Milestone title')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add milestone' })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Steering

async function sendSteering(
  page: Page,
  input: { message: string; type?: 'Let Tulzo decide' | 'Clarification' | 'Revision' | 'Scope change'; specChanges?: string[]; newPrice?: string },
): Promise<void> {
  await page.getByRole('textbox', { name: 'What do you need?' }).fill(input.message);
  if (input.type) await page.getByRole('combobox', { name: 'Type' }).selectOption({ label: input.type });
  if (input.specChanges) await page.getByLabel('Spec changes (one per line)').fill(input.specChanges.join('\n'));
  if (input.newPrice) await page.getByLabel('New price (€)').fill(input.newPrice);
  await page.getByRole('button', { name: 'Send request' }).click();
}

test.describe('job room: steering clarification', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });
  const p = parties('clar');
  const W = uniqueWord('clar');
  const question = `Should empty rows be skipped ${W}?`;
  const plainQuestion = `Which Postgres version do you target ${W}?`;
  const answer = `Yes, skipped and counted ${W}.`;
  let c: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    c = await seedIn(playwright, testInfo, (api) => seedActiveContract(api, { ...p, title: `Clarification job ${W}`, plan: 'Plan.' }));
  });

  test('customer: the form, credits, and a clarification classified "Clarification, free"', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    await expect(roomPanel(page)).toContainText('Steering credits: 2 of 2 left');
    await expect(page.getByRole('combobox', { name: 'Type' }).locator('option')).toHaveText([
      'Let Tulzo decide',
      'Clarification',
      'Revision',
      'Scope change',
    ]);
    await sendSteering(page, { message: question, type: 'Clarification' });
    await expect(statusWith(page, 'Clarification, free')).toBeVisible();
    const item = steeringItem(page, question);
    await expect(item).toContainText('Clarification, free');
    await expect(item).toContainText('Waiting for an answer');

    // "Let Tulzo decide" with a plain question is a clarification too
    await sendSteering(page, { message: plainQuestion, type: 'Let Tulzo decide' });
    await expect(steeringItem(page, plainQuestion)).toContainText('Clarification, free');
    await expect(roomPanel(page)).toContainText('Steering credits: 2 of 2 left');
    await expect(page.getByRole('status').filter({ hasText: 'Work is paused' })).toHaveCount(0);
  });

  test('provider: no create form; answers the clarification', async ({ page, context }) => {
    await signIn(context, p.provider);
    await openRoom(page, c.contractId, 'steering');
    await expect(page.getByRole('textbox', { name: 'What do you need?' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send request' })).toHaveCount(0);
    const item = steeringItem(page, question);
    await expect(item).toContainText('Clarification, free');
    await item.getByRole('textbox', { name: 'Your answer' }).fill(answer);
    await item.getByRole('button', { name: 'Send answer' }).click();
    await expect(item).toContainText('Answered');
    await expect(item).toContainText(answer);
    await expect(item.getByRole('textbox', { name: 'Your answer' })).toHaveCount(0);
  });

  test('customer: sees the answer, credits unchanged', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    const item = steeringItem(page, question);
    await expect(item).toContainText('Answered');
    await expect(item).toContainText(answer);
    await expect(roomPanel(page)).toContainText('Steering credits: 2 of 2 left');
  });
});

test.describe('job room: steering revision', () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });
  const p = parties('rev');
  const W = uniqueWord('rev');
  const ask = `Please rename the error column to reason ${W}.`;
  const answer = `Renamed ${W}.`;
  let c: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    c = await seedIn(playwright, testInfo, (api) => seedActiveContract(api, { ...p, title: `Revision job ${W}`, plan: 'Plan.' }));
  });

  test('customer: a revision says it uses 1 of the 2 credits', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    await expect(roomPanel(page)).toContainText('Steering credits: 2 of 2 left');
    await sendSteering(page, { message: ask, type: 'Revision' });
    await expect(statusWith(page, 'Revision, uses 1 of your 2 steering credits')).toBeVisible();
    const item = steeringItem(page, ask);
    await expect(item).toContainText('Revision, uses 1 of your 2 steering credits');
    await expect(item).toContainText('Waiting for an answer');
  });

  test("provider: sees it as the customer's credit and answers it", async ({ page, context }) => {
    await signIn(context, p.provider);
    await openRoom(page, c.contractId, 'steering');
    const item = steeringItem(page, ask);
    await expect(item).toContainText("Revision, uses 1 of the customer's 2 steering credits");
    await item.getByRole('textbox', { name: 'Your answer' }).fill(answer);
    await item.getByRole('button', { name: 'Send answer' }).click();
    await expect(item).toContainText(answer);
    await expect(item).toContainText(/Answered|Resolved/);
  });

  test('customer: one credit used', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    await expect(roomPanel(page)).toContainText('Steering credits: 1 of 2 left');
    await expect(steeringItem(page, ask)).toContainText(answer);
  });
});

test.describe('job room: scope change with a price increase', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  const p = parties('scopeup');
  const W = uniqueWord('scopeup');
  const ask = `Also accept semicolon separated files ${W}.`;
  const requirement = `Accept semicolon separated files ${W}`;
  const deliverable = `Sample semicolon file ${W}`;
  const note = `Semicolon support adds a parser mode ${W}.`;
  let c: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    c = await seedIn(playwright, testInfo, (api) => seedActiveContract(api, { ...p, title: `Scope up job ${W}`, plan: 'Plan.' }));
  });

  test('customer: a spec change is a scope change and pauses work', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    await sendSteering(page, { message: ask, type: 'Scope change', specChanges: [requirement] });
    await expect(statusWith(page, 'Scope change, needs a new estimate')).toBeVisible();
    const item = steeringItem(page, ask);
    await expect(item).toContainText('Scope change, needs a new estimate');
    await expect(item).toContainText('Waiting for an estimate');
    await expect(statusWith(page, 'Work is paused')).toBeVisible();
    await expect(roomPanel(page)).toContainText('Steering credits: 2 of 2 left');
  });

  test('provider: sees work paused and sends an estimate', async ({ page, context }) => {
    await signIn(context, p.provider);
    await openRoom(page, c.contractId, 'steering');
    await expect(statusWith(page, 'Work is paused')).toBeVisible();
    const item = steeringItem(page, ask);
    await expect(item.getByRole('button', { name: 'Decline' })).toBeVisible();
    await item.getByLabel('Price change (€)').fill('50');
    await item.getByLabel('ETA (days)').fill('3');
    await item.getByLabel('Deliverable changes (one per line)').fill(deliverable);
    await item.getByLabel('Note to the customer').fill(note);
    await item.getByRole('button', { name: 'Send estimate' }).click();
    await expect(item).toContainText('Waiting for the customer');
    await expect(item.getByRole('button', { name: 'Send estimate' })).toHaveCount(0);
  });

  test('customer: the new estimate; Approve redirects to Stripe Checkout for the top-up', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    const item = steeringItem(page, ask);
    await expect(item).toContainText('Waiting for your approval');
    await expect(item.getByRole('heading', { name: 'New estimate' })).toBeVisible();
    await expect(item).toContainText(`Price: €300 ${ARROW} €350 (+€50)`);
    await expect(item).toContainText('ETA: 3 days');
    await expect(item).toContainText(deliverable);
    await expect(item).toContainText(note);
    await expect(item.getByRole('button', { name: 'Reject' })).toBeVisible();
    await mockStripeCheckout(page);
    await item.getByRole('button', { name: 'Approve' }).click();
    await page.waitForURL(CHECKOUT_URL);
  });

  test('customer: approved with the top-up pending; work stays paused; Plan shows Version 2', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    const item = steeringItem(page, ask);
    await expect(item).toContainText('Approved');
    await expect(roomPanel(page)).toContainText('Top-up of €57.50 pending');
    await expect(page.getByRole('link', { name: 'Pay the top-up' })).toHaveAttribute('href', /^https:\/\/checkout\.stripe\.com\//);
    await expect(page.getByRole('button', { name: 'Get a new checkout link' })).toBeVisible();
    await expect(statusWith(page, 'Work is paused')).toBeVisible();

    await goTab(page, 'plan');
    const panel = roomPanel(page);
    await expect(panel).toContainText('Version 2');
    await expect(panel).toContainText('€350');
    await expect(versionItems(page)).toHaveCount(2);
    await expect(versionItem(page, 2)).toContainText('Current');
    await expect(versionItem(page, 2)).toContainText(`Price: €300 ${ARROW} €350`);
    await expect(versionItem(page, 2)).toContainText(`Added requirement: ${requirement}`);
    await expect(versionItem(page, 2)).toContainText(`Added deliverable: ${deliverable}`);
    await expect(versionItem(page, 1)).toContainText('Superseded');
  });

  test('provider: Plan shows the same version history', async ({ page, context }) => {
    await signIn(context, p.provider);
    await openRoom(page, c.contractId, 'plan');
    await expect(versionItem(page, 2)).toContainText('Current');
    await expect(versionItem(page, 2)).toContainText(`Price: €300 ${ARROW} €350`);
    await expect(versionItem(page, 1)).toContainText('Superseded');
  });
});

test.describe('job room: top-up checkout expiry', () => {
  test.describe.configure({ timeout: 120_000 });
  const p = parties('topup');
  const W = uniqueWord('topup');
  const ask = `Add an XLSX import ${W}.`;
  let c: Seeded;
  let steeringId = '';
  let firstCheckout = '';
  let clarificationId = '';

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120_000);
    await seedIn(playwright, testInfo, async (api) => {
      c = await seedActiveContract(api, { ...p, title: `Top-up job ${W}`, plan: 'Plan.' });
      const clar = await createSteering(api, p.customer, c.contractId, { message: `Is UTF-8 enough ${W}?`, requested_kind: 'clarification' });
      clarificationId = clar.steering.id;
      steeringId = await seedEstimatedScopeChange(api, { ...p, contractId: c.contractId }, {
        message: ask,
        specChanges: [`Import XLSX files ${W}`],
        deltaCents: 5000,
        etaDays: 2,
      });
      const approved = await approveSteering(api, p.customer, c.contractId, steeringId);
      expect(approved.checkout_url).toMatch(CHECKOUT_URL);
      firstCheckout = approved.checkout_url!;
      const sessionId =
        approved.steering?.topup_checkout_session_id ??
        (await getSteering(api, p.customer, c.contractId, steeringId)).topup_checkout_session_id;
      expect(sessionId, 'topup_checkout_session_id').toBeTruthy();
      await expireTopupCheckout(api, { contractId: c.contractId, steeringId, sessionId });
    });
  });

  test('after expiry the customer sees "The checkout link expired." and gets a fresh Checkout', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    const item = steeringItem(page, ask);
    await expect(item).toContainText('Approved');
    await expect(roomPanel(page)).toContainText('Top-up of €57.50 pending');
    await expect(roomPanel(page)).toContainText('The checkout link expired.');
    await expect(statusWith(page, 'Work is paused')).toBeVisible();
    await mockStripeCheckout(page);
    await page.getByRole('button', { name: 'Get a new checkout link' }).click();
    await page.waitForURL(CHECKOUT_URL);
    expect(page.url()).not.toBe(firstCheckout);
  });

  test('topup API: 409 when the request has no unpaid top-up; the provider cannot ask for one', async ({ request }) => {
    const none = await request.post(`/api/contracts/${c.contractId}/steering/${clarificationId}/topup`, { headers: auth(p.customer), data: {} });
    expect(none.status()).toBe(409);
    const body = await none.json();
    expect(typeof body.error).toBe('string');
    expect(typeof body.message).toBe('string');
    const byProvider = await request.post(`/api/contracts/${c.contractId}/steering/${steeringId}/topup`, { headers: auth(p.provider), data: {} });
    expect(byProvider.status()).toBe(403);
  });
});

test.describe('job room: scope change with a price decrease', () => {
  test.describe.configure({ timeout: 120_000 });
  const p = parties('scopedown');
  const W = uniqueWord('scopedown');
  const ask = `Drop the PDF report ${W}.`;
  let c: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120_000);
    await seedIn(playwright, testInfo, async (api) => {
      c = await seedActiveContract(api, { ...p, title: `Scope down job ${W}`, plan: 'Plan.' });
      await seedEstimatedScopeChange(api, { ...p, contractId: c.contractId }, {
        message: ask,
        specChanges: [`No PDF report ${W}`],
        deltaCents: -5000,
        etaDays: 4,
      });
    });
  });

  test('Approve shows "Approved" and the refund including the fee; Plan shows the lower price', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    await expect(statusWith(page, 'Work is paused')).toBeVisible();
    const item = steeringItem(page, ask);
    await expect(item.getByRole('heading', { name: 'New estimate' })).toBeVisible();
    await expect(item).toContainText(new RegExp(`Price: €300 ${ARROW} €250 \\([-−]€50\\)`));
    await expect(item).toContainText('ETA: 4 days');
    await item.getByRole('button', { name: 'Approve' }).click();
    await expect(item).toContainText('Approved');
    await expect(statusWith(page, /We[’']re refunding €57\.50 to you\./)).toBeVisible();
    expect(new URL(page.url()).host).not.toBe('checkout.stripe.com');
    await expect(page.getByRole('status').filter({ hasText: 'Work is paused' })).toHaveCount(0);

    await goTab(page, 'plan');
    await expect(versionItem(page, 2)).toContainText('Current');
    await expect(versionItem(page, 2)).toContainText(`Price: €300 ${ARROW} €250`);
    await expect(versionItem(page, 1)).toContainText('Superseded');
    await expect(roomPanel(page)).toContainText('€250');
  });
});

test.describe('job room: rejecting a new estimate', () => {
  test.describe.configure({ timeout: 120_000 });
  const p = parties('scoperej');
  const W = uniqueWord('scoperej');
  const ask = `Add a JSON export ${W}.`;
  let c: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120_000);
    await seedIn(playwright, testInfo, async (api) => {
      c = await seedActiveContract(api, { ...p, title: `Reject job ${W}`, plan: 'Plan.' });
      await seedEstimatedScopeChange(api, { ...p, contractId: c.contractId }, {
        message: ask,
        specChanges: [`Export JSON ${W}`],
        deltaCents: 5000,
      });
    });
  });

  test('Reject → "Rejected", work no longer paused, terms stay at Version 1', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'steering');
    await expect(statusWith(page, 'Work is paused')).toBeVisible();
    const item = steeringItem(page, ask);
    await expect(item).toContainText(`Price: €300 ${ARROW} €350 (+€50)`);
    await item.getByRole('button', { name: 'Reject' }).click();
    await expect(item).toContainText('Rejected');
    await expect(page.getByRole('status').filter({ hasText: 'Work is paused' })).toHaveCount(0);
    await expect(item.getByRole('button', { name: 'Approve' })).toHaveCount(0);

    await page.reload();
    await expect(steeringItem(page, ask)).toContainText('Rejected');
    await expect(page.getByRole('status').filter({ hasText: 'Work is paused' })).toHaveCount(0);
    await goTab(page, 'plan');
    await expect(versionItem(page, 1)).toContainText('Current');
    await expect(roomPanel(page)).toContainText('€300');
  });
});

test.describe('job room: steering form gating and price changes', () => {
  test.describe.configure({ timeout: 120_000 });
  const pend = parties('steerpend');
  const act = parties('steerprice');
  const W = uniqueWord('steerprice');
  let pendingC: Seeded;
  let activeC: Seeded;

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120_000);
    await seedIn(playwright, testInfo, async (api) => {
      pendingC = await seedContract(api, { ...pend, title: `Steer pending ${W}`, plan: 'Plan.' });
      activeC = await seedActiveContract(api, { ...act, title: `Steer price ${W}`, plan: 'Plan.' });
    });
  });

  test('no customer steering form before payment', async ({ page, context }) => {
    await signIn(context, pend.customer);
    await openRoom(page, pendingC.contractId, 'steering');
    await expect(roomPanel(page)).toContainText('Steering credits: 2 of 2 left');
    await expect(page.getByRole('textbox', { name: 'What do you need?' })).toHaveCount(0);
  });

  test('a new price is always a scope change, even with "Let Tulzo decide"', async ({ page, context }) => {
    const ask = `Can we settle on this ${W}?`;
    await signIn(context, act.customer);
    await openRoom(page, activeC.contractId, 'steering');
    await sendSteering(page, { message: ask, type: 'Let Tulzo decide', newPrice: '350' });
    await expect(statusWith(page, 'Scope change, needs a new estimate')).toBeVisible();
    await expect(steeringItem(page, ask)).toContainText('Scope change, needs a new estimate');
    await expect(statusWith(page, 'Work is paused')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 7. Artifacts, QA, Status and Delivery through a submission's life

test.describe('job room: artifacts, QA and delivery', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });
  test.skip(!ADMIN_USER, 'QA_E2E_ADMIN_USER not set');
  const p = parties('qa');
  const W = uniqueWord('qa');
  const reason = `Empty files crash the importer ${W}.`;
  let c: Seeded;
  let firstId = '';

  test.beforeAll(async ({ playwright }, testInfo) => {
    c = await seedIn(playwright, testInfo, (api) => seedActiveContract(api, { ...p, title: `QA job ${W}`, plan: 'Plan.' }));
  });

  function attempt(page: Page, n: number): Locator {
    return page.getByRole('list', { name: 'Submissions' }).getByRole('listitem').filter({ hasText: new RegExp(`\\bAttempt ${n}\\b`) });
  }

  test('nothing submitted: empty Artifacts and QA, no delivery', async ({ page, context }) => {
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'artifacts');
    await expect(roomPanel(page)).toContainText('Nothing submitted yet.');
    await goTab(page, 'qa');
    await expect(roomPanel(page)).toContainText('No work submitted yet.');
    await goTab(page, 'delivery');
    await expect(page.locator('[data-slot="delivery"]')).toHaveCount(0);
  });

  test('after send_project: attempt 1 waiting for QA, status "In QA"', async ({ page, context, request }) => {
    firstId = (await sendProject(request, p.provider, c.contractId)).id;
    for (const who of [p.customer, p.provider]) {
      await signIn(context, who);
      await openRoom(page, c.contractId, 'artifacts');
      const item = attempt(page, 1);
      await expect(item).toContainText(SUBMITTED_REPO);
      await expect(item).toContainText(SHORT_SHA);
      await expect(item).not.toContainText(FAKE_SHA_HEAD.slice(0, 8));
      await expect(item).toContainText('Waiting for QA');
      await goTab(page, 'qa');
      await expect(roomPanel(page)).toContainText('Waiting for QA');
      await goTab(page, 'status');
      await expect(currentStep(page)).toContainText('In QA');
    }
  });

  test('in review', async ({ page, context, request }) => {
    await startQaReview(request, firstId);
    await signIn(context, p.customer);
    await openRoom(page, c.contractId, 'qa');
    await expect(roomPanel(page)).toContainText('In review');
    await goTab(page, 'artifacts');
    await expect(attempt(page, 1)).toContainText('In review');
  });

  test('changes requested: verdict and reason in QA, attempt label, back to "In progress", no delivery', async ({
    page,
    context,
    request,
  }) => {
    await markQa(request, firstId, 'requires_changes', reason);
    for (const who of [p.customer, p.provider]) {
      await signIn(context, who);
      await openRoom(page, c.contractId, 'qa');
      const panel = roomPanel(page);
      await expect(panel).toContainText('Changes requested');
      await expect(panel).toContainText('Attempt 1: Changes requested');
      await expect(panel).toContainText(reason);
      await goTab(page, 'artifacts');
      await expect(attempt(page, 1)).toContainText('Changes requested');
      await goTab(page, 'status');
      await expect(currentStep(page)).toContainText('In progress');
      await goTab(page, 'delivery');
      await expect(page.locator('[data-slot="delivery"]')).toHaveCount(0);
    }
  });

  test('validated resubmission: attempt 2 validated, delivery placeholder, status "Delivered"', async ({ page, context, request }) => {
    const second = await sendProject(request, p.provider, c.contractId);
    await startQaReview(request, second.id);
    await markQa(request, second.id, 'validated', `Meets the spec ${W}`);
    for (const who of [p.customer, p.provider]) {
      await signIn(context, who);
      await openRoom(page, c.contractId, 'artifacts');
      await expect(page.getByRole('list', { name: 'Submissions' }).getByRole('listitem')).toHaveCount(2);
      await expect(attempt(page, 1)).toContainText('Changes requested');
      await expect(attempt(page, 2)).toContainText('Validated');
      await goTab(page, 'qa');
      const panel = roomPanel(page);
      await expect(panel).toContainText('Attempt 2: Validated');
      await expect(panel).toContainText(`Meets the spec ${W}`);
      await expect(panel).toContainText('Attempt 1: Changes requested');
      await goTab(page, 'delivery');
      const slot = page.locator('[data-slot="delivery"]');
      await expect(slot).toBeVisible();
      await expect(slot).toContainText(/deliver/i);
      await goTab(page, 'status');
      await expect(currentStep(page)).toContainText('Delivered');
    }
  });
});
