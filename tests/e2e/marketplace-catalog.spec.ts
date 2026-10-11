import { expect, test, type Page } from '@playwright/test';
import { blockThirdParty } from './surface-helpers';
import { card, cardNames } from '../support/marketplace-bridge';

test.skip(process.env.MARKETPLACE_E2E !== '1', 'marketplace e2e runs via npm run test:e2e:marketplace');

/**
 * Catalog contract: GET /marketplace (public), seeded with CATALOG_FIXTURES.
 * Other e2e files install, rate and approve in parallel, so this file never asserts the unfiltered
 * total, the install counts of packages others install, or the order of ties those writes create.
 */

const KINDS = [
  ['All', null],
  ['MCP servers', 'mcp'],
  ['Skills', 'skill'],
  ['Plugins', 'plugin'],
  ['A2A agents', 'a2a'],
  ['Sub-agents', 'subagent'],
  ['Workflows', 'workflow'],
] as const;
const KIND_LABELS = ['MCP server', 'Skill', 'Plugin', 'A2A agent', 'Sub-agent', 'Workflow'];
const CATEGORIES = [
  'All categories',
  'Developer tools',
  'Productivity',
  'Communication',
  'Data',
  'Research',
  'Design',
  'Security',
  'Other',
];

const kindNav = (page: Page) =>
  page.getByRole('group', { name: 'Kind' }).or(page.getByRole('navigation', { name: 'Kind' })).first();
const searchBox = (page: Page) => page.getByRole('searchbox', { name: 'Search the marketplace' });
const category = (page: Page) => page.getByRole('combobox', { name: 'Category' });
const sortBy = (page: Page) => page.getByRole('combobox', { name: 'Sort by' });
const params = (page: Page) => new URL(page.url()).searchParams;

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
});

