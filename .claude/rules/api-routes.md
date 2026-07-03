---
description: API route reference (AI, automations, MCP, marketplace, OAuth, plugin)
appliesTo: ["app/api/**"]
alwaysApply: false
---

# API Routes

## AI (`/api/ai/`)
`chat` (POST, stream), `budget` (GET), `rags` (GET/POST), `rags/[id]` (GET/DELETE),
`rags/[id]/documents` (POST), `rags/[id]/search` (POST).

## Automations (`/api/ai/automations/`)
`` (GET/POST), `[name]` (GET/PUT/DELETE), `[name]/executions[/…]`, `[name]/hook/[apiKey]` (POST webhook),
`execute` (POST), `cron` (GET), `prompt` (POST — AI YAML gen).

## MCP (`/api/mcp/`)
`route` (JSON-RPC), `[key]` + `[key]/[serverName]` (path-key surfaces), `oauth-source`,
`servers[/…]`, `call`. See [[oauth-mcp]].

## Marketplace (`/api/marketplace/`) & packages
`discover` (GET, API-key), `publish` (POST, API-key), `install` (POST, API-key), `publisher` (GET, Clerk).
`packages` (GET, `POST` admin upload), `packages/[id]` (GET/DELETE/`PATCH` moderate),
`packages/[id]/ratings` (GET/POST, Clerk). See [[marketplace]].

## OAuth (`/api/oauth/`)
`authorize`, `callback`, `exchange`, `token`, `plugin/authorize`, `plugin/verify`. See [[plugin-control-plane]].

## Plugin / dashboard (`/api/plugin/`, `/api/keys/`, `/api/dashboard/`)
`plugin/config`, `plugin/report`, `plugin/query`, `plugin/devices`, `plugin/version`;
`keys/{generate,list,delete}`; `dashboard/activity`, `dashboard/paid-stats`.
