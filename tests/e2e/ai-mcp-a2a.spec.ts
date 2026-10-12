import { expect, fakeDevice, openAi, signedIn, test, text } from '../support/ai-fixtures';

const CLIENT_AUTH_OPTIONS = ['Automatic', 'none', 'client_secret_basic', 'client_secret_post'];

test.describe('MCP servers /ai/mcp', () => {
  signedIn();

  test.beforeEach(async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/mcp');
    await expect(text(page, 'GitHub')).toBeVisible();
  });

  test('lists servers with status, tool count and last error', async ({ page, bridge }) => {
    await bridge.expectSent('MCP_LIST_SERVERS', {});
    for (const name of ['GitHub', 'Filesystem', 'Linear', 'Notion']) await expect(text(page, name)).toBeVisible();
    for (const status of ['Connected', 'Disconnected', 'Disabled', 'Sign-in needed']) {
      await expect(text(page, status)).toBeVisible();
    }
    for (const tools of ['12 tools', '0 tools', '5 tools', '2 tools']) await expect(text(page, tools)).toBeVisible();
    await expect(text(page, 'spawn npx ENOENT')).toBeVisible();
  });

  test('enabled switch sends MCP_SET_ENABLED', async ({ page, bridge }) => {
    const github = page.getByRole('switch', { name: 'GitHub enabled', exact: true });
    await expect(github).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Linear enabled', exact: true })).not.toBeChecked();
    await github.click();
    await bridge.expectSent('MCP_SET_ENABLED', { serverId: 'mcp_1', enabled: false });
    await expect(github).not.toBeChecked();
  });

  test('Reconnect one and Reconnect all', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Reconnect Filesystem', exact: true }).click();
    await bridge.expectSent('MCP_RECONNECT', { serverId: 'mcp_2' });
    await expect(page.getByText('spawn npx ENOENT', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reconnect all', exact: true }).click();
    await bridge.expectSent('MCP_RECONNECT', {});
  });

  test('Resync only for skill servers', async ({ page, bridge }) => {
    await expect(page.getByRole('button', { name: 'Resync GitHub', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resync Linear', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Resync Filesystem', exact: true }).click();
    await bridge.expectSent('MCP_RESYNC', { serverId: 'mcp_2' });
  });

  test('client authentication select only for OAuth servers', async ({ page, bridge }) => {
    await expect(page.getByRole('combobox', { name: 'Client authentication for Filesystem', exact: true })).toHaveCount(0);
    const select = page.getByRole('combobox', { name: 'Client authentication for GitHub', exact: true });
    await expect(select.locator('option')).toHaveText(CLIENT_AUTH_OPTIONS);
    await select.selectOption({ label: 'client_secret_post' });
    await bridge.expectSent('MCP_SET_CLIENT_AUTH', { serverId: 'mcp_1', method: 'client_secret_post' });
    await select.selectOption({ label: 'Automatic' });
    await bridge.expectSent('MCP_SET_CLIENT_AUTH', { serverId: 'mcp_1', method: '' });
  });

  test('Remove then Confirm remove', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Remove Linear', exact: true }).click();
    expect(bridge.callsOf('MCP_REMOVE_SERVER')).toEqual([]);
    await page.getByRole('button', { name: 'Confirm remove', exact: true }).click();
    await bridge.expectSent('MCP_REMOVE_SERVER', { serverId: 'mcp_3' });
    await expect(page.getByText('Linear', { exact: true })).toHaveCount(0);
  });

  test('Check sign-in reports whether the server needs it', async ({ page, bridge }) => {
    await expect(page.getByRole('heading', { name: 'Add a server', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Server URL', exact: true }).fill('https://mcp.sentry.dev/oauth');
    await page.getByRole('button', { name: 'Check sign-in', exact: true }).click();
    await bridge.expectSent('MCP_DISCOVER_AUTH', { url: 'https://mcp.sentry.dev/oauth' });
    await expect(text(page, 'Sign-in required')).toBeVisible();

    await page.getByRole('textbox', { name: 'Server URL', exact: true }).fill('https://mcp.example.com/mcp');
    await page.getByRole('button', { name: 'Check sign-in', exact: true }).click();
    await bridge.expectSent('MCP_DISCOVER_AUTH', { url: 'https://mcp.example.com/mcp' });
    await expect(text(page, 'No sign-in found')).toBeVisible();
  });

  test('Add server sends MCP_ADD_SERVER and shows it', async ({ page, bridge }) => {
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Sentry');
    await page.getByRole('textbox', { name: 'Server URL', exact: true }).fill('https://mcp.sentry.dev/mcp');
    await page.getByRole('button', { name: 'Add server', exact: true }).click();
    await bridge.expectSent('MCP_ADD_SERVER', { name: 'Sentry', url: 'https://mcp.sentry.dev/mcp', transport: 'http', source: 'user' });
    await expect(text(page, 'Sentry')).toBeVisible();
  });

  test('a non-http(s) URL is refused and nothing is sent', async ({ page, bridge }) => {
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Local');
    await page.getByRole('textbox', { name: 'Server URL', exact: true }).fill('ftp://files.example.com');
    await page.getByRole('button', { name: 'Add server', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter an http(s) URL' })).toBeVisible();
    expect(bridge.callsOf('MCP_ADD_SERVER')).toEqual([]);
    expect(bridge.callsOf('MCP_DISCOVER_AUTH')).toEqual([]);
  });

  test('a failed change shows its error', async ({ page, bridge }) => {
    bridge.fail('MCP_RECONNECT', 'Server refused the connection');
    await page.getByRole('button', { name: 'Reconnect GitHub', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Server refused the connection' })).toBeVisible();
  });
});

test.describe('A2A peers /ai/a2a', () => {
  signedIn();

  test.beforeEach(async ({ page, bridge }) => {
    await bridge.install({ handlers: fakeDevice() });
    await openAi(page, '/ai/a2a');
    await expect(text(page, 'Travel planner')).toBeVisible();
  });

  test('lists agents with card URL and sign-in state', async ({ page, bridge }) => {
    await bridge.expectSent('A2A_LIST_AGENTS', {});
    await expect(text(page, 'https://travel.example.com/.well-known/agent.json')).toBeVisible();
    await expect(text(page, 'Research peer')).toBeVisible();
    await expect(text(page, 'https://research.example.com/agent.json')).toBeVisible();
    await expect(text(page, 'Calendar bot')).toBeVisible();
    await expect(text(page, 'Signed in')).toBeVisible();
    await expect(text(page, 'Sign-in needed')).toBeVisible();
  });

  test('enabled switch sends A2A_SET_ENABLED', async ({ page, bridge }) => {
    const peer = page.getByRole('switch', { name: 'Research peer enabled', exact: true });
    await expect(peer).not.toBeChecked();
    await peer.click();
    await bridge.expectSent('A2A_SET_ENABLED', { agentId: 'a2a_2', enabled: true });
    await expect(peer).toBeChecked();
  });

  test('Resync only for skill peers', async ({ page, bridge }) => {
    await expect(page.getByRole('button', { name: 'Resync Travel planner', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Resync Research peer', exact: true }).click();
    await bridge.expectSent('A2A_RESYNC', { agentId: 'a2a_2' });
  });

  test('OAuth peers: sign in, sign out, client authentication', async ({ page, bridge }) => {
    await expect(page.getByRole('button', { name: 'Sign in to Calendar bot', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Client authentication for Calendar bot', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Sign in to Research peer', exact: true }).click();
    await bridge.expectSent('A2A_AUTHENTICATE', { agentId: 'a2a_2' });
    await page.getByRole('button', { name: 'Sign out of Travel planner', exact: true }).click();
    await bridge.expectSent('A2A_AUTH_REVOKE', { agentId: 'a2a_1' });

    const select = page.getByRole('combobox', { name: 'Client authentication for Travel planner', exact: true });
    await expect(select.locator('option')).toHaveText(CLIENT_AUTH_OPTIONS);
    await select.selectOption({ label: 'client_secret_basic' });
    await bridge.expectSent('A2A_SET_CLIENT_AUTH', { agentId: 'a2a_1', method: 'client_secret_basic' });
  });

  test('Remove then Confirm remove', async ({ page, bridge }) => {
    await page.getByRole('button', { name: 'Remove Calendar bot', exact: true }).click();
    expect(bridge.callsOf('A2A_REMOVE_AGENT')).toEqual([]);
    await page.getByRole('button', { name: 'Confirm remove', exact: true }).click();
    await bridge.expectSent('A2A_REMOVE_AGENT', { agentId: 'a2a_3' });
    await expect(page.getByText('Calendar bot', { exact: true })).toHaveCount(0);
  });

  test('Preview card shows the card, or its error', async ({ page, bridge }) => {
    await expect(page.getByRole('heading', { name: 'Add a peer', exact: true })).toBeVisible();
    const url = page.getByRole('textbox', { name: 'Agent card URL', exact: true });
    await url.fill('https://weather.example.com/agent.json');
    await page.getByRole('button', { name: 'Preview card', exact: true }).click();
    await bridge.expectSent('A2A_GET_CARD', { cardUrl: 'https://weather.example.com/agent.json' });
    await expect(text(page, 'Weather agent')).toBeVisible();
    await expect(text(page, 'Forecasts for any city')).toBeVisible();
    await expect(text(page, '2 skills')).toBeVisible();

    await url.fill('https://missing.example.com/agent.json');
    await page.getByRole('button', { name: 'Preview card', exact: true }).click();
    await bridge.expectSent('A2A_GET_CARD', { cardUrl: 'https://missing.example.com/agent.json' });
    await expect(page.getByRole('alert').filter({ hasText: 'Card not found (404)' })).toBeVisible();
  });

  test('Add peer sends A2A_ADD_AGENT and shows it', async ({ page, bridge }) => {
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Weather');
    await page.getByRole('textbox', { name: 'Agent card URL', exact: true }).fill('https://weather.example.com/agent.json');
    await page.getByRole('button', { name: 'Add peer', exact: true }).click();
    await bridge.expectSent('A2A_ADD_AGENT', { name: 'Weather', cardUrl: 'https://weather.example.com/agent.json', source: 'user' });
    await expect(text(page, 'Weather')).toBeVisible();
  });

  test('a non-http(s) card URL is refused and nothing is sent', async ({ page, bridge }) => {
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Weather');
    await page.getByRole('textbox', { name: 'Agent card URL', exact: true }).fill('weather.example.com/agent.json');
    await page.getByRole('button', { name: 'Add peer', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter an http(s) URL' })).toBeVisible();
    expect(bridge.callsOf('A2A_ADD_AGENT')).toEqual([]);
    expect(bridge.callsOf('A2A_GET_CARD')).toEqual([]);
  });
});