test.describe('desktop', () => {
  test('shows the Marketplace heading and a labelled search box', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByRole('heading', { level: 1, name: 'Marketplace' })).toBeVisible();
    await expect(searchBox(page)).toBeVisible();
  });

  test('search submits q and shows only matching packages', async ({ page }) => {
    await page.goto('/marketplace');
    await searchBox(page).fill('pdf');
    await searchBox(page).press('Enter');
    await expect(page).toHaveURL(/[?&]q=pdf\b/);
    await expect(card(page, 'PDF Summarizer')).toBeVisible();
    await expect(card(page, 'GitHub Tools')).toHaveCount(0);
    for (const text of await page.getByRole('article').allTextContents()) {
      expect(text.toLowerCase()).toContain('pdf');
    }
  });

  test('?q=pdf loaded directly shows PDF Summarizer', async ({ page }) => {
    await page.goto('/marketplace?q=pdf');
    await expect(card(page, 'PDF Summarizer')).toBeVisible();
    await expect(searchBox(page)).toHaveValue('pdf');
  });

  test('kind filter lists every kind, marks All active by default and links each kind value', async ({ page }) => {
    await page.goto('/marketplace');
    const nav = kindNav(page);
    for (const [label, value] of KINDS) {
      const link = nav.getByRole('link', { name: label, exact: true });
      await expect(link).toBeVisible();
      const href = new URL((await link.getAttribute('href')) ?? '', page.url());
      expect(href.pathname).toBe('/marketplace');
      expect(href.searchParams.get('kind')).toBe(value);
    }
    await expect(nav.getByRole('link', { name: 'All', exact: true })).toHaveAttribute('aria-current', 'true');
    await expect(nav.getByRole('link', { name: 'Skills', exact: true })).not.toHaveAttribute('aria-current', 'true');
  });

  test('choosing Skills keeps the search term', async ({ page }) => {
    await page.goto('/marketplace?q=sample');
    await kindNav(page).getByRole('link', { name: 'Skills', exact: true }).click();
    await expect(page).toHaveURL(/kind=skill/);
    expect(params(page).get('q')).toBe('sample');
    await expect(kindNav(page).getByRole('link', { name: 'Skills', exact: true })).toHaveAttribute('aria-current', 'true');
  });

  test('choosing Skills drops the page number', async ({ page }) => {
    await page.goto('/marketplace?page=2');
    await kindNav(page).getByRole('link', { name: 'Skills', exact: true }).click();
    await expect(page).toHaveURL(/kind=skill/);
    expect(params(page).has('page')).toBe(false);
  });

  test('category select offers every category and filters to developer-tools', async ({ page }) => {
    await page.goto('/marketplace');
    const select = category(page);
    await expect(select).toBeVisible();
    const options = (await select.locator('option').allTextContents()).map((t) => t.trim());
    expect(options).toEqual(CATEGORIES);
    await select.selectOption({ label: 'Developer tools' });
    await expect(page).toHaveURL(/category=developer-tools/);
    await expect(page.getByText('3 packages', { exact: true })).toBeVisible();
    await expect.poll(async () => (await cardNames(page)).sort()).toEqual(['Code Reviewer', 'GitHub Tools', 'Release Workflow']);
  });

  test('Most popular is the default sort and orders by installs', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(sortBy(page).locator('option:checked')).toHaveText('Most popular');
    const options = (await sortBy(page).locator('option').allTextContents()).map((t) => t.trim());
    expect(options).toEqual(['Most popular', 'Newest', 'Top rated']);
    await expect(page.getByRole('article')).toHaveCount(12);
    const names = await cardNames(page);
    expect(names.slice(0, 2)).toEqual(['GitHub Tools', 'PDF Summarizer']);
    expect(names.indexOf('Slack Notifier')).toBeLessThan(names.indexOf('Code Reviewer'));
    expect(names.indexOf('Travel Planner Agent')).toBeLessThan(names.indexOf('Release Workflow'));
  });

  test('Top rated sorts by rating', async ({ page }) => {
    await page.goto('/marketplace');
    await sortBy(page).selectOption({ label: 'Top rated' });
    await expect(page).toHaveURL(/sort=top/);
    await expect.poll(async () => (await cardNames(page)).slice(0, 2)).toEqual(['PDF Summarizer', 'GitHub Tools']);
  });

  test('Newest sorts by publish date', async ({ page }) => {
    await page.goto('/marketplace');
    await sortBy(page).selectOption({ label: 'Newest' });
    await expect(page).toHaveURL(/sort=new/);
    const order = async () => {
      const names = await cardNames(page);
      return ['Release Workflow', 'Code Reviewer', 'Travel Planner Agent', 'GitHub Tools'].map((n) => names.indexOf(n));
    };
    // Release Workflow (2026-10-01), Code Reviewer, Travel Planner Agent, GitHub Tools (2026-09-01).
    await expect.poll(async () => {
      const o = await order();
      return o.every((i) => i >= 0) && o.every((v, i) => i === 0 || o[i - 1] < v);
    }).toBe(true);
  });

  test('Newest within skills puts PDF Summarizer first', async ({ page }) => {
    await page.goto('/marketplace?kind=skill&sort=new');
    await expect.poll(async () => (await cardNames(page)).slice(0, 2)).toEqual(['PDF Summarizer', 'Sample Golf']);
  });

  test('choosing Most popular again removes the sort param', async ({ page }) => {
    await page.goto('/marketplace?sort=top');
    await sortBy(page).selectOption({ label: 'Most popular' });
    await expect.poll(() => params(page).has('sort')).toBe(false);
    await expect(sortBy(page).locator('option:checked')).toHaveText('Most popular');
  });

  test('Installed only checkbox sets installed=1', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByRole('checkbox', { name: 'Installed only' }).check();
    await expect(page).toHaveURL(/installed=1/);
  });

  test('tags are links that filter, and the tag filter can be removed', async ({ page }) => {
    await page.goto('/marketplace');
    const tag = card(page, 'GitHub Tools').getByRole('link', { name: 'github', exact: true });
    await expect(tag).toBeVisible();
    await tag.click();
    await expect(page).toHaveURL(/tag=github/);
    await expect.poll(async () => (await cardNames(page)).sort()).toEqual(['Code Reviewer', 'GitHub Tools']);
    await page.getByRole('button', { name: 'Remove tag filter' }).click();
    await expect.poll(() => params(page).has('tag')).toBe(false);
    await expect(card(page, 'PDF Summarizer')).toBeVisible();
  });

  test('?tag=github loaded directly shows GitHub Tools and Code Reviewer only', async ({ page }) => {
    await page.goto('/marketplace?tag=github');
    await expect(page.getByRole('button', { name: 'Remove tag filter' })).toBeVisible();
    await expect.poll(async () => (await cardNames(page)).sort()).toEqual(['Code Reviewer', 'GitHub Tools']);
  });

  test('filter state in the URL drives the result and the controls', async ({ page }) => {
    await page.goto('/marketplace?kind=skill&sort=top');
    await expect(kindNav(page).getByRole('link', { name: 'Skills', exact: true })).toHaveAttribute('aria-current', 'true');
    await expect(kindNav(page).getByRole('link', { name: 'All', exact: true })).not.toHaveAttribute('aria-current', 'true');
    await expect(sortBy(page).locator('option:checked')).toHaveText('Top rated');
    await expect(page.getByText('8 packages', { exact: true })).toBeVisible();
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(8);
    for (let i = 0; i < 8; i++) {
      await expect(cards.nth(i).getByText('Skill', { exact: true })).toBeVisible();
    }
    await expect.poll(async () => (await cardNames(page))[0]).toBe('PDF Summarizer');
  });

  test('result count uses the singular for one package', async ({ page }) => {
    await page.goto('/marketplace?kind=subagent');
    await expect(page.getByText('1 package', { exact: true })).toBeVisible();
    await expect.poll(() => cardNames(page)).toEqual(['Code Reviewer']);
  });

  test('no results shows a message and a Clear filters link', async ({ page }) => {
    await page.goto('/marketplace?q=zzzz-no-match');
    await expect(page.getByText('No packages match your filters')).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect.poll(() => new URL(page.url()).search).toBe('');
    expect(new URL(page.url()).pathname).toBe('/marketplace');
    await expect(card(page, 'GitHub Tools')).toBeVisible();
  });

  test('pages through 12 cards at a time', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByRole('article')).toHaveCount(12);
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    await page.getByRole('link', { name: 'Next page' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(card(page, 'Sample Golf')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Previous page' })).toBeVisible();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
  });

  test('a card shows name link, publisher, description, kind, rating, installs, Verified and Install', async ({ page }) => {
    await page.goto('/marketplace');
    const c = card(page, 'GitHub Tools');
    const link = c.getByRole('heading').getByRole('link', { name: 'GitHub Tools', exact: true });
    await expect(link).toBeVisible();
    expect(new URL((await link.getAttribute('href')) ?? '', page.url()).pathname).toBe('/marketplace/fx-github-mcp');
    await expect(c.getByText('by Tulzo Labs')).toBeVisible();
    await expect(c.getByText('Search issues, review pull requests and manage repositories from your assistant.')).toBeVisible();
    await expect(c.getByText('MCP server', { exact: true })).toBeVisible();
    await expect(c.getByText('4.5', { exact: true })).toBeVisible();
    const rated = 'Rated 4.5 out of 5 from 2 ratings';
    await expect(c.getByRole('img', { name: rated }).or(c.getByLabel(rated, { exact: true })).first()).toBeAttached();
    await expect(c.getByText('1.5k installs')).toBeVisible();
    await expect(c.getByText('Verified', { exact: true })).toBeVisible();
    await expect(c.getByRole('button', { name: 'Install GitHub Tools' })).toBeEnabled();
  });

  test('cards show single-rating, unrated, unverified and translated states', async ({ page }) => {
    await page.goto('/marketplace');
    const reviewer = card(page, 'Code Reviewer');
    await expect(reviewer.getByText('Sub-agent', { exact: true })).toBeVisible();
    await expect(reviewer.getByText('Translated', { exact: true })).toBeVisible();
    const rated = /^Rated 4(\.0)? out of 5 from 1 rating$/;
    await expect(reviewer.getByRole('img', { name: rated }).or(reviewer.getByLabel(rated)).first()).toBeAttached();

    const travel = card(page, 'Travel Planner Agent');
    await expect(travel.getByText('A2A agent', { exact: true })).toBeVisible();
    await expect(travel.getByText('No ratings yet')).toBeVisible();
    await expect(travel.getByText('Verified', { exact: true })).toHaveCount(0);

    const pdf = card(page, 'PDF Summarizer');
    await expect(pdf.getByText('Skill', { exact: true })).toBeVisible();
    await expect(pdf.getByText('860 installs')).toBeVisible();
    await expect(card(page, 'Slack Notifier').getByText('Plugin', { exact: true })).toBeVisible();
    await expect(card(page, 'Release Workflow').getByText('Workflow', { exact: true })).toBeVisible();
  });

  test('every card has exactly one kind label and only Code Reviewer is Translated', async ({ page }) => {
    await page.goto('/marketplace');
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(12);
    const names = await cardNames(page);
    for (let i = 0; i < names.length; i++) {
      let labels = 0;
      for (const label of KIND_LABELS) labels += await cards.nth(i).getByText(label, { exact: true }).count();
      expect(labels, `${names[i]} kind labels`).toBe(1);
      const translated = await cards.nth(i).getByText('Translated', { exact: true }).count();
      expect(translated, `${names[i]} Translated`).toBe(names[i] === 'Code Reviewer' ? 1 : 0);
      await expect(cards.nth(i).getByRole('button', { name: `Install ${names[i]}` })).toBeVisible();
    }
  });

  test('a single install reads "1 install"', async ({ page }) => {
    await page.goto('/marketplace?page=2');
    await expect(card(page, 'Sample Golf').getByText('1 install', { exact: true })).toBeVisible();
  });

  test('filter controls are inline and there is no Filters button', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(category(page)).toBeVisible();
    await expect(sortBy(page)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Installed only' })).toBeVisible();
    await expect(kindNav(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeHidden();
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('filter controls hide behind a Filters button; the search box stays visible', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(searchBox(page)).toBeVisible();
    const button = page.getByRole('button', { name: 'Filters', exact: true });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(category(page)).toBeHidden();
    await expect(sortBy(page)).toBeHidden();
    await expect(page.getByRole('checkbox', { name: 'Installed only' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Skills', exact: true })).toBeHidden();

    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Filters' });
    await expect(dialog).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(dialog.getByRole('combobox', { name: 'Category' })).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Sort by' })).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Installed only' })).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Skills', exact: true })).toBeVisible();
  });

  test('Show results applies the choices and closes the sheet', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Filters' });
    await dialog.getByRole('combobox', { name: 'Sort by' }).selectOption({ label: 'Top rated' });
    await dialog.getByRole('button', { name: 'Show results' }).click();
    await expect(page).toHaveURL(/sort=top/);
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await cardNames(page)).slice(0, 2)).toEqual(['PDF Summarizer', 'GitHub Tools']);
  });

  test('Escape closes the Filters sheet', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Filters' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toHaveAttribute('aria-expanded', 'false');
  });
});
