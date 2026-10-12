import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  ADMIN_USER,
  AD_SLOT,
  FIXED_DEADLINE,
  FIXED_DEADLINE_TEXT,
  GIGS_ENV_MISSING,
  acceptBid,
  auth,
  cardTitled,
  continueToDraft,
  createJob,
  createOffer,
  expectAbsentOrDisabled,
  fillDescribe,
  fillEdit,
  jobCards,
  linkStripe,
  markContractPaid,
  mockStripeCheckout,
  newApi,
  newProjectContext,
  offerCards,
  openGigs,
  placeBid,
  publishJob,
  resultCount,
  robotsMeta,
  seedContract,
  signIn,
  statusWith,
  trackAppPosts,
  uid,
  uniqueWord,
  wizardData,
  wizardTo,
} from '../support/gigs-ui';

// Behaviour-only UI tests for the gigs pages (listing, post wizard, offers, job
// detail, bids, contract, docs, sitemap). Runs under `npm run test:e2e:gigs`.

test.skip(GIGS_ENV_MISSING, 'gigs e2e env not set');

const EN_DASH = '–';

// ---------------------------------------------------------------------------
// 1. Gigs home: listing, search, filters, tabs, empty states

test.describe('gigs home: listing', () => {
  // Module scope runs once per worker, so each worker seeds its own word.
  const W = uniqueWord('gigslist');
  const customer = uid('listcustomer');
  const provider = uid('listprovider');
  const unlinked = uid('listunlinked');
  const longDescription = `Build an importer for ${W} customer CSV files. It has to validate every row, report errors with line numbers, and keep going after a bad row so the whole file is always processed in one pass.`;
  const t = {
    a: `Ranged budget ${W}`,
    b: `Open budget ${W}`,
    c: `From budget ${W}`,
    d: `Up to budget ${W}`,
    e: `Exact budget ${W}`,
    awarded: `Awarded job ${W}`,
    draft: `Draft only ${W}`,
  };
  const ids: Record<string, string> = {};

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120_000);
    const api = await newApi(playwright, testInfo);
    try {
      await linkStripe(api, provider);
      ids.a = (
        await publishJob(api, customer, {
          title: t.a,
          description: longDescription,
          category: 'development',
          budget_min_cents: 20000,
          budget_max_cents: 40000,
          deadline: FIXED_DEADLINE,
        })
      ).id;
      ids.b = (await publishJob(api, customer, { title: t.b, category: 'design' })).id;
      await placeBid(api, provider, ids.b, { price_cents: 15000, eta_days: 3 });
      ids.c = (
        await publishJob(api, customer, {
          title: t.c,
          category: 'data',
          budget_min_cents: 50000,
          deadline: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        })
      ).id;
      ids.d = (await publishJob(api, customer, { title: t.d, category: 'writing', budget_max_cents: 40000 })).id;
      ids.e = (
        await publishJob(api, customer, { title: t.e, category: 'devops', budget_min_cents: 30000, budget_max_cents: 30000 })
      ).id;
      ids.awarded = (
        await publishJob(api, customer, { title: t.awarded, category: 'security', budget_min_cents: 20000, budget_max_cents: 40000 })
      ).id;
      const bid = await placeBid(api, provider, ids.awarded, { price_cents: 30000, eta_days: 4 });
      await acceptBid(api, customer, bid.id);
      ids.draft = (await createJob(api, customer, { title: t.draft, category: 'development' })).id;

      await createOffer(api, provider, {
        title: `Linked offer ${W}`,
        description: `CSV clean-up for ${W} data sets, delivered as a script.`,
        price_cents: 15000,
        delivery_days: 5,
        tags: ['csv', 'cleanup'],
        category: 'data',
      });
      await createOffer(api, unlinked, {
        title: `Unlinked offer ${W}`,
        description: `Quick copy edit for ${W} landing pages.`,
        price_cents: 1250,
        delivery_days: 1,
        tags: ['copy'],
        category: 'writing',
      });
    } finally {
      await api.dispose();
    }
  });

  test('heading, CTAs and tabs (Jobs selected by default)', async ({ page }) => {
    await openGigs(page, '/gigs');
    await expect(page.getByRole('heading', { level: 1, name: 'Gigs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Post a job' })).toHaveAttribute('href', /\/gigs\/post$/);
    await expect(page.getByRole('link', { name: 'Offer a service' })).toHaveAttribute('href', /\/gigs\/offers\/new$/);
    const tablist = page.getByRole('tablist', { name: 'Listings' });
    await expect(tablist.getByRole('tab', { name: 'Jobs' })).toHaveAttribute('aria-selected', 'true');
    await expect(tablist.getByRole('tab', { name: 'Offers' })).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('search').getByRole('searchbox', { name: 'Search jobs' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Clear filters' })).toHaveCount(0);
  });

  test('job cards show title link, description, category, budget, deadline, bids, trust badge, posted', async ({ page }) => {
    await openGigs(page, `/gigs?q=${W}`);
    await expect(resultCount(page)).toHaveText(/\b5 jobs\b/);
    const cards = jobCards(page);
    await expect(cards).toHaveCount(5);

    const a = cardTitled(cards, page, t.a);
    await expect(a.getByRole('article')).toHaveCount(1);
    await expect(a.getByRole('link', { name: t.a })).toHaveAttribute('href', new RegExp(`/gigs/jobs/${ids.a}$`));
    await expect(a).toContainText(longDescription);
    await expect(a).toContainText('Development');
    await expect(a).toContainText(`€200 ${EN_DASH} €400`);
    await expect(a).toContainText(`Due ${FIXED_DEADLINE_TEXT}`);
    await expect(a).toContainText('No bids yet');
    await expect(a).toContainText('New on Tulzo');
    await expect(a).toContainText('Posted today');

    const b = cardTitled(cards, page, t.b);
    await expect(b).toContainText('Design');
    await expect(b).toContainText('Budget open');
    await expect(b).toContainText('No deadline');
    await expect(b).toContainText('1 bid');
    await expect(b).not.toContainText('1 bids');

    await expect(cardTitled(cards, page, t.c)).toContainText('From €500');
    await expect(cardTitled(cards, page, t.c)).toContainText('Data & AI');
    await expect(cardTitled(cards, page, t.d)).toContainText('Up to €400');
    await expect(cardTitled(cards, page, t.e)).toContainText('€300');
    await expect(cardTitled(cards, page, t.e)).not.toContainText(EN_DASH);
  });

  test('drafts and non-open jobs are not in the default list', async ({ page }) => {
    await openGigs(page, `/gigs?q=${W}`);
    await expect(resultCount(page)).toHaveText(/\b5 jobs\b/);
    await expect(page.getByRole('heading', { name: t.draft })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: t.awarded })).toHaveCount(0);
  });

  test('search puts q in the URL and filters results', async ({ page }) => {
    await openGigs(page, '/gigs');
    const search = page.getByRole('search');
    await search.getByRole('searchbox', { name: 'Search jobs' }).fill(W);
    await search.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]q=${W}(&|$)`));
    await expect(resultCount(page)).toHaveText(/\b5 jobs\b/);
    await expect(jobCards(page)).toHaveCount(5);
  });

  test('category filter → URL param and results; reload keeps it', async ({ page }) => {
    await openGigs(page, `/gigs?q=${W}`);
    const filters = page.getByRole('form', { name: 'Filters' });
    const category = filters.getByRole('combobox', { name: 'Category' });
    await expect(category.locator('option[value=""]')).toHaveText('All categories');
    for (const [value, label] of [
      ['development', 'Development'],
      ['automation', 'Automation'],
      ['data', 'Data & AI'],
      ['design', 'Design'],
      ['devops', 'DevOps'],
      ['security', 'Security'],
      ['writing', 'Writing'],
      ['other', 'Other'],
    ]) {
      await expect(category.locator(`option[value="${value}"]`)).toHaveText(label);
    }
    await category.selectOption('development');
    await filters.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/[?&]category=development(&|$)/);
    await expect(page).toHaveURL(new RegExp(`[?&]q=${W}(&|$)`));
    await expect(resultCount(page)).toHaveText(/\b1 job\b/);
    await expect(page.getByRole('heading', { name: t.a })).toBeVisible();
    await expect(page.getByRole('heading', { name: t.b })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('form', { name: 'Filters' }).getByRole('combobox', { name: 'Category' })).toHaveValue(
      'development',
    );
    await expect(resultCount(page)).toHaveText(/\b1 job\b/);
  });

  test('min and max price filters → whole-euro URL params and overlap results', async ({ page }) => {
    await openGigs(page, `/gigs?q=${W}`);
    const filters = page.getByRole('form', { name: 'Filters' });
    await filters.getByRole('spinbutton', { name: 'Min price (€)' }).fill('450');
    await filters.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/[?&]min=450(&|$)/);
    // An open maximum is unbounded: "From €500" overlaps a €450 minimum; €200–400 and €300 don't.
    await expect(page.getByRole('heading', { name: t.c, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: t.a, exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: t.e, exact: true })).toHaveCount(0);

    await openGigs(page, `/gigs?q=${W}&min=250`);
    await expect(page.getByRole('heading', { name: t.a, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: t.e, exact: true })).toBeVisible();
    await openGigs(page, `/gigs?q=${W}&min=450`);

    await page.reload();
    await expect(page.getByRole('form', { name: 'Filters' }).getByRole('spinbutton', { name: 'Min price (€)' })).toHaveValue(
      '450',
    );

    await openGigs(page, `/gigs?q=${W}`);
    const f2 = page.getByRole('form', { name: 'Filters' });
    await f2.getByRole('spinbutton', { name: 'Max price (€)' }).fill('250');
    await f2.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/[?&]max=250(&|$)/);
    await expect(page.getByRole('heading', { name: t.a })).toBeVisible();
    await expect(page.getByRole('heading', { name: t.c })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: t.e })).toHaveCount(0);
  });

  test('deadline filter → deadline=7d and only jobs due within 7 days', async ({ page }) => {
    await openGigs(page, `/gigs?q=${W}`);
    const filters = page.getByRole('form', { name: 'Filters' });
    const deadline = filters.getByRole('combobox', { name: 'Deadline' });
    await expect(deadline.locator('option[value=""]')).toHaveText('Any time');
    await expect(deadline.locator('option[value="7d"]')).toHaveText('Within 7 days');
    await expect(deadline.locator('option[value="30d"]')).toHaveText('Within 30 days');
    await expect(deadline.locator('option[value="90d"]')).toHaveText('Within 90 days');
    await deadline.selectOption('7d');
    await filters.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/[?&]deadline=7d(&|$)/);
    await expect(page.getByRole('heading', { name: t.c })).toBeVisible();
    await expect(page.getByRole('heading', { name: t.a })).toHaveCount(0);
  });

  test('status filter → status=awarded shows the awarded job only', async ({ page }) => {
    await openGigs(page, `/gigs?q=${W}`);
    const filters = page.getByRole('form', { name: 'Filters' });
    const status = filters.getByRole('combobox', { name: 'Status' });
    for (const [value, label] of [
      ['open', 'Open'],
      ['awarded', 'Awarded'],
      ['in_progress', 'In progress'],
      ['delivered', 'Delivered'],
      ['completed', 'Completed'],
    ]) {
      await expect(status.locator(`option[value="${value}"]`)).toHaveText(label);
    }
    await status.selectOption('awarded');
    await filters.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/[?&]status=awarded(&|$)/);
    await expect(resultCount(page)).toHaveText(/\b1 job\b/);
    await expect(page.getByRole('heading', { name: t.awarded })).toBeVisible();
    await expect(page.getByRole('heading', { name: t.a })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: t.draft })).toHaveCount(0);
  });

  test('clear filters goes back to an unfiltered list', async ({ page }) => {
    await openGigs(page, `/gigs?q=${W}&category=development&min=100`);
    await expect(resultCount(page)).toHaveText(/\b1 job\b/);
    await page.getByRole('link', { name: 'Clear filters' }).first().click();
    await expect(page).not.toHaveURL(/[?&](q|category|min)=/);
    await expect(page.getByRole('link', { name: 'Clear filters' })).toHaveCount(0);
    await expect(page.getByRole('form', { name: 'Filters' }).getByRole('combobox', { name: 'Category' })).toHaveValue('');
  });

  test('filtered with no results → "No jobs match" and a clear link', async ({ page }) => {
    await openGigs(page, `/gigs?q=${W}nomatch`);
    await expect(resultCount(page)).toHaveText(/\b0 jobs\b/);
    await expect(page.getByRole('heading', { name: 'No jobs match' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Clear filters' }).first()).toBeVisible();
  });

  test('Offers tab: navigates to ?tab=offers, selected, offer search, no job-only filters', async ({ page }) => {
    await openGigs(page, '/gigs');
    await page.getByRole('tablist', { name: 'Listings' }).getByRole('tab', { name: 'Offers' }).click();
    await expect(page).toHaveURL(/[?&]tab=offers(&|$)/);
    const tablist = page.getByRole('tablist', { name: 'Listings' });
    await expect(tablist.getByRole('tab', { name: 'Offers' })).toHaveAttribute('aria-selected', 'true');
    await expect(tablist.getByRole('tab', { name: 'Jobs' })).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByRole('searchbox', { name: 'Search offers' })).toBeVisible();
    const filters = page.getByRole('form', { name: 'Filters' });
    await expect(filters.getByRole('combobox', { name: 'Category' })).toBeVisible();
    await expect(filters.getByRole('combobox', { name: 'Deadline' })).toHaveCount(0);
    await expect(filters.getByRole('combobox', { name: 'Status' })).toHaveCount(0);

    const search = page.getByRole('search');
    await search.getByRole('searchbox', { name: 'Search offers' }).fill(W);
    await search.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]q=${W}(&|$)`));
    await expect(page).toHaveURL(/[?&]tab=offers(&|$)/);
    await expect(resultCount(page)).toHaveText(/\b2 offers\b/);
  });

  test('offer cards show title, description, tags, price, delivery, provider and Stripe badge', async ({ page }) => {
    await openGigs(page, `/gigs?tab=offers&q=${W}`);
    const cards = offerCards(page);
    await expect(cards).toHaveCount(2);
    const linked = cardTitled(cards, page, `Linked offer ${W}`);
    await expect(linked.getByRole('article')).toHaveCount(1);
    await expect(linked).toContainText(`CSV clean-up for ${W} data sets, delivered as a script.`);
    await expect(linked).toContainText('csv');
    await expect(linked).toContainText('cleanup');
    await expect(linked).toContainText('€150');
    await expect(linked).toContainText('Delivery in 5 days');
    await expect(linked).toContainText('Tulzo provider');
    await expect(linked).toContainText('Stripe linked');

    const other = cardTitled(cards, page, `Unlinked offer ${W}`);
    await expect(other).toContainText('€12.50');
    await expect(other).toContainText('Delivery in 1 day');
    await expect(other).not.toContainText('Stripe linked');

    await openGigs(page, `/gigs?tab=offers&q=${W}&category=writing`);
    await expect(resultCount(page)).toHaveText(/\b1 offer\b/);
    await expect(page.getByRole('heading', { name: `Unlinked offer ${W}` })).toBeVisible();
  });

  test('offers filtered with no results → "No offers match"', async ({ page }) => {
    await openGigs(page, `/gigs?tab=offers&q=${W}nomatch`);
    await expect(resultCount(page)).toHaveText(/\b0 offers\b/);
    await expect(page.getByRole('heading', { name: 'No offers match' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Clear filters' }).first()).toBeVisible();
  });

  test('mobile: filters live in a sheet; Escape closes; applying updates the URL and closes it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGigs(page, `/gigs?q=${W}`);
    await expect(page.getByLabel('Category', { exact: true }).first()).toBeHidden();
    await expect(page.getByLabel('Min price (€)').first()).toBeHidden();

    const open = page.getByRole('button', { name: /^Filters/ });
    await open.click();
    const sheet = page.getByRole('dialog', { name: 'Filters' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('combobox', { name: 'Category' })).toBeVisible();
    await expect(sheet.getByRole('spinbutton', { name: 'Min price (€)' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Close filters' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    await open.click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close filters' }).click();
    await expect(sheet).toBeHidden();

    await open.click();
    await sheet.getByRole('combobox', { name: 'Category' }).selectOption('development');
    await sheet.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/[?&]category=development(&|$)/);
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('heading', { name: t.a })).toBeVisible();
    await expect(page.getByRole('heading', { name: t.b })).toHaveCount(0);
  });
});

