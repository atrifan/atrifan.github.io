import { expect, test, type Page } from '@playwright/test';
import {
  GIGS_ENV_MISSING,
  TABLET,
  detailJobInput,
  ensureListing,
  fillBidForm,
  isDesktopProject,
  isMobileProject,
  linkStripe,
  newApi,
  openGigs,
  projectTag,
  publishJob,
  screenshotMasks,
  seedComparison,
  seedContract,
  signInWithHeader as signIn,
  uid,
  wizardData,
  wizardTo,
} from '../support/gigs-ui';

/**
 * Visual baselines for the gigs pages in light/dark x desktop/mobile, plus tablet
 * (768) shots of the listing, job detail and docs in the desktop projects.
 *
 * Everything rendered is fixed per project: titles and descriptions use a fixed
 * per-project word, deadlines are absolute (1 Mar 2027), listing shots filter by
 * that word, and the listing seed is idempotent (checked with GET first). Ids that
 * differ per run never reach the page text. Masked: ad slots and Clerk widgets.
 */

test.skip(GIGS_ENV_MISSING, 'gigs e2e env not set');

const listWord = (tag: string) => `zqvl${tag}`;
const detailWord = (tag: string) => `zqvd${tag}`;
const WIZARD_TITLE = 'CSV importer for the shop';

/** A full-page shot; dialogs and sheets are shot at the viewport, which is what a user sees of a modal. */
async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // Typing scrolls the page and leaves a focus ring; a full-page shot of a scrolled page draws the
  // sticky header mid-page. Start every shot from the top with nothing focused.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot(name, { fullPage: opts.fullPage ?? true, mask: screenshotMasks(page) });
}

test.describe('gigs listing', () => {
  // One worker per project seeds the fixed listing, so retries and parallel tests never duplicate it.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120_000);
    const api = await newApi(playwright, testInfo);
    try {
      await ensureListing(api, listWord(projectTag(testInfo)));
    } finally {
      await api.dispose();
    }
  });

  test('empty filtered list', async ({ page }) => {
    await openGigs(page, '/gigs?q=zqvnothingmatchesthis');
    await expect(page.getByRole('heading', { name: 'No jobs match' })).toBeVisible();
    await shot(page, 'gigs-list-empty.png');
  });

  test('filtered jobs list', async ({ page }, testInfo) => {
    await openGigs(page, `/gigs?q=${listWord(projectTag(testInfo))}`);
    await expect(page.getByRole('list', { name: 'Jobs' }).getByRole('listitem').first()).toBeVisible();
    await shot(page, 'gigs-list-filtered.png');
  });

  test('offers list', async ({ page }, testInfo) => {
    await openGigs(page, `/gigs?tab=offers&q=${listWord(projectTag(testInfo))}`);
    await expect(page.getByRole('list', { name: 'Offers' }).getByRole('listitem').first()).toBeVisible();
    await shot(page, 'gigs-offers.png');
  });

  test('mobile filter sheet open', async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'mobile projects only');
    await openGigs(page, `/gigs?q=${listWord(projectTag(testInfo))}`);
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await shot(page, 'gigs-filter-sheet.png', { fullPage: false });
  });

  test('tablet: filtered jobs list', async ({ page }, testInfo) => {
    test.skip(!isDesktopProject(testInfo), 'tablet runs in the desktop projects');
    await page.setViewportSize(TABLET);
    await openGigs(page, `/gigs?q=${listWord(projectTag(testInfo))}`);
    await expect(page.getByRole('list', { name: 'Jobs' }).getByRole('listitem').first()).toBeVisible();
    await shot(page, 'gigs-list-tablet.png');
  });
});

test.describe('post a job wizard', () => {
  test('describe', async ({ page, context }) => {
    await signIn(context, uid('vposter'));
    await wizardTo(page, 'describe', wizardData(WIZARD_TITLE));
    await shot(page, 'gigs-post-describe.png');
  });

  test('draft', async ({ page, context }) => {
    await signIn(context, uid('vposter'));
    await wizardTo(page, 'draft', wizardData(WIZARD_TITLE));
    await shot(page, 'gigs-post-draft.png');
  });

  test('edit (filled)', async ({ page, context }) => {
    await signIn(context, uid('vposter'));
    await wizardTo(page, 'edit', wizardData(WIZARD_TITLE), { qa: ['Code review'] });
    await page.getByLabel('Deadline', { exact: true }).fill('2027-03-01');
    await page.getByRole('spinbutton', { name: 'Min budget (€)' }).fill('200');
    await page.getByRole('spinbutton', { name: 'Max budget (€)' }).fill('400');
    await shot(page, 'gigs-post-edit.png');
  });

  test('publish', async ({ page, context }) => {
    await signIn(context, uid('vposter'));
    await wizardTo(page, 'publish', wizardData(WIZARD_TITLE), { qa: ['Code review'] });
    await shot(page, 'gigs-post-publish.png');
  });
});

