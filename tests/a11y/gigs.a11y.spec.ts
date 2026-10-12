import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN_USER,
  GIGS_ENV_MISSING,
  TABLET,
  detailJobInput,
  ensureListing,
  expectNoBlockingAxe,
  expectNoHorizontalScroll,
  fillBidForm,
  isDesktopProject,
  isMobileProject,
  linkStripe,
  newApi,
  openGigs,
  projectTag,
  publishJob,
  seedComparison,
  seedContract,
  signIn,
  uid,
  wizardData,
  wizardTo,
} from '../support/gigs-ui';

/**
 * axe (wcag2a + wcag2aa, serious/critical fail) and no horizontal scroll on every
 * gigs page state, in light/dark x desktop/mobile, plus tablet (768) for the
 * listing, job detail and docs in the desktop projects.
 */

test.skip(GIGS_ENV_MISSING, 'gigs e2e env not set');

async function check(page: Page): Promise<void> {
  await expectNoBlockingAxe(page);
  await expectNoHorizontalScroll(page);
}

const listWord = (tag: string) => `zqal${tag}`;
const detailWord = (tag: string) => `zqad${tag}`;

test.describe('gigs listing', () => {
  test.beforeAll(async ({ playwright }, testInfo) => {
    test.setTimeout(120_000);
    const api = await newApi(playwright, testInfo);
    try {
      await ensureListing(api, listWord(projectTag(testInfo)));
    } finally {
      await api.dispose();
    }
  });

  test('jobs list', async ({ page }, testInfo) => {
    await openGigs(page, `/gigs?q=${listWord(projectTag(testInfo))}`);
    await expect(page.getByRole('list', { name: 'Jobs' })).toBeVisible();
    await check(page);
  });

  test('offers list', async ({ page }, testInfo) => {
    await openGigs(page, `/gigs?tab=offers&q=${listWord(projectTag(testInfo))}`);
    await expect(page.getByRole('list', { name: 'Offers' })).toBeVisible();
    await check(page);
  });

  test('empty filtered list', async ({ page }) => {
    await openGigs(page, '/gigs?q=zqnothingmatchesthis&category=design');
    await expect(page.getByRole('heading', { name: 'No jobs match' })).toBeVisible();
    await check(page);
  });

  test('mobile filter sheet open', async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), 'mobile projects only');
    await openGigs(page, `/gigs?q=${listWord(projectTag(testInfo))}`);
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await page.waitForTimeout(300);
    await check(page);
  });

  test('tablet: jobs list', async ({ page }, testInfo) => {
    test.skip(!isDesktopProject(testInfo), 'tablet runs in the desktop projects');
    await page.setViewportSize(TABLET);
    await openGigs(page, `/gigs?q=${listWord(projectTag(testInfo))}`);
    await check(page);
  });
});

test.describe('post a job wizard', () => {
  test('describe', async ({ page, context }) => {
    await signIn(context, uid('a11yposter'));
    await wizardTo(page, 'describe', wizardData('Accessible CSV importer'));
    await check(page);
  });

  test('describe with validation errors', async ({ page, context }) => {
    await signIn(context, uid('a11yposter'));
    await wizardTo(page, 'describe', wizardData('Accessible CSV importer'));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Give your job a title of at least 3 characters')).toBeVisible();
    await check(page);
  });

  test('draft', async ({ page, context }) => {
    await signIn(context, uid('a11yposter'));
    await wizardTo(page, 'draft', wizardData('Accessible CSV importer'));
    await check(page);
  });

  test('draft with the out-of-credits alert', async ({ page, context }) => {
    await signIn(context, uid('a11yposter'));
    await wizardTo(page, 'draft', wizardData('Accessible CSV importer'));
    await page.getByRole('button', { name: 'Draft with AI' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /out of credits/i })).toBeVisible();
    await check(page);
  });

  test('edit (filled)', async ({ page, context }) => {
    await signIn(context, uid('a11yposter'));
    await wizardTo(page, 'edit', wizardData('Accessible CSV importer'), { qa: ['Code review'] });
    await check(page);
  });

  test('edit with validation errors', async ({ page, context }) => {
    await signIn(context, uid('a11yposter'));
    await wizardTo(page, 'draft', wizardData('Accessible CSV importer'));
    await page.getByRole('button', { name: 'Write it myself' }).click();
    await page.waitForURL(/[?&]step=edit/);
    await page.getByRole('button', { name: 'Review and publish' }).click();
    await expect(page.getByText('Add at least one requirement')).toBeVisible();
    await check(page);
  });

  test('publish', async ({ page, context }) => {
    await signIn(context, uid('a11yposter'));
    await wizardTo(page, 'publish', wizardData('Accessible CSV importer'), { qa: ['Code review'] });
    await check(page);
  });
});

