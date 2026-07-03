/**
 * Marketplace MCP tools.
 *
 * Exposes discover / publish / install as first-class MCP tools on Tulzo's
 * existing MCP server (app/api/mcp). The browser assistant, once connected to
 * Tulzo as an MCP server with its API key, can find, install, and publish
 * marketplace packages without any bespoke HTTP client.
 *
 * These are plain JSON-RPC tools (no widget rendering), handled by a dedicated
 * branch in the MCP route so they don't go through the calculator widget path.
 */

import {
  discoverPackages,
  publishPackage,
  recordInstall,
  type MarketplaceAuth,
} from './marketplace-service';

export const MARKETPLACE_TOOL_NAMES = [
  'marketplace_discover',
  'marketplace_install',
  'marketplace_publish',
] as const;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

/** Tool descriptors for tools/list. */
export const MARKETPLACE_TOOLS = [
  {
    name: 'marketplace_discover',
    description:
      'Search the Tulzo marketplace for installable skills, plugins, and MCP servers. ' +
      'Returns each package with its rating, install count, and the details needed to install it.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Free-text search over name and description' },
        type: { type: 'string', enum: ['plugin', 'skill', 'practitioner', 'mcp'], description: 'Filter by package type' },
        limit: { type: 'number', description: 'Max results (default 50, max 100)' },
      },
      required: [],
    },
    annotations: READ_ONLY,
  },
  {
    name: 'marketplace_install',
    description:
      'Report a successful install of a marketplace package so its download count is updated. ' +
      'Call this after the package has actually been installed on the device.',
    inputSchema: {
      type: 'object',
      properties: {
        package_id: { type: 'string', description: 'The id of the installed package' },
        version: { type: 'string', description: 'Installed version (defaults to latest)' },
      },
      required: ['package_id'],
    },
    annotations: WRITE,
  },
  {
    name: 'marketplace_publish',
    description:
      'Publish a skill, plugin, or MCP server to the Tulzo marketplace. Published packages start ' +
      'as "pending" and become public after admin moderation. For type="mcp" pass config_json; ' +
      'for archive types pass an already-uploaded blob_url.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Stable package id / slug' },
        name: { type: 'string' },
        description: { type: 'string' },
        type: { type: 'string', enum: ['plugin', 'skill', 'practitioner', 'mcp'] },
        version: { type: 'string', description: 'Defaults to 1.0.0' },
        config_json: {
          type: 'object',
          description: 'For type="mcp": { transport: "http|sse|stdio", url?, command?, args?, env? }',
        },
        blob_url: { type: 'string', description: 'For archive types: URL of the uploaded package zip' },
      },
      required: ['id', 'name', 'type'],
    },
    annotations: WRITE,
  },
];

export function isMarketplaceTool(name: string): boolean {
  return (MARKETPLACE_TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * Execute a marketplace MCP tool. Auth is the already-validated MCP caller
 * (userId + plan); paid-plan gating is enforced upstream by the MCP route's
 * isSubscribed check, so any authenticated caller here is on a paid plan.
 */
export async function executeMarketplaceTool(
  name: string,
  args: Record<string, unknown>,
  auth: MarketplaceAuth
): Promise<unknown> {
  switch (name) {
    case 'marketplace_discover': {
      const results = await discoverPackages({
        q: typeof args.q === 'string' ? args.q : undefined,
        type: typeof args.type === 'string' ? args.type : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      return { results, count: results.length };
    }
    case 'marketplace_install': {
      if (typeof args.package_id !== 'string') {
        return { error: 'package_id is required' };
      }
      const res = await recordInstall(auth, args.package_id, typeof args.version === 'string' ? args.version : undefined);
      return res.ok ? { ok: true } : { error: res.error };
    }
    case 'marketplace_publish': {
      const res = await publishPackage(auth, {
        id: args.id as string,
        name: args.name as string,
        description: typeof args.description === 'string' ? args.description : undefined,
        type: args.type as string,
        version: typeof args.version === 'string' ? args.version : undefined,
        config_json: (args.config_json as Record<string, unknown>) ?? null,
        blob_url: typeof args.blob_url === 'string' ? args.blob_url : undefined,
      });
      return res.ok
        ? { ok: true, id: res.id, version: res.version, visibility: res.visibility }
        : { error: res.error };
    }
    default:
      return { error: `Unknown marketplace tool: ${name}` };
  }
}