test.describe('offer a service', () => {
  test('Stripe gate', async ({ page, context }) => {
    await signIn(context, uid('vgate'));
    await openGigs(page, '/gigs/offers/new', { signedIn: true });
    await expect(page.getByRole('heading', { name: 'Link Stripe to offer services' })).toBeVisible();
    await shot(page, 'gigs-offer-gate.png');
  });

  test('offer form (filled)', async ({ page, context, request }) => {
    const seller = uid('vseller');
    await linkStripe(request, seller);
    await signIn(context, seller);
    await openGigs(page, '/gigs/offers/new', { signedIn: true });
    await page.getByRole('textbox', { name: 'Title' }).fill('Spreadsheet clean-up');
    await page.getByRole('textbox', { name: 'Description' }).fill('I clean, dedupe and normalise spreadsheets.');
    await page.getByRole('textbox', { name: 'Labels (comma separated)' }).fill('csv, cleanup');
    await page.getByRole('combobox', { name: 'Category' }).selectOption('data');
    await page.getByRole('spinbutton', { name: 'Price (€)' }).fill('150');
    await page.getByRole('spinbutton', { name: 'Delivery time (days)' }).fill('5');
    await expect(page.getByText(/customers pay €172\.50/i)).toBeVisible();
    await shot(page, 'gigs-offer-form.png');
  });
});

test.describe('job detail', () => {
  test('signed out', async ({ page, request }, testInfo) => {
    const job = await publishJob(request, uid('vowner'), detailJobInput(detailWord(projectTag(testInfo))));
    await openGigs(page, `/gigs/jobs/${job.id}`);
    await expect(page.getByRole('link', { name: 'Sign in to bid' })).toBeVisible();
    await shot(page, 'gigs-job-detail.png');
  });

  test('tablet: signed out', async ({ page, request }, testInfo) => {
    test.skip(!isDesktopProject(testInfo), 'tablet runs in the desktop projects');
    const job = await publishJob(request, uid('vowner'), detailJobInput(detailWord(projectTag(testInfo))));
    await page.setViewportSize(TABLET);
    await openGigs(page, `/gigs/jobs/${job.id}`);
    await expect(page.getByRole('link', { name: 'Sign in to bid' })).toBeVisible();
    await shot(page, 'gigs-job-detail-tablet.png');
  });

  test('bid form with the breakdown filled', async ({ page, context, request }, testInfo) => {
    const job = await publishJob(request, uid('vowner'), detailJobInput(detailWord(projectTag(testInfo))));
    await signIn(context, uid('vbidder'));
    await openGigs(page, `/gigs/jobs/${job.id}`, { signedIn: true });
    await fillBidForm(page);
    await shot(page, 'gigs-bid-form.png');
  });

  test('owner bid comparison', async ({ page, context, request }, testInfo) => {
    const { owner, jobId } = await seedComparison(request, detailWord(projectTag(testInfo)));
    await signIn(context, owner);
    await openGigs(page, `/gigs/jobs/${jobId}`, { signedIn: true });
    await page.getByRole('combobox', { name: 'Sort bids by' }).selectOption({ label: 'Lowest price' });
    await expect(page.getByRole('list', { name: 'Bids' })).toBeVisible();
    await shot(page, 'gigs-bid-comparison.png');
  });

  test('accept dialog', async ({ page, context, request }, testInfo) => {
    const { owner, jobId } = await seedComparison(request, detailWord(projectTag(testInfo)));
    await signIn(context, owner);
    await openGigs(page, `/gigs/jobs/${jobId}`, { signedIn: true });
    await page.getByRole('combobox', { name: 'Sort bids by' }).selectOption({ label: 'Lowest price' });
    await page.getByRole('button', { name: 'Accept bid' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Accept this bid' })).toBeVisible();
    await shot(page, 'gigs-accept-dialog.png', { fullPage: false });
  });
});

test.describe('contract', () => {
  test('contract after checkout (success)', async ({ page, context, request }, testInfo) => {
    const customer = uid('vcustomer');
    const c = await seedContract(request, {
      customer,
      provider: uid('vprovider'),
      title: detailJobInput(detailWord(projectTag(testInfo))).title,
      plan: 'Stream the file, validate with a schema, add tests.',
    });
    await signIn(context, customer);
    await openGigs(page, `/gigs/contracts/${c.contractId}?checkout=success`, { signedIn: true });
    await expect(page.getByRole('tablist', { name: 'Job room' })).toBeVisible();
    await shot(page, 'gigs-contract.png');
  });
});

test.describe('docs', () => {
  test('Jobs MCP docs', async ({ page }) => {
    await openGigs(page, '/gigs/docs/mcp');
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs MCP' })).toBeVisible();
    await shot(page, 'gigs-docs-mcp.png');
  });

  test('tablet: Jobs MCP docs', async ({ page }, testInfo) => {
    test.skip(!isDesktopProject(testInfo), 'tablet runs in the desktop projects');
    await page.setViewportSize(TABLET);
    await openGigs(page, '/gigs/docs/mcp');
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs MCP' })).toBeVisible();
    await shot(page, 'gigs-docs-mcp-tablet.png');
  });
});
