---
description: OAuth flow, MCP tool execution, and the external MCP surface
appliesTo: ["app/api/oauth/**", "app/api/mcp/**", "src/lib/mcp-client.ts", "src/lib/oauth-token-manager.ts"]
alwaysApply: false
---

# OAuth & MCP

## MCP surface

`app/api/mcp/route.ts` is the JSON-RPC server. Auth via `validateApiKey()` (Bearer/x-api-key →
Supabase hash → optional Clerk) or `validateBearerToken()` (JWT). Free plan blocked (`-32003`).
`/api/mcp/[key]` and `/api/mcp/[key]/[serverName]` are path-key surfaces that forward with `X-User-Id`,
`X-User-Plan`, `X-Auth-Method`, `X-Server-Name`, `X-Api-Key-Id`, `X-Original-Api-Key`.

Native tools come from `src/config/tools-definitions.ts` (handlers in `src/config/tool-handlers.ts`).
Marketplace tools are handled separately — see [[marketplace]].

## OAuth support matrix

All tool types (MCP, REST, GraphQL, A2A, RAG-URL) support OAuth across automation, internal chat, and
external surfaces (which return a `loginUrl`). Source lookup in `app/api/mcp/oauth-source/route.ts`.

## OAuth recovery

On 401, executor sets `waiting_input`, sends an auth-required notification with a login link; after the
user authenticates and tokens are stored, execution resumes and retries.

## Known limitation

MCP composition sharing with OAuth-protected tools is **personal-only** — tokens are keyed by the owner's
`user_id`, and the login page rejects non-owners. Session-level OAuth (per `mcp-session-id`/`api_key_id`)
is a documented future change, not implemented.
