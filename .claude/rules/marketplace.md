---
description: Marketplace discovery / publish / install — API + MCP contracts and moderation
appliesTo: ["app/api/marketplace/**", "app/api/packages/**", "src/lib/marketplace-service.ts", "src/lib/marketplace-mcp-tools.ts"]
alwaysApply: false
---

# Marketplace

Subscribers (paid plans) discover and publish installable skills / plugins / MCP servers. The browser
assistant uses these over HTTP **and** as MCP tools. Core logic lives in `src/lib/marketplace-service.ts`
(shared by HTTP routes and MCP tools) — do not duplicate it.

## Auth

API-key routes reuse `authenticateApiKey(authHeader)` from `marketplace-service.ts`:
Bearer → `hashApiKey` → `getApiKeyByHash` → reject `plan==='free'` with 403 `plan_required`.
These routes are listed in `middleware.ts` `isPublicRoute` so Clerk doesn't intercept them.

## HTTP contract

- `GET /api/marketplace/discover?q=&type=&limit=` → `{ results, count, plan }`. Each result:
  `{ id, name, description, type, version, rating, rating_count, install_count, install:{ source_type:'archive'|'mcp', blob_url?, config_json? }, updated_at }`.
- `POST /api/marketplace/publish` (multipart zip OR JSON for mcp) → `{ ok, id, version, visibility:'pending' }`.
  Non-admin may only create new packages or update ones they own; publishes land `pending`.
- `POST /api/marketplace/install` `{ package_id, version? }` → bumps `install_count` (call after real install).
- `GET /api/marketplace/publisher` (Clerk) → per-package downloads + ratings for the logged-in owner.
- `GET/POST /api/packages/[id]/ratings` (Clerk) — 1–5 rating upsert + aggregate.

## MCP tools

`src/lib/marketplace-mcp-tools.ts` exports `marketplace_discover`, `marketplace_install`,
`marketplace_publish`, surfaced in `/api/mcp` `tools/list` for any authenticated (paid) caller and executed
in `tools/call` before the widget/native path.

## Moderation

Admin uploads (`POST /api/packages`) are `public` immediately. API-key publishes are `pending`; an admin
approves via `PATCH /api/packages/[id]` `{ visibility }`. Admins are configured in `src/lib/admin.ts`
(seed email + `ADMIN_EMAILS` env, comma-separated).

## Followups

Per-plugin monetization (paid packages / revenue share for publishers) is a planned followup — not built yet.
