import type { Page } from '@playwright/test';
import { expect, fakeDevice, openAi, signedIn, test, text } from '../support/ai-fixtures';

/** No secret value anywhere: not in the text, not in any field. */
async function expectNoSecretValues(page: Page) {
  await expect(page.locator('body')).not.toContainText('SHOULD-NOT-SHOW');
  const inFields = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')).some((el) =>
      el.value.includes('SHOULD-NOT-SHOW'),
    ),
  );
  expect(inFields, 'a secret value is in a form field').toBe(false);
  expect(await page.content()).not.toContain('SHOULD-NOT-SHOW');
}

test.describe('Secrets /ai/secrets', () => {
  signedIn();

  test.beforeEach(async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/secrets');
    await expect(text(page, 'OPENAI_API_KEY')).toBeVisible();
  });

  test('lists name and description, never the value', async ({ page, bridge }) => {
    await bridge.expectSent('SECRETS_LIST', {});
    await expect(text(page, 'Used by the research skill')).toBeVisible();
    await expect(text(page, 'GITHUB_TOKEN')).toBeVisible();
    await expect(text(page, 'Repository access')).toBeVisible();
    await expectNoSecretValues(page);
  });

  test('Add secret sends SECRETS_ADD and shows it without its value', async ({ page, bridge }) => {
    await expect(page.getByRole('heading', { name: 'Add a secret', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('STRIPE_KEY');
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Billing');
    await page.getByLabel('Value', { exact: true }).fill('sk-test-new-SHOULD-NOT-SHOW');
    await expect(page.getByLabel('Value', { exact: true })).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Add secret', exact: true }).click();
    await bridge.expectSent('SECRETS_ADD', { name: 'STRIPE_KEY', description: 'Billing', value: 'sk-test-new-SHOULD-NOT-SHOW' });
    await expect(text(page, 'STRIPE_KEY')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('SHOULD-NOT-SHOW');
  });

  for (const name of ['stripe_key', 'Stripe', '1KEY', 'MY-KEY']) {
    test(`name "${name}" is refused and nothing is sent`, async ({ page, bridge }) => {
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
      await page.getByLabel('Value', { exact: true }).fill('abc');
      await page.getByRole('button', { name: 'Add secret', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'Name must be UPPER_CASE_UNDERSCORE' })).toBeVisible();
      expect(bridge.callsOf('SECRETS_ADD')).toEqual([]);
    });
  }

  test('an empty value is refused and nothing is sent', async ({ page, bridge }) => {
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('STRIPE_KEY');
    await page.getByRole('button', { name: 'Add secret', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Value is required' })).toBeVisible();
    expect(bridge.callsOf('SECRETS_ADD')).toEqual([]);
  });

  test('Edit without a new value sends only name and description', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Edit OPENAI_API_KEY', exact: true }).click();
    const description = page.getByRole('textbox', { name: 'Description for OPENAI_API_KEY', exact: true });
    await expect(description).toHaveValue('Used by the research skill');
    await expect(page.getByLabel('New value for OPENAI_API_KEY', { exact: true })).toHaveValue('');
    await expectNoSecretValues(page);
    await description.fill('Used by research and writing');
    await page.getByRole('button', { name: 'Save OPENAI_API_KEY', exact: true }).click();
    await bridge.expectSent('SECRETS_UPDATE', { name: 'OPENAI_API_KEY', description: 'Used by research and writing' });
    await expect(text(page, 'Used by research and writing')).toBeVisible();
  });

  test('Edit with a new value sends it too', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Edit GITHUB_TOKEN', exact: true }).click();
    await page.getByLabel('New value for GITHUB_TOKEN', { exact: true }).fill('ghp-new-SHOULD-NOT-SHOW');
    await page.getByRole('button', { name: 'Save GITHUB_TOKEN', exact: true }).click();
    await bridge.expectSent('SECRETS_UPDATE', { name: 'GITHUB_TOKEN', description: 'Repository access', value: 'ghp-new-SHOULD-NOT-SHOW' });
    await expect(text(page, 'Repository access')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('SHOULD-NOT-SHOW');
  });

  test('Remove then Confirm remove', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Remove GITHUB_TOKEN', exact: true }).click();
    expect(bridge.callsOf('SECRETS_REMOVE')).toEqual([]);
    await page.getByRole('button', { name: 'Confirm remove', exact: true }).click();
    await bridge.expectSent('SECRETS_REMOVE', { name: 'GITHUB_TOKEN' });
    await expect(page.getByText('GITHUB_TOKEN', { exact: true })).toHaveCount(0);
  });

  test('a failed change shows its error', async ({ page, bridge }) => {
    bridge.fail('SECRETS_ADD', 'Keychain is locked');
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('STRIPE_KEY');
    await page.getByLabel('Value', { exact: true }).fill('abc');
    await page.getByRole('button', { name: 'Add secret', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Keychain is locked' })).toBeVisible();
  });
});

test.describe('Allowlist /ai/allowlist', () => {
  signedIn();

  test.beforeEach(async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/allowlist');
    await expect(text(page, 'example.com')).toBeVisible();
  });

  test('lists hosts with where they come from', async ({ page, bridge }) => {
    await bridge.expectSent('WHITELIST_LIST', {});
    for (const [host, from] of [
      ['example.com', 'Added by you'],
      ['docs.github.com', 'From a skill'],
      ['api.notion.com', 'From a plugin'],
      ['news.ycombinator.com', 'This session only'],
    ]) {
      await expect(text(page, host)).toBeVisible();
      await expect(text(page, from)).toBeVisible();
    }
  });

  test('Allow site trims and lower-cases the host', async ({ page, bridge }) => {
    await page.getByRole('textbox', { name: 'Host', exact: true }).fill('  Docs.Example.COM ');
    await page.getByRole('button', { name: 'Allow site', exact: true }).click();
    await bridge.expectSent('WHITELIST_ADD', { host: 'docs.example.com' });
    await expect(text(page, 'docs.example.com')).toBeVisible();
  });

  test('Remove exists only for your own entries', async ({ page, bridge }) => {
    for (const host of ['docs.github.com', 'api.notion.com', 'news.ycombinator.com']) {
      await expect(page.getByRole('button', { name: `Remove ${host}`, exact: true })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Remove example.com', exact: true }).click();
    const confirm = page.getByRole('button', { name: 'Confirm remove', exact: true });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await bridge.expectSent('WHITELIST_REMOVE', { host: 'example.com' });
    await expect(page.getByText('example.com', { exact: true })).toHaveCount(0);
  });

  test('a failed change shows its error', async ({ page, bridge }) => {
    bridge.fail('WHITELIST_ADD', 'Host is blocked by policy');
    await page.getByRole('textbox', { name: 'Host', exact: true }).fill('evil.example');
    await page.getByRole('button', { name: 'Allow site', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Host is blocked by policy' })).toBeVisible();
  });
});