test.describe('gigs home: pagination', () => {
  const P = uniqueWord('gigspage');
  const customer = uid('pagecustomer');

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(180_000);
    const api = await newApi(playwright, testInfo);
    try {
      for (let i = 1; i <= 13; i += 1) {
        await publishJob(api, customer, {
          title: `Paged job ${i} ${P}`,
          category: i === 1 ? 'design' : 'development',
          budget_min_cents: 10000,
          budget_max_cents: 20000,
        });
      }
    } finally {
      await api.dispose();
    }
  });

  test('12 per page; Next keeps filters and sets page=2; ends are disabled or absent', async ({ page }) => {
    await openGigs(page, `/gigs?q=${P}`);
    await expect(resultCount(page)).toHaveText(/\b13 jobs\b/);
    await expect(jobCards(page)).toHaveCount(12);
    const nav = page.getByRole('navigation', { name: 'Pagination' });
    await expect(nav).toContainText('Page 1 of 2');
    await expectAbsentOrDisabled(nav.getByRole('link', { name: 'Previous' }));

    await nav.getByRole('link', { name: 'Next' }).click();
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(page).toHaveURL(new RegExp(`[?&]q=${P}(&|$)`));
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('Page 2 of 2');
    await expect(jobCards(page)).toHaveCount(1);
    await expectAbsentOrDisabled(page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: 'Next' }));
    await expect(page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: 'Previous' })).toBeVisible();
  });

  test('page 1 omits the page param; applying filters resets the page', async ({ page }) => {
    await openGigs(page, `/gigs?q=${P}&page=2`);
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('Page 2 of 2');
    await page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: 'Previous' }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]q=${P}(&|$)`));
    await expect(page).not.toHaveURL(/[?&]page=/);

    await openGigs(page, `/gigs?q=${P}&page=2`);
    const filters = page.getByRole('form', { name: 'Filters' });
    await filters.getByRole('combobox', { name: 'Category' }).selectOption('development');
    await filters.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/[?&]category=development(&|$)/);
    await expect(page).not.toHaveURL(/[?&]page=/);
    await expect(resultCount(page)).toHaveText(/\b12 jobs\b/);
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Post a job wizard

test.describe('post a job wizard', () => {
  test('signed out → redirected to sign-in', async ({ page }) => {
    await page.goto('/gigs/post');
    await page.waitForURL(/\/sign-in/);
  });

  test('progress nav, noindex, no ad slot', async ({ page, context }) => {
    await signIn(context, uid('poster'));
    await openGigs(page, '/gigs/post', { signedIn: true });
    const progress = page.getByRole('navigation', { name: 'Progress' });
    for (const step of ['Describe', 'Draft', 'Edit', 'Publish']) await expect(progress).toContainText(step);
    await expect(progress.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(progress.locator('[aria-current="step"]')).toContainText('Describe');
    await expect(page.getByRole('heading', { level: 2, name: 'Describe the outcome' })).toBeVisible();
    expect(await robotsMeta(page)).toContain('noindex');
    await expect(page.locator(AD_SLOT)).toHaveCount(0);
  });

  test('describe validation: title, description, budget order; nothing posted', async ({ page, context, baseURL }) => {
    await signIn(context, uid('poster'));
    await openGigs(page, '/gigs/post', { signedIn: true });
    const posts = trackAppPosts(page, baseURL);
    const cont = page.getByRole('button', { name: 'Continue' });

    await cont.click();
    await expect(page.getByText('Give your job a title of at least 3 characters')).toBeVisible();

    await page.getByRole('textbox', { name: 'Title' }).fill('ab');
    await cont.click();
    await expect(page.getByText('Give your job a title of at least 3 characters')).toBeVisible();

    await page.getByRole('textbox', { name: 'Title' }).fill('A valid title');
    await page.getByRole('textbox', { name: 'What do you need done?' }).fill('short');
    await cont.click();
    await expect(page.getByText('Describe the outcome in at least 10 characters')).toBeVisible();
    await expect(page.getByText('Give your job a title of at least 3 characters')).toHaveCount(0);

    await page.getByRole('textbox', { name: 'What do you need done?' }).fill('A long enough description of the outcome.');
    await page.getByRole('spinbutton', { name: 'Min budget (€)' }).fill('500');
    await page.getByRole('spinbutton', { name: 'Max budget (€)' }).fill('100');
    await cont.click();
    await expect(page.getByText("The minimum budget can't be above the maximum")).toBeVisible();

    await expect(page).not.toHaveURL(/step=/);
    expect(posts()).toBe(0);
  });

  test('happy path (manual spec) → published job, listed; QA choice carries to the accept dialog', async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const owner = uid('wizowner');
    const provider = uid('wizprovider');
    const W = uniqueWord('wizard');
    const d = wizardData(`Wizard job ${W}`);
    await signIn(context, owner);
    await openGigs(page, '/gigs/post', { signedIn: true });
    await fillDescribe(page, d);
    const jobId = await continueToDraft(page);
    await expect(page).toHaveURL(new RegExp(`[?&]job=${jobId}(&|$)`));
    await expect(page.getByRole('navigation', { name: 'Progress' }).locator('[aria-current="step"]')).toContainText('Draft');
    await expect(page.getByRole('textbox', { name: 'Instructions for the AI (optional)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Draft with AI' })).toBeVisible();

    await page.getByRole('button', { name: 'Write it myself' }).click();
    await page.waitForURL(/[?&]step=edit/);
    await expect(page.getByRole('heading', { level: 2, name: 'Edit the spec' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Progress' }).locator('[aria-current="step"]')).toContainText('Edit');
    for (const label of [
      'Requirements (one per line)',
      'Deliverables (one per line)',
      'Acceptance criteria (one per line)',
      'Constraints (one per line)',
      'Permitted tools (one per line)',
    ]) {
      await expect(page.getByLabel(label)).toHaveValue('');
    }
    await expect(page.getByLabel('Deadline', { exact: true })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Min budget (€)' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Max budget (€)' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'The work needs real secrets or credentials' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
    const sensitivity = page.getByRole('combobox', { name: 'Data sensitivity' });
    for (const label of ['Public', 'Internal', 'Confidential']) {
      await expect(sensitivity.locator('option', { hasText: label })).toHaveCount(1);
    }

    // QA checks group
    const qa = page.getByRole('group', { name: 'QA checks' });
    const basic = qa.getByRole('checkbox', { name: /Basic QA/ });
    await expect(basic).toBeChecked();
    await expect(basic).toBeDisabled();
    await expect(qa).toContainText('Included');
    for (const [name, credits] of [
      ['Deep requirements review', 150],
      ['Code review', 300],
      ['Security review', 450],
      ['User journey test', 600],
      ['Adversarial testing', 900],
    ] as const) {
      const box = qa.getByRole('checkbox', { name: new RegExp(name) });
      await expect(box).toBeEnabled();
      await expect(box).not.toBeChecked();
      await expect(qa).toContainText(`up to ${credits} credits`);
    }

    // Edit validation, one rule at a time, nothing sent.
    const posts = trackAppPosts(page, baseURL);
    const review = page.getByRole('button', { name: 'Review and publish' });
    await review.click();
    await expect(page.getByText('Add at least one requirement')).toBeVisible();
    await page.getByLabel('Requirements (one per line)').fill(d.requirements.join('\n'));
    await review.click();
    await expect(page.getByText('Add at least one deliverable')).toBeVisible();
    await page.getByLabel('Deliverables (one per line)').fill(d.deliverables.join('\n'));
    await review.click();
    await expect(page.getByText('Add at least one acceptance criterion')).toBeVisible();
    expect(posts()).toBe(0);
    await expect(page).toHaveURL(/[?&]step=edit/);

    await fillEdit(page, d);
    await qa.getByRole('checkbox', { name: /Code review/ }).check();
    await review.click();
    await page.waitForURL(/[?&]step=publish/);
    await expect(page.getByRole('heading', { level: 2, name: 'Review and publish' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Progress' }).locator('[aria-current="step"]')).toContainText('Publish');
    for (const text of [...d.requirements, ...d.deliverables, ...d.acceptance, 'Code review']) {
      await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
    }

    // Back to edit and forward again keeps the spec.
    await page.getByRole('button', { name: 'Back to edit' }).click();
    await page.waitForURL(/[?&]step=edit/);
    await expect(page.getByLabel('Requirements (one per line)')).toHaveValue(new RegExp(d.requirements[0]));
    await page.getByRole('button', { name: 'Review and publish' }).click();
    await page.waitForURL(/[?&]step=publish/);

    await page.getByRole('button', { name: 'Approve and publish' }).click();
    await page.waitForURL(new RegExp(`/gigs/jobs/${jobId}(\\?|$)`));
    await expect(statusWith(page, 'Your job is live')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: d.title })).toBeVisible();

    await openGigs(page, `/gigs?q=${W}`, { signedIn: true });
    await expect(page.getByRole('heading', { name: d.title })).toBeVisible();

    // A provider bids; the owner's accept dialog preselects the QA check chosen in this browser.
    await linkStripe(request, provider);
    const bid = await placeBid(request, provider, jobId, { price_cents: 30000, eta_days: 5, plan: `Plan for ${W}` });
    await mockStripeCheckout(page);
    await openGigs(page, `/gigs/jobs/${jobId}`, { signedIn: true });
    await page.getByRole('button', { name: 'Accept bid' }).click();
    const dialog = page.getByRole('dialog', { name: 'Accept this bid' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: /Code review/ })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: /Security review/ })).not.toBeChecked();
    const acceptReq = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes(`/api/bids/${bid.id}/accept`));
    await dialog.getByRole('checkbox', { name: /lose my 14-day right of withdrawal/ }).check();
    await dialog.getByRole('button', { name: 'Continue to payment' }).click();
    const body = (await acceptReq).postDataJSON() as { qa_checks?: string[] };
    expect(body.qa_checks).toContain('basic');
    expect(body.qa_checks).toHaveLength(2);
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//);
  });

  test('Draft with AI without credits → out of credits alert with a top-up link', async ({ page, context }) => {
    await signIn(context, uid('poster'));
    await wizardTo(page, 'draft', wizardData(`AI draft ${uniqueWord('ai')}`));
    await page.getByRole('textbox', { name: 'Instructions for the AI (optional)' }).fill('Keep it short');
    await page.getByRole('button', { name: 'Draft with AI' }).click();
    const alert = page.getByRole('alert').filter({ hasText: /out of credits/i });
    await expect(alert).toBeVisible();
    await expect(page.getByRole('link', { name: 'Top up credits' })).toHaveAttribute('href', /\/credits$/);
    await expect(page).toHaveURL(/[?&]step=draft/);
  });

  test('Draft with AI success (mocked) → Edit step prefilled with the drafted spec', async ({ page, context }) => {
    await signIn(context, uid('poster'));
    const jobId = await wizardTo(page, 'draft', wizardData(`AI ok ${uniqueWord('aiok')}`));
    await page.route('**/api/jobs/*/spec/draft', async (route) => {
      const sent = route.request().postDataJSON() as { spec?: unknown } | null;
      if (sent && sent.spec) return route.fallback();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          spec: {
            id: '11111111-1111-4111-8111-111111111111',
            job_id: jobId,
            version: 1,
            status: 'draft',
            source: 'ai',
            requirements: ['Mocked requirement alpha', 'Mocked requirement beta'],
            deliverables: ['Mocked deliverable'],
            acceptance_criteria: ['Mocked acceptance criterion'],
            constraints: ['Mocked constraint'],
            deadline: FIXED_DEADLINE,
            budget_min_cents: 20000,
            budget_max_cents: 40000,
            permitted_tools: ['mocktool'],
            security: { data_sensitivity: 'confidential', secrets_allowed: false, notes: 'Mocked notes' },
            created_at: '2026-01-01T00:00:00.000Z',
          },
        }),
      });
    });
    await page.getByRole('textbox', { name: 'Instructions for the AI (optional)' }).fill('Focus on validation');
    await page.getByRole('button', { name: 'Draft with AI' }).click();
    await page.waitForURL(/[?&]step=edit/);
    await expect(page.getByLabel('Requirements (one per line)')).toHaveValue(/Mocked requirement alpha/);
    await expect(page.getByLabel('Requirements (one per line)')).toHaveValue(/Mocked requirement beta/);
    await expect(page.getByLabel('Deliverables (one per line)')).toHaveValue(/Mocked deliverable/);
    await expect(page.getByLabel('Acceptance criteria (one per line)')).toHaveValue(/Mocked acceptance criterion/);
    await expect(page.getByRole('combobox', { name: 'Data sensitivity' })).toHaveValue('confidential');
  });
});

// ---------------------------------------------------------------------------
// 3. Offer a service

test.describe('offer a service', () => {
  test('signed out → sign-in', async ({ page }) => {
    await page.goto('/gigs/offers/new');
    await page.waitForURL(/\/sign-in/);
  });

  test('without Stripe linked → gate with a profile link, no form, noindex', async ({ page, context }) => {
    await signIn(context, uid('offergate'));
    await openGigs(page, '/gigs/offers/new', { signedIn: true });
    await expect(page.getByRole('heading', { name: 'Link Stripe to offer services' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Link Stripe on your profile' })).toHaveAttribute('href', /\/profile$/);
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Publish offer' })).toHaveCount(0);
    expect(await robotsMeta(page)).toContain('noindex');
  });

  test('linked: live payout text, validation without requests, publish → listed', async ({
    page,
    context,
    request,
    baseURL,
  }) => {
    const seller = uid('offerseller');
    const W = uniqueWord('offerui');
    await linkStripe(request, seller);
    await signIn(context, seller);
    await openGigs(page, '/gigs/offers/new', { signedIn: true });
    await expect(page.getByRole('heading', { level: 1, name: 'Offer a service' })).toBeVisible();
    expect(await robotsMeta(page)).toContain('noindex');
    await expect(page.getByRole('combobox', { name: 'Category' })).toBeVisible();

    const title = page.getByRole('textbox', { name: 'Title' });
    const description = page.getByRole('textbox', { name: 'Description' });
    const labels = page.getByRole('textbox', { name: 'Labels (comma separated)' });
    const price = page.getByRole('spinbutton', { name: 'Price (€)' });
    const days = page.getByRole('spinbutton', { name: 'Delivery time (days)' });
    const publish = page.getByRole('button', { name: 'Publish offer' });

    await price.fill('150');
    await expect(page.getByText(/You receive €150/i)).toBeVisible();
    await expect(page.getByText(/customers pay €172\.50/i)).toBeVisible();

    const posts = trackAppPosts(page, baseURL);
    await title.fill('ab');
    await description.fill('A long enough description of the service.');
    await days.fill('5');
    await publish.click();
    await expect(page.getByText('Give your offer a title of at least 3 characters')).toBeVisible();

    await title.fill(`Data clean-up ${W}`);
    await description.fill('short');
    await publish.click();
    await expect(page.getByText('Describe the service in at least 10 characters')).toBeVisible();

    await description.fill(`I will clean and dedupe your ${W} spreadsheets.`);
    await price.fill('0');
    await publish.click();
    await expect(page.getByText('Set a price of at least €5')).toBeVisible();
    await price.fill('');
    await publish.click();
    await expect(page.getByText('Set a price of at least €5')).toBeVisible();

    await price.fill('150');
    for (const bad of ['0', '366']) {
      await days.fill(bad);
      await publish.click();
      await expect(page.getByText('Delivery time must be between 1 and 365 days')).toBeVisible();
    }
    expect(posts()).toBe(0);

    await days.fill('5');
    await labels.fill('csv, cleanup');
    await page.getByRole('combobox', { name: 'Category' }).selectOption('data');
    await publish.click();
    await page.waitForURL(/\/gigs\?(.*&)?tab=offers(&|$)/);
    await expect(statusWith(page, 'Your offer is live')).toBeVisible();

    await openGigs(page, `/gigs?tab=offers&q=${W}`, { signedIn: true });
    const card = cardTitled(offerCards(page), page, `Data clean-up ${W}`);
    await expect(card).toBeVisible();
    await expect(card).toContainText('€150');
    await expect(card).toContainText('Delivery in 5 days');
    await expect(card).toContainText('csv');
    await expect(card).toContainText('Stripe linked');
  });
});

// ---------------------------------------------------------------------------
// 4. Job detail, bids, comparison, accept

async function publishedJob(request: APIRequestContext, owner: string, W: string) {
  return publishJob(request, owner, {
    title: `Detail job ${W}`,
    description: `Import ${W} CSV files and report invalid rows.`,
    category: 'development',
    budget_min_cents: 20000,
    budget_max_cents: 40000,
    deadline: FIXED_DEADLINE,
  });
}

test.describe('job detail', () => {
  test('public view: title, status, budget, deadline, bids, badge, spec sections', async ({ page, request }) => {
    const W = uniqueWord('detail');
    const job = await publishedJob(request, uid('detailowner'), W);
    await openGigs(page, `/gigs/jobs/${job.id}`);
    await expect(page.getByRole('heading', { level: 1, name: job.title })).toBeVisible();
    const main = page.locator('#main');
    await expect(main).toContainText('Open');
    await expect(main).toContainText(`€200 ${EN_DASH} €400`);
    await expect(main).toContainText(FIXED_DEADLINE_TEXT);
    await expect(main).toContainText('No bids yet');
    await expect(main).toContainText('New on Tulzo');
    for (const h of ['Requirements', 'Deliverables', 'Acceptance criteria', 'Constraints', 'Security']) {
      await expect(page.getByRole('heading', { level: 2, name: h, exact: true })).toBeVisible();
    }
    for (const item of [
      ...job.spec.requirements,
      ...job.spec.deliverables,
      ...job.spec.acceptance_criteria,
      ...job.spec.constraints,
    ]) {
      await expect(main).toContainText(item);
    }
    await expect(main).toContainText(/internal/i);

    await expect(page.getByRole('link', { name: 'Sign in to bid' })).toHaveAttribute('href', /\/sign-in/);
    await expect(page.getByRole('form', { name: 'Place a bid' })).toHaveCount(0);
  });

  test('SEO: JobPosting JSON-LD, absolute canonical, indexable', async ({ page, request }) => {
    const W = uniqueWord('seo');
    const job = await publishedJob(request, uid('seoowner'), W);
    await openGigs(page, `/gigs/jobs/${job.id}`);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const nodes = blocks.flatMap((b) => {
      const parsed = JSON.parse(b) as Record<string, unknown> | Record<string, unknown>[];
      const list = Array.isArray(parsed) ? parsed : [parsed];
      return list.flatMap((n) => (Array.isArray(n['@graph']) ? (n['@graph'] as Record<string, unknown>[]) : [n]));
    });
    const posting = nodes.find((n) => n['@type'] === 'JobPosting');
    expect(posting, 'a JobPosting JSON-LD node').toBeDefined();
    expect(posting?.title).toBe(job.title);
    expect(typeof posting?.datePosted).toBe('string');
    expect(String(posting?.validThrough)).toMatch(/^2027-03-01/);
    expect(JSON.stringify(posting?.baseSalary ?? posting?.estimatedSalary ?? null)).toContain('EUR');

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`^https?://[^/]+.*/gigs/jobs/${job.id}$`),
    );
    expect(await robotsMeta(page)).not.toContain('noindex');
  });

  test('unknown id and a draft viewed by someone else → 404', async ({ page, browser, request }, testInfo) => {
    const unknown = await page.goto('/gigs/jobs/00000000-0000-4000-8000-000000000000');
    expect(unknown?.status()).toBe(404);
    const owner = uid('draftowner');
    const draft = await createJob(request, owner, { title: `Hidden draft ${uniqueWord('hid')}` });
    const signedOut = await page.goto(`/gigs/jobs/${draft.id}`);
    expect(signedOut?.status()).toBe(404);

    const ctx = await newProjectContext(browser, testInfo, uid('stranger'));
    try {
      const p = await ctx.newPage();
      const res = await p.goto(`/gigs/jobs/${draft.id}`);
      expect(res?.status()).toBe(404);
    } finally {
      await ctx.close();
    }
  });

  test('?published=1 shows "Your job is live"', async ({ page, context, request }) => {
    const owner = uid('pubowner');
    const job = await publishedJob(request, owner, uniqueWord('pub'));
    await signIn(context, owner);
    await openGigs(page, `/gigs/jobs/${job.id}?published=1`, { signedIn: true });
    await expect(statusWith(page, 'Your job is live')).toBeVisible();
  });
});