test.describe('offer a service', () => {
  test('Stripe gate', async ({ page, context }) => {
    await signIn(context, uid('a11ygate'));
    await openGigs(page, '/gigs/offers/new', { signedIn: true });
    await expect(page.getByRole('heading', { name: 'Link Stripe to offer services' })).toBeVisible();
    await check(page);
  });

  test('offer form (filled)', async ({ page, context, request }) => {
    const seller = uid('a11yseller');
    await linkStripe(request, seller);
    await signIn(context, seller);
    await openGigs(page, '/gigs/offers/new', { signedIn: true });
    await page.getByRole('textbox', { name: 'Title' }).fill('Spreadsheet clean-up');
    await page.getByRole('textbox', { name: 'Description' }).fill('I clean, dedupe and normalise spreadsheets.');
    await page.getByRole('spinbutton', { name: 'Price (€)' }).fill('150');
    await page.getByRole('spinbutton', { name: 'Delivery time (days)' }).fill('5');
    await expect(page.getByText(/customers pay €172\.50/i)).toBeVisible();
    await check(page);
  });
});

test.describe('job detail', () => {
  test('signed out', async ({ page, request }, testInfo) => {
    const job = await publishJob(request, uid('a11yowner'), detailJobInput(detailWord(projectTag(testInfo))));
    await openGigs(page, `/gigs/jobs/${job.id}`);
    await expect(page.getByRole('link', { name: 'Sign in to bid' })).toBeVisible();
    await check(page);
  });

  test('tablet: signed out', async ({ page, request }, testInfo) => {
    test.skip(!isDesktopProject(testInfo), 'tablet runs in the desktop projects');
    const job = await publishJob(request, uid('a11yowner'), detailJobInput(detailWord(projectTag(testInfo))));
    await page.setViewportSize(TABLET);
    await openGigs(page, `/gigs/jobs/${job.id}`);
    await check(page);
  });

  test('bid form with the breakdown filled', async ({ page, context, request }, testInfo) => {
    const job = await publishJob(request, uid('a11yowner'), detailJobInput(detailWord(projectTag(testInfo))));
    await signIn(context, uid('a11ybidder'));
    await openGigs(page, `/gigs/jobs/${job.id}`, { signedIn: true });
    await fillBidForm(page);
    await check(page);
  });

  test('owner bid comparison', async ({ page, context, request }, testInfo) => {
    const { owner, jobId } = await seedComparison(request, detailWord(projectTag(testInfo)));
    await signIn(context, owner);
    await openGigs(page, `/gigs/jobs/${jobId}`, { signedIn: true });
    await expect(page.getByRole('heading', { level: 2, name: 'Compare bids' })).toBeVisible();
    await check(page);
  });

  test('accept dialog open', async ({ page, context, request }, testInfo) => {
    const { owner, jobId } = await seedComparison(request, detailWord(projectTag(testInfo)));
    await signIn(context, owner);
    await openGigs(page, `/gigs/jobs/${jobId}`, { signedIn: true });
    await page.getByRole('button', { name: 'Accept bid' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Accept this bid' })).toBeVisible();
    await page.waitForTimeout(300);
    await check(page);
  });
});

test.describe('contract', () => {
  test('contract page after checkout (success state)', async ({ page, context, request }, testInfo) => {
    const customer = uid('a11ycustomer');
    const word = detailWord(projectTag(testInfo));
    const c = await seedContract(request, {
      customer,
      provider: uid('a11yprovider'),
      title: `CSV importer for the ${word} shop`,
      plan: 'Stream the file, validate with a schema, add tests.',
    });
    await signIn(context, customer);
    await openGigs(page, `/gigs/contracts/${c.contractId}?checkout=success`, { signedIn: true });
    await expect(page.getByRole('tablist', { name: 'Job room' })).toBeVisible();
    await check(page);
  });
});

test.describe('docs', () => {
  test('Jobs MCP docs', async ({ page }) => {
    await openGigs(page, '/gigs/docs/mcp');
    await expect(page.getByRole('heading', { level: 1, name: 'Jobs MCP' })).toBeVisible();
    await check(page);
  });

  test('tablet: Jobs MCP docs', async ({ page }, testInfo) => {
    test.skip(!isDesktopProject(testInfo), 'tablet runs in the desktop projects');
    await page.setViewportSize(TABLET);
    await openGigs(page, '/gigs/docs/mcp');
    await check(page);
  });

  test('Admin QA docs (admin)', async ({ page, context }) => {
    test.skip(!ADMIN_USER, 'QA_E2E_ADMIN_USER not set');
    await signIn(context, ADMIN_USER);
    await openGigs(page, '/gigs/docs/admin-qa', { signedIn: true });
    await expect(page.getByRole('heading', { level: 1, name: 'Admin QA MCP' })).toBeVisible();
    await check(page);
  });
});
