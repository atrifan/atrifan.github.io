import { describe, expect, it } from 'vitest';
import {
  buildInstallCommand,
  cliInstallCommand,
  installedIds,
  mcpTools,
  packagePermissions,
  type InstallTarget,
} from '@/src/lib/marketplace/install-plan';

const archive: InstallTarget = {
  id: 'fx-pdf-skill',
  name: 'PDF Summarizer',
  type: 'skill',
  blobUrl: 'https://blob.example.com/pdf/1.2.0.zip',
  config: null,
};

describe('buildInstallCommand', () => {
  it('installs archive kinds with INSTALL_PACKAGE', () => {
    for (const type of ['skill', 'plugin', 'subagent', 'workflow', 'practitioner'] as const) {
      expect(buildInstallCommand({ ...archive, type })).toEqual({
        ok: true,
        command: 'INSTALL_PACKAGE',
        params: { type, id: 'fx-pdf-skill', source: 'https://blob.example.com/pdf/1.2.0.zip', sourceType: 'archive' },
      });
    }
  });

  it('refuses an archive kind without an archive', () => {
    expect(buildInstallCommand({ ...archive, blobUrl: '' })).toEqual({ ok: false, error: 'This package has no archive to install.' });
    expect(buildInstallCommand({ ...archive, blobUrl: null })).toMatchObject({ ok: false });
  });

  it('adds HTTP MCP servers with MCP_ADD_SERVER under a marketplace id', () => {
    const r = buildInstallCommand({
      ...archive,
      id: 'gh',
      name: 'GitHub Tools',
      type: 'mcp',
      blobUrl: '',
      config: { transport: 'http', url: 'https://mcp.example.com', tools: [{ name: 't' }], permissions: ['x'] },
    });
    expect(r).toEqual({
      ok: true,
      command: 'MCP_ADD_SERVER',
      params: {
        id: 'marketplace__gh',
        name: 'GitHub Tools',
        transport: 'http',
        url: 'https://mcp.example.com',
        source: 'marketplace',
        packageId: 'gh',
      },
    });
  });

  it('forwards stdio command, args, env and auth fields', () => {
    const r = buildInstallCommand({
      ...archive,
      id: 'fs',
      type: 'mcp',
      config: { transport: 'stdio', command: 'npx', args: ['-y', 'fs'], env: { ROOT: '/tmp' }, oauth: { client_id: 'c' }, authentication: { type: 'none' } },
    });
    expect(r).toMatchObject({
      ok: true,
      params: {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'fs'],
        env: { ROOT: '/tmp' },
        oauth: { client_id: 'c' },
        authentication: { type: 'none' },
      },
    });
  });

  it('refuses an MCP server without a usable config', () => {
    expect(buildInstallCommand({ ...archive, type: 'mcp', config: null })).toEqual({
      ok: false,
      error: 'This MCP server has no connection details.',
    });
    expect(buildInstallCommand({ ...archive, type: 'mcp', config: { transport: 'carrier-pigeon' } })).toMatchObject({ ok: false });
  });

  it('adds A2A agents with A2A_ADD_AGENT', () => {
    expect(
      buildInstallCommand({ ...archive, id: 'trip', name: 'Trip', type: 'a2a', config: { card_url: 'https://a.example.com/card.json' } }),
    ).toEqual({
      ok: true,
      command: 'A2A_ADD_AGENT',
      params: { id: 'marketplace__trip', name: 'Trip', cardUrl: 'https://a.example.com/card.json', source: 'marketplace', packageId: 'trip' },
    });
  });

  it('refuses an A2A agent without a card URL', () => {
    expect(buildInstallCommand({ ...archive, type: 'a2a', config: {} })).toEqual({
      ok: false,
      error: 'This A2A agent has no agent card URL.',
    });
  });
});

describe('installedIds', () => {
  it('collects package ids and marketplace MCP servers and A2A agents', () => {
    const ids = installedIds({
      packages: [{ id: 'fx-pdf-skill' }, { id: 'local-thing' }],
      servers: [{ id: 'marketplace__gh' }, { id: 'hand-added' }],
      agents: [{ id: 'marketplace__trip' }],
    });
    expect([...ids].sort()).toEqual(['fx-pdf-skill', 'gh', 'local-thing', 'trip']);
  });

  it('tolerates missing or malformed lists', () => {
    expect(installedIds({}).size).toBe(0);
    expect(installedIds({ packages: 'nope' as unknown as [], servers: [null as unknown as { id: string }, { id: 3 as unknown as string }] }).size).toBe(0);
  });
});

