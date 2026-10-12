import { test, expect, type Locator, type Page } from '@playwright/test';
import { GIGS_ENV_MISSING, detailJobInput, linkStripe, openGigs, publishJob, signIn, uid, uniqueWord } from '../support/gigs-ui';

// Label/input alignment on the offer form and the bid form, by bounding box. Runs under
// `npm run test:e2e:gigs`. Desktop: fields side by side in a row start their labels on one line and
// their inputs on one line. Mobile (390px, one column): every label sits the same distance above its
// input, flush with its left edge.

test.skip(GIGS_ENV_MISSING, 'gigs e2e env not set');

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const TOLERANCE = 1;

interface FieldBoxes {
  name: string;
  label: { x: number; y: number; bottom: number };
  control: { x: number; y: number };
}

async function boxes(form: Locator, name: string, control: Locator): Promise<FieldBoxes> {
  const label = await form.getByText(name, { exact: true }).boundingBox();
  const input = await control.boundingBox();
  expect(label, `label "${name}" is rendered`).not.toBeNull();
  expect(input, `control "${name}" is rendered`).not.toBeNull();
  return {
    name,
    label: { x: label!.x, y: label!.y, bottom: label!.y + label!.height },
    control: { x: input!.x, y: input!.y },
  };
}

function expectClose(actual: number, expected: number, what: string): void {
  expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(TOLERANCE);
}

/** Every field's label starts at its control's left edge. */
function expectLabelsFlush(fields: FieldBoxes[]): void {
  for (const f of fields) expectClose(f.label.x, f.control.x, `"${f.name}" label left edge`);
}

/** Fields in one row: label tops line up and control tops line up. */
function expectRow(fields: FieldBoxes[]): void {
  const [first, ...rest] = fields;
  for (const f of rest) {
    expectClose(f.label.y, first.label.y, `"${f.name}" label top vs "${first.name}"`);
    expectClose(f.control.y, first.control.y, `"${f.name}" control top vs "${first.name}"`);
  }
}

/** One column: each label is the same distance above its control. */
function expectColumn(fields: FieldBoxes[]): void {
  const gap = (f: FieldBoxes) => f.control.y - f.label.bottom;
  const [first, ...rest] = fields;
  for (const f of rest) expectClose(gap(f), gap(first), `"${f.name}" label-to-input gap vs "${first.name}"`);
}

async function offerForm(page: Page) {
  const form = page.getByRole('form', { name: 'Offer a service' });
  await expect(form).toBeVisible();
  return Promise.all([
    boxes(form, 'Title', form.getByRole('textbox', { name: 'Title' })),
    boxes(form, 'Description', form.getByRole('textbox', { name: 'Description' })),
    boxes(form, 'Labels (comma separated)', form.getByRole('textbox', { name: 'Labels (comma separated)' })),
    boxes(form, 'Category', form.getByRole('combobox', { name: 'Category' })),
    boxes(form, 'Price (€)', form.getByRole('spinbutton', { name: 'Price (€)' })),
    boxes(form, 'Delivery time (days)', form.getByRole('spinbutton', { name: 'Delivery time (days)' })),
  ]);
}

async function bidForm(page: Page) {
  const form = page.getByRole('form', { name: 'Place a bid' });
  await expect(form).toBeVisible();
  return Promise.all([
    boxes(form, 'Your price (€)', form.getByRole('spinbutton', { name: 'Your price (€)' })),
    boxes(form, 'Delivery estimate (days)', form.getByRole('spinbutton', { name: 'Delivery estimate (days)' })),
    boxes(form, 'Plan', form.getByRole('textbox', { name: 'Plan', exact: true })),
    boxes(form, 'Deliverables (one per line)', form.getByRole('textbox', { name: 'Deliverables (one per line)' })),
    boxes(form, 'Steering interactions included', form.getByRole('spinbutton', { name: 'Steering interactions included' })),
    boxes(form, 'Assumptions (one per line)', form.getByRole('textbox', { name: 'Assumptions (one per line)' })),
  ]);
}

test.describe('offer form layout', () => {
  test.beforeEach(async ({ page, context, request }) => {
    const seller = uid('layoutseller');
    await linkStripe(request, seller);
    await signIn(context, seller);
    await page.setViewportSize(DESKTOP);
    await openGigs(page, '/gigs/offers/new', { signedIn: true });
  });

  test('desktop: paired fields line up by label and by input', async ({ page }) => {
    const [title, description, labels, category, price, days] = await offerForm(page);
    expectLabelsFlush([title, description, labels, category, price, days]);
    expectRow([labels, category]);
    expectRow([price, days]);
  });

  test('mobile: one column with the same label-to-input spacing', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const fields = await offerForm(page);
    expectLabelsFlush(fields);
    expectColumn(fields);
  });
});

test.describe('bid form layout', () => {
  test.beforeEach(async ({ page, context, request }) => {
    const job = await publishJob(request, uid('layoutowner'), detailJobInput(uniqueWord('layout')));
    const bidder = uid('layoutbidder');
    await linkStripe(request, bidder);
    await signIn(context, bidder);
    await page.setViewportSize(DESKTOP);
    await openGigs(page, `/gigs/jobs/${job.id}`, { signedIn: true });
  });

  test('desktop: price and delivery estimate line up by label and by input', async ({ page }) => {
    const fields = await bidForm(page);
    expectLabelsFlush(fields);
    expectRow([fields[0], fields[1]]);
  });

  test('mobile: one column with the same label-to-input spacing', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const fields = await bidForm(page);
    expectLabelsFlush(fields);
    expectColumn(fields);
  });
});
