---
description: Supabase tables, RLS model, and marketplace schema
appliesTo: ["app/api/**", "src/lib/**", "supabase/**"]
alwaysApply: true
---

# Database

All server-side access uses the Supabase **service-role key** (bypasses RLS); always filter by `user_id`.
Env: `STORAGE_SUPABASE_URL` / `STORAGE_SUPABASE_SERVICE_ROLE_KEY` (aliased by `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` in some plugin routes — same project).

## Core tables

| Table | Purpose |
|-------|---------|
| `api_keys` | Per-device API keys (SHA-256 hash, plan, is_active). Free plan is blocked from API/MCP. |
| `device_heartbeats` | Per-device telemetry (skills/mcp/schedule/task counts, last seen). |
| `api_usage_log` | Interaction events: `request`, `verify`, `config_fetch`, `marketplace_discover`, `marketplace_publish`. |
| `automations` / `automation_runs` / `automation_logs` | Workflow defs + execution history. |
| `chat_conversations` / `chat_messages` / `chat_connectors` / `chat_personalities` | Chat. |
| `mcp_servers` / `rest_api_specs` / `graphql_specs` | Imported tool sources. |
| `oauth_tokens` | OAuth tokens (polymorphic refs, keyed by user_id + server). |
| `user_rags` / `rag_documents` | RAG knowledge bases. |

## Marketplace tables

| Table | Purpose |
|-------|---------|
| `packages` | id, name, type (`plugin\|skill\|practitioner\|mcp`), latest_version, blob_url, config_json, `install_count`, `owner_user_id`, `visibility` (`public\|pending\|private`). |
| `package_versions` | Version history per package. |
| `package_ratings` | 1–5 rating + review, unique per (package_id, user_id). |
| `package_installs` | Install/download event log (for publisher analytics). |
| `package_rating_stats` (view) | avg_rating + rating_count per package. |

Helper `increment_install_count(pkg_id)` bumps the denormalized counter.

## Access patterns

Use helpers in `src/lib/supabase-services.ts` (`getApiKeyByHash`, `hashApiKey`, `getDevicesWithHeartbeats`,
`computeDeviceStatus`) rather than re-implementing raw queries. Marketplace logic lives in
`src/lib/marketplace-service.ts`.