test.describe('placing a bid', () => {
  async function bidForm(page: Page) {
    const form = page.getByRole('form', { name: 'Place a bid' });
    return {
      form,
      price: form.getByRole('spinbutton', { name: 'Your price (€)' }),
      days: form.getByRole('spinbutton', { name: 'Delivery estimate (days)' }),
      plan: form.getByRole('textbox', { name: 'Plan', exact: true }),
      deliverables: form.getByRole('textbox', { name: 'Deliverables (one per line)' }),
      steering: form.getByRole('spinbutton', { name: 'Steering interactions included' }),
      assumptions: form.getByRole('textbox', { name: 'Assumptions (one per line)' }),
      submit: form.getByRole('button', { name: 'Place bid' }),
    };
  }

  test('form fields, live breakdown, client validation', async ({ page, context, request, baseURL }) => {
    const job = await publishedJob(request, uid('bidowner'), uniqueWord('bidform'));
    await signIn(context, uid('bidder'));
    await openGigs(page, `/gigs/jobs/${job.id}`, { signedIn: true });
    const f = await bidForm(page);
    await expect(f.form).toBeVisible();
    for (const field of [f.price, f.days, f.plan, f.deliverables, f.steering, f.assumptions, f.submit]) {
      await expect(field).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Sign in to bid' })).toHaveCount(0);

    await f.price.fill('300');
    const breakdown = page.getByRole('status').filter({ hasText: /you receive/i });
    await expect(breakdown).toHaveAttribute('aria-live', /polite|assertive/);
    await expect(breakdown).toContainText(/You receive €300/i);
    await expect(breakdown).toContainText(/the customer pays €345/i);
    await expect(breakdown).toContainText(/€45 platform fee \(15%\)/i);

    const posts = trackAppPosts(page, baseURL);
    await f.price.fill('4');
    await f.days.fill('5');
    await f.submit.click();
    await expect(page.getByText('Bids start at €5')).toBeVisible();

    await f.price.fill('300');
    for (const bad of ['0', '366']) {
      await f.days.fill(bad);
      await f.submit.click();
      await expect(page.getByText('Delivery estimate must be between 1 and 365 days')).toBeVisible();
    }
    expect(posts()).toBe(0);
  });

  test('provider without Stripe → "Link Stripe to bid" with a profile link', async ({ page, context, request }) => {
    const job = await publishedJob(request, uid('bidowner'), uniqueWord('connect'));
    await signIn(context, uid('unlinkedbidder'));
    await openGigs(page, `/gigs/jobs/${job.id}`, { signedIn: true });
    const f = await bidForm(page);
    await f.price.fill('300');
    await f.days.fill('5');
    const res = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`/api/jobs/${job.id}/bids`));
    await f.submit.click();
    expect((await res).status()).toBe(403);
    await expect(page.getByRole('heading', { name: 'Link Stripe to bid' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Link Stripe on your profile' })).toHaveAttribute('href', /\/profile$/);
  });

  test('linked provider bids → "Your bid is in"; reload shows the active bid and no form', async ({
    page,
    context,
    request,
  }) => {
    const owner = uid('bidowner');
    const bidder = uid('linkedbidder');
    const job = await publishedJob(request, owner, uniqueWord('bidok'));
    await linkStripe(request, bidder);
    await signIn(context, bidder);
    await openGigs(page, `/gigs/jobs/${job.id}`, { signedIn: true });
    const f = await bidForm(page);
    await f.price.fill('300');
    await f.days.fill('5');
    await f.plan.fill('Stream the CSV, validate rows with a schema, add tests.');
    await f.deliverables.fill('Pull request\nTest suite');
    await f.steering.fill('2');
    await f.assumptions.fill('Sample files are representative');
    await f.submit.click();
    await expect(statusWith(page, 'Your bid is in')).toBeVisible();

    await page.reload();
    await expect(page.getByText('You have an active bid on this job')).toBeVisible();
    await expect(page.locator('#main')).toContainText('€300');
    await expect(page.getByRole('form', { name: 'Place a bid' })).toHaveCount(0);

    const bids = await request.get(`/api/jobs/${job.id}/bids`, { headers: auth(owner) });
    const list = ((await bids.json()) as { bids: Array<{ price_cents: number; eta_days: number; included_steering_credits?: number }> }).bids;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ price_cents: 30000, eta_days: 5 });
  });
});

