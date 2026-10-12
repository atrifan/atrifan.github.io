---
description: API route reference (MCP, marketplace, OAuth, plugin, billing)
appliesTo: ["app/api/**"]
alwaysApply: false
---

# API Routes

There is no `/api/ai/*` any more (the automation and RAG routes were removed; their UI callers were deleted
in the foundation cleanup). Which surface serves which route is decided by `SURFACE_API_ALLOWLIST` in
`src/lib/surface-routing.ts`; the hub serves all of them. See [[surfaces-and-design]].

A route that needs an env var it doesn't have answers 500 `{ error: 'server_misconfigured' }`
(`src/lib/misconfigured.ts`); never fall back to a hard-coded secret or host.

## Chat (`/api/chat`)
POST, streaming; the assistant's chat endpoint (hub).

## Job room (`/api/contracts/`)
Contract parties only (404 unknown, 403 not a party); served on gigs and the hub. `GET /` (mine),
`GET [id]` (versions, spec + all spec versions, pause, steering credits), `messages` (GET `?since=<seq>`, POST),
`activity?since=<seq>`, `milestones` (GET `?since=<ts>`, POST provider create/update), `progress` (POST provider,
≤ 1 customer email per hour), `qa` (submissions + verdict reasons), `steering` (GET, POST customer),
`steering/[sid]/{respond (provider), approve, reject, topup}` (customer; approve refunds a price drop, `topup` makes a
fresh Checkout for an unpaid top-up), `versions/[vid]/accept` (provider signs customer-proposed terms). Services:
`src/lib/jobs/{room,steering}-service.ts`; the UI client is `src/lib/jobs/client/room.ts`.

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