describe('cliInstallCommand', () => {
  it('uses claude mcp add for HTTP and SSE servers', () => {
    expect(cliInstallCommand({ ...archive, name: 'GitHub Tools', type: 'mcp', config: { transport: 'http', url: 'https://mcp.example.com/github' } })).toBe(
      'claude mcp add --transport http github-tools https://mcp.example.com/github',
    );
    expect(cliInstallCommand({ ...archive, name: 'W', type: 'mcp', config: { transport: 'sse', url: 'https://w/sse' } })).toBe(
      'claude mcp add --transport sse w https://w/sse',
    );
  });

  it('passes env and quotes arguments for stdio servers', () => {
    expect(
      cliInstallCommand({
        ...archive,
        name: 'Files',
        type: 'mcp',
        config: { transport: 'stdio', command: 'npx', args: ['-y', '@x/fs', 'my dir'], env: { ROOT: '/tmp' } },
      }),
    ).toBe("claude mcp add files -e ROOT=/tmp -- npx -y @x/fs 'my dir'");
  });

  it('escapes single quotes in arguments', () => {
    expect(cliInstallCommand({ ...archive, name: 'Q', type: 'mcp', config: { transport: 'stdio', command: 'run', args: ["it's"] } })).toBe(
      "claude mcp add q -- run 'it'\\''s'",
    );
  });

  it('downloads the archive for archive kinds', () => {
    expect(cliInstallCommand(archive)).toBe('curl -L -o fx-pdf-skill.zip https://blob.example.com/pdf/1.2.0.zip');
  });

  it('has no command for A2A agents or packages without an artifact', () => {
    expect(cliInstallCommand({ ...archive, type: 'a2a', config: { card_url: 'https://a' } })).toBeNull();
    expect(cliInstallCommand({ ...archive, blobUrl: '' })).toBeNull();
    expect(cliInstallCommand({ ...archive, type: 'mcp', config: { transport: 'http' } })).toBeNull();
    expect(cliInstallCommand({ ...archive, type: 'mcp', config: null })).toBeNull();
  });
});

describe('packagePermissions', () => {
  it('describes what an MCP server or agent can reach', () => {
    expect(packagePermissions({ ...archive, type: 'mcp', config: { transport: 'http', url: 'https://mcp.example.com/github' } })).toEqual([
      'Connects to mcp.example.com',
    ]);
    expect(
      packagePermissions({
        ...archive,
        type: 'mcp',
        config: { transport: 'stdio', command: 'npx', env: { A: '1', B: '2' }, oauth: {}, permissions: ['Reads your calendar', 7] },
      }),
    ).toEqual(['Runs a local command: npx', 'Reads environment variables: A, B', 'Signs in with OAuth', 'Reads your calendar']);
    expect(packagePermissions({ ...archive, type: 'a2a', config: { card_url: 'https://agents.example.com/card' } })).toEqual([
      'Connects to agents.example.com',
    ]);
  });

  it('is empty for archives and unparsable URLs', () => {
    expect(packagePermissions(archive)).toEqual([]);
    expect(packagePermissions({ ...archive, type: 'mcp', config: { transport: 'http', url: 'not a url' } })).toEqual([]);
    expect(packagePermissions({ ...archive, type: 'mcp', config: null })).toEqual([]);
  });
});

describe('mcpTools', () => {
  it('lists named tools with optional descriptions', () => {
    expect(mcpTools({ tools: [{ name: 'a', description: 'A' }, { name: 'b' }, { description: 'no name' }, 'x', { name: '' }] })).toEqual([
      { name: 'a', description: 'A' },
      { name: 'b', description: '' },
    ]);
  });

  it('is empty without tools', () => {
    expect(mcpTools(null)).toEqual([]);
    expect(mcpTools({ tools: 'nope' })).toEqual([]);
  });
});