test.describe('owner: compare and accept bids', () => {
  async function seedBids(request: APIRequestContext, W: string) {
    const owner = uid('cmpowner');
    const job = await publishedJob(request, owner, W);
    const providers = [uid('cmpa'), uid('cmpb'), uid('cmpc')];
    for (const p of providers) await linkStripe(request, p);
    const a = await placeBid(request, providers[0], job.id, {
      price_cents: 30000,
      eta_days: 5,
      plan: `Plan alpha ${W}`,
      included_steering_credits: 2,
    });
    const b = await placeBid(request, providers[1], job.id, {
      price_cents: 25000,
      eta_days: 9,
      plan: `Plan beta ${W}`,
      included_steering_credits: 1,
    });
    const c = await placeBid(request, providers[2], job.id, {
      price_cents: 40000,
      eta_days: 2,
      plan: `Plan gamma ${W}`,
      included_steering_credits: 0,
    });
    return { owner, job, bids: { a, b, c } };
  }

  function bidItems(page: Page) {
    return page
      .getByRole('list', { name: 'Bids' })
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', { name: 'Accept bid' }) });
  }

  test('owner sees no bid form and a "No bids yet" comparison', async ({ page, context, request }) => {
    const owner = uid('emptyowner');
    const job = await publishedJob(request, owner, uniqueWord('nobids'));
    await signIn(context, owner);
    await openGigs(page, `/gigs/jobs/${job.id}`, { signedIn: true });
    await expect(page.getByRole('heading', { level: 2, name: 'Compare bids' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Place a bid' })).toHaveCount(0);
    await expect(page.locator('#main')).toContainText('No bids yet');
  });

  test('bid cards show price, customer total, delivery, steering, plan, badge; sorting works', async ({
    page,
    context,
    request,
  }) => {
    const W = uniqueWord('compare');
    const { owner, job } = await seedBids(request, W);
    await signIn(context, owner);
    await openGigs(page, `/gigs/jobs/${job.id}`, { signedIn: true });
    await expect(page.getByRole('heading', { level: 2, name: 'Compare bids' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Place a bid' })).toHaveCount(0);
    const items = bidItems(page);
    await expect(items).toHaveCount(3);

    const alpha = items.filter({ hasText: `Plan alpha ${W}` });
    await expect(alpha.getByRole('article')).toHaveCount(1);
    await expect(alpha).toContainText('€300');
    await expect(alpha).toContainText('Customer total €345');
    await expect(alpha).toContainText('Delivery in 5 days');
    await expect(alpha).toContainText('2 steering interactions included');
    await expect(alpha).toContainText('New on Tulzo');
    await expect(items.filter({ hasText: `Plan beta ${W}` })).toContainText('1 steering interaction included');
    await expect(items.filter({ hasText: `Plan beta ${W}` })).toContainText('Customer total €287.50');
    await expect(items.filter({ hasText: `Plan gamma ${W}` })).toContainText('No steering included');

    const sort = page.getByRole('combobox', { name: 'Sort bids by' });
    for (const label of ['Lowest price', 'Fastest delivery', 'Most trusted']) {
      await expect(sort.locator('option', { hasText: label })).toHaveCount(1);
    }
    await sort.selectOption({ label: 'Lowest price' });
    await expect(items.nth(0)).toContainText(`Plan beta ${W}`);
    await expect(items.nth(1)).toContainText(`Plan alpha ${W}`);
    await expect(items.nth(2)).toContainText(`Plan gamma ${W}`);

    await sort.selectOption({ label: 'Fastest delivery' });
    await expect(items.nth(0)).toContainText(`Plan gamma ${W}`);
    await expect(items.nth(1)).toContainText(`Plan alpha ${W}`);
    await expect(items.nth(2)).toContainText(`Plan beta ${W}`);
  });

  test('accept dialog: total, QA checks, cancel; continue posts qa_checks and redirects to Checkout', async ({
    page,
    context,
    request,
  }) => {
    const W = uniqueWord('accept');
    const { owner, job, bids } = await seedBids(request, W);
    await signIn(context, owner);
    await mockStripeCheckout(page);
    await openGigs(page, `/gigs/jobs/${job.id}`, { signedIn: true });
    const alpha = bidItems(page).filter({ hasText: `Plan alpha ${W}` });

    await alpha.getByRole('button', { name: 'Accept bid' }).click();
    const dialog = page.getByRole('dialog', { name: 'Accept this bid' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('You pay €345');
    await expect(dialog).toContainText('Basic QA');
    for (const name of ['Deep requirements review', 'Code review', 'Security review', 'User journey test', 'Adversarial testing']) {
      await expect(dialog.getByRole('checkbox', { name: new RegExp(name) })).toBeVisible();
    }
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    await alpha.getByRole('button', { name: 'Accept bid' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: /Security review/ }).check();
    const acceptReq = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes(`/api/bids/${bids.a.id}/accept`));
    // The page leaves for Checkout right after the response, so read the body in the route
    // (a response body can't be read once its page has navigated away).
    const accepted: { value: { status: number; body: { contract: { id: string }; checkout_url: string } } | null } = { value: null };
    await page.route(`**/api/bids/${bids.a.id}/accept`, async (route) => {
      const upstream = await route.fetch();
      accepted.value = { status: upstream.status(), body: await upstream.json() };
      await route.fulfill({ response: upstream });
    });
    await dialog.getByRole('checkbox', { name: /lose my 14-day right of withdrawal/ }).check();
    await dialog.getByRole('button', { name: 'Continue to payment' }).click();
    const sent = (await acceptReq).postDataJSON() as { qa_checks?: string[] };
    expect(sent.qa_checks).toContain('basic');
    expect(sent.qa_checks).toHaveLength(2);
    await expect.poll(() => accepted.value?.status).toBe(201);
    const { contract, checkout_url } = accepted.value!.body;
    expect(contract.id).toBeTruthy();
    expect(checkout_url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//);
    expect(page.url().startsWith('https://checkout.stripe.com/')).toBe(true);

    // The contract page lists the QA checks chosen in the dialog.
    await openGigs(page, `/gigs/contracts/${contract.id}`, { signedIn: true });
    await expect(page.locator('#main')).toContainText('Basic QA');
    await expect(page.locator('#main')).toContainText('Security review');
  });
});

// ---------------------------------------------------------------------------
// 5. Contract page

test.describe('contract page', () => {
  const customer = uid('ctcustomer');
  const provider = uid('ctprovider');
  const W = uniqueWord('contract');
  const title = `Contract job ${W}`;
  const plan = `Contract plan ${W}: stream, validate, test.`;
  let seeded: Awaited<ReturnType<typeof seedContract>> | null = null;

  test.beforeAll(async ({ playwright }, testInfo) => {
    const api = await newApi(playwright, testInfo);
    try {
      seeded = await seedContract(api, { customer, provider, title, plan });
    } finally {
      await api.dispose();
    }
  });

  test('customer: heading, title, status, summary, spec lists, noindex, no ad slot', async ({ page, context }) => {
    await signIn(context, customer);
    await openGigs(page, `/gigs/contracts/${seeded!.contractId}`, { signedIn: true });
    await expect(page.getByRole('heading', { level: 1, name: /^Contract/ })).toBeVisible();
    const main = page.locator('#main');
    await expect(main).toContainText(title);
    await expect(main).toContainText('Awaiting payment');
    await expect(main).toContainText('Bid');
    await expect(main).toContainText('€300');
    await expect(main).toContainText('Platform fee (15%)');
    await expect(main).toContainText('€45');
    await expect(main).toContainText('Total');
    await expect(main).toContainText('€345');
    await expect(main).toContainText(FIXED_DEADLINE_TEXT);
    await expect(main).toContainText('Steering interactions included');
    await expect(main).toContainText('QA checks');
    await expect(main).toContainText('Basic QA');
    await expect(page.getByRole('heading', { level: 2, name: 'Requirements', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Acceptance criteria', exact: true })).toBeVisible();
    for (const item of [...seeded!.spec.requirements, ...seeded!.spec.acceptance_criteria]) {
      await expect(main).toContainText(item);
    }
    expect(await robotsMeta(page)).toContain('noindex');
    await expect(page.locator(AD_SLOT)).toHaveCount(0);
  });

  test('checkout=success and checkout=cancelled banners', async ({ page, context }) => {
    await signIn(context, customer);
    await openGigs(page, `/gigs/contracts/${seeded!.contractId}?checkout=success`, { signedIn: true });
    const ok = page.getByRole('status').filter({ hasText: /Thanks|Payment received/ });
    await expect(ok).toBeVisible();
    await expect(ok).toContainText(/payment/i);

    await openGigs(page, `/gigs/contracts/${seeded!.contractId}?checkout=cancelled`, { signedIn: true });
    const cancelled = statusWith(page, 'Checkout was cancelled');
    await expect(cancelled).toBeVisible();
    await expect(cancelled).toContainText("You haven't been charged");
  });

  test('provider view shows "You receive €300"', async ({ page, context }) => {
    await signIn(context, provider);
    await openGigs(page, `/gigs/contracts/${seeded!.contractId}`, { signedIn: true });
    await expect(page.getByRole('heading', { level: 1, name: /^Contract/ })).toBeVisible();
    await expect(page.locator('#main')).toContainText('You receive €300');
  });

  test('job room tabs: order, selection, panels, arrow keys', async ({ page, context }) => {
    await signIn(context, customer);
    await openGigs(page, `/gigs/contracts/${seeded!.contractId}`, { signedIn: true });
    const tablist = page.getByRole('tablist', { name: 'Job room' });
    const tabs = tablist.getByRole('tab');
    const names = ['Plan', 'Status', 'Activity', 'Artifacts', 'Milestones', 'Messages', 'Steering', 'QA', 'Delivery'];
    await expect(tabs).toHaveText(names.map((n) => new RegExp(`^\\s*${n}\\b`)));
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText(plan);

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('Awaiting payment');

    for (let i = 2; i < names.length; i += 1) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
      const panel = page.getByRole('tabpanel');
      await expect(panel).toBeVisible();
      await expect(panel).not.toHaveText(/^\s*$/);
    }

    await tabs.nth(0).click();
    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(0)).toBeFocused();
    await expect(page.getByRole('tabpanel')).toContainText(plan);
  });

  test('after payment the status reads "In progress"', async ({ page, context, request }) => {
    const c = uid('paidcustomer');
    const p = uid('paidprovider');
    const paid = await seedContract(request, { customer: c, provider: p, title: `Paid job ${W}`, plan: 'Paid plan.' });
    await markContractPaid(request, paid.contractId, paid.totalCents);
    await signIn(context, c);
    await openGigs(page, `/gigs/contracts/${paid.contractId}`, { signedIn: true });
    await expect(page.locator('#main')).toContainText('In progress');
  });

  test('access control: a third user gets 404, signed out goes to sign-in', async ({ page, browser }, testInfo) => {
    const ctx = await newProjectContext(browser, testInfo, uid('ctstranger'));
    try {
      const p = await ctx.newPage();
      const res = await p.goto(`/gigs/contracts/${seeded!.contractId}`);
      expect(res?.status()).toBe(404);
    } finally {
      await ctx.close();
    }
    await page.goto(`/gigs/contracts/${seeded!.contractId}`);
    await page.waitForURL(/\/sign-in/);
  });
});

// ---------------------------------------------------------------------------
// 6. Jobs MCP docs

test.describe('Jobs MCP docs', () => {
  const SECTIONS = [
    'What is the Jobs MCP?',
    'Sign in with OAuth',
    'Link Stripe before you bid',
    'Set up your client',
    'Tools',
    'Submitting work with send_project',
    'Steering etiquette',
    'How QA works',
    'Fees',
    'Troubleshooting',
  ];
  const CLIENTS = ['Claude Code', 'Claude Desktop', 'Tex assistant', 'Cursor', 'Other MCP clients'];
  const TOOLS = [
    'jobs_search',
    'jobs_get',
    'offers_post',
    'offers_list_mine',
    'jobs_bid',
    'jobs_withdraw_bid',
    'contracts_list',
    'contract_get',
    'contract_accept_version',
    'progress_post',
    'milestone_update',
    'steering_list',
    'steering_respond',
    'whoami',
    'send_project',
    'qa_status',
    'qa_report_get',
  ];

  test('heading, on-this-page nav, MCP URL, sections, clients, tools', async ({ page }) => {
    await openGigs(page, '/gigs/docs/mcp');
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs MCP' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'On this page' })).toBeAttached();
    await expect(page.locator('#main')).toContainText(/https?:\/\/\S+\/api\/jobs\/mcp\b/);
    for (const name of SECTIONS) {
      await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
    }
    for (const name of CLIENTS) {
      await expect(page.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
    }
    for (const name of TOOLS) {
      await expect(page.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
    }
    await expect(page.locator('pre').filter({ hasText: 'claude mcp add --transport http' })).toHaveCount(1);
  });

  test('content: GitHub token rules, error codes, QA verdicts, fees', async ({ page }) => {
    await openGigs(page, '/gigs/docs/mcp');
    const main = page.locator('#main');
    for (const text of [
      /private/i,
      /fine-grained/i,
      /read-only/i,
      /commit/i,
      'ghp_',
      'public_repo',
      'classic_pat',
      'pat_too_broad',
      'validated',
      'requires_changes',
      'rejected',
      /on top/i,
      /full bid/i,
    ]) {
      await expect(main).toContainText(text);
    }
  });

  test('copy buttons copy the code block and then read "Copied"', async ({ page, context, baseURL }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL ?? 'http://localhost:3100').origin });
    await openGigs(page, '/gigs/docs/mcp');
    const blocks = (await page.locator('pre').allInnerTexts()).map((t) => t.trim());
    expect(blocks.length).toBeGreaterThan(0);
    const buttons = page.getByRole('button', { name: /^Copy/ });
    expect(await buttons.count()).toBeGreaterThanOrEqual(blocks.length);
    await buttons.first().click();
    await expect(page.getByRole('button', { name: /^Copied/ }).first()).toBeVisible();
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).trim();
    expect(blocks).toContain(copied);
  });

  test('canonical, indexable, no horizontal scroll at 390px', async ({ page }) => {
    await openGigs(page, '/gigs/docs/mcp');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\/.+\/gigs\/docs\/mcp$/);
    expect(await robotsMeta(page)).not.toContain('noindex');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Admin QA docs

test.describe('Admin QA docs', () => {
  test('admin sees the page; noindex', async ({ page, context }) => {
    test.skip(!ADMIN_USER, 'QA_E2E_ADMIN_USER not set');
    await signIn(context, ADMIN_USER);
    const res = await openGigs(page, '/gigs/docs/admin-qa', { signedIn: true });
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Admin QA MCP' })).toBeVisible();
    await expect(page.locator('#main')).toContainText(/\/api\/admin\/qa\/mcp\b/);
    expect(await robotsMeta(page)).toContain('noindex');
  });

  test('non-admin and signed-out visitors get 404', async ({ page, browser }, testInfo) => {
    const signedOut = await page.goto('/gigs/docs/admin-qa');
    expect(signedOut?.status()).toBe(404);
    const ctx = await newProjectContext(browser, testInfo, uid('notadmin'));
    try {
      const p = await ctx.newPage();
      const res = await p.goto('/gigs/docs/admin-qa');
      expect(res?.status()).toBe(404);
      await expect(p.getByRole('heading', { name: 'Admin QA MCP' })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Sitemap

test.describe('sitemap', () => {
  test('lists the MCP docs and open jobs, never drafts', async ({ request }) => {
    const owner = uid('smowner');
    const W = uniqueWord('sitemap');
    const open = await publishedJob(request, owner, W);
    const draft = await createJob(request, owner, { title: `Sitemap draft ${W}` });
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g), (m) => m[1]);
    expect(locs.some((l) => l.endsWith('/gigs/docs/mcp'))).toBe(true);
    expect(locs.some((l) => l.endsWith(`/gigs/jobs/${open.id}`))).toBe(true);
    expect(xml).not.toContain(draft.id);
  });
});
