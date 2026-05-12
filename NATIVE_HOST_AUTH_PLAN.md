# Native Host Authentication Plan

## Overview

One login, one credential file. The native-host is the single backend for both CLI and Chrome extension. Whoever triggers login first writes the API key to `native-host/data/config/tulzo_auth.json` — after that, both surfaces are authenticated.

## Single Auth Flow (whoever comes first)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SINGLE CREDENTIAL, TWO ENTRY POINTS                  │
│                                                                           │
│  Credential file: native-host/data/config/tulzo_auth.json                │
│                                                                           │
│  ON ANY STARTUP (native-host CLI or plugin connection):                  │
│                                                                           │
│  1. Check tulzo_auth.json exists                                         │
│                                                                           │
│  2a. IF exists:                                                          │
│      → Call GET /api/oauth/plugin/verify (Bearer: api_key)               │
│      → If valid: proceed normally                                        │
│      → If invalid/revoked: delete file, go to step 2b                    │
│                                                                           │
│  2b. IF missing OR verification failed:                                  │
│      → Open browser to:                                                  │
│        https://tulzo.vercel.app/api/oauth/plugin/authorize               │
│          ?callback_port=<random_port>                                    │
│          &state=<random_nonce>                                           │
│                                                                           │
│      HOW browser opens depends on who triggered it:                      │
│      • Plugin triggered: plugin opens a new tab (it's already a browser) │
│      • CLI/native-host triggered: spawns `open <url>` (macOS)            │
│                                                                           │
│      → User logs in via Clerk (or is already logged in)                  │
│      → Tulzo redirects to: http://localhost:<port>/callback              │
│          ?api_key=<key>&plan=<plan>&user_id=<id>&state=<nonce>           │
│      → Native-host receives callback, verifies state                     │
│      → Saves to tulzo_auth.json                                          │
│      → Shuts down temp server                                            │
│      → Proceed normally                                                  │
│                                                                           │
│  3. IF login fails or user closes browser:                               │
│     → Native-host won't operate (blocked, not exit — waits for retry)    │
│     → Plugin shows "Login required" state                                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Who Triggers Login?

| Scenario | What happens |
|----------|--------------|
| User runs `node bin/cli.js start` | Native-host checks auth → no creds → opens browser via `open` command |
| User opens Chrome extension panel | Plugin sends `getAuthStatus` to native-host → no creds → plugin opens tab to Tulzo |
| User already logged in previously | `tulzo_auth.json` exists → verify call → proceed |

In both cases, the **native-host starts a temp localhost HTTP server** to receive the callback. The only difference is who opens the browser URL.

## Credential Storage

### Single File (native-host owns it)

Stored in the existing config directory at:
```
native-host/data/config/tulzo_auth.json
```

This sits alongside the other config files:
```
native-host/data/config/
├── claude_credential.json   ← Bedrock/Claude API creds
├── credentials.json         ← Site-specific login creds (sagasoft etc.)
├── mcp-servers.json         ← MCP server connections
├── notifications.json       ← Notification channel config
├── schedules.json           ← Cron schedules
└── tulzo_auth.json          ← NEW: Tulzo platform auth
```

Contents:
```json
{
  "api_key": "ak_XXXXXXXXXX...",
  "user_id": "user_abc123",
  "plan": "pro",
  "verified_at": "2026-05-13T10:00:00Z",
  "tulzo_url": "https://tulzo.vercel.app"
}
```

### Chrome Extension

No separate storage. Plugin asks native-host for auth status via native messaging.
Native-host is the single source of truth — plugin never stores credentials independently.

## Verification on Each Request (Rate Limiting)

The native-host doesn't need to call `/verify` on every single action. Instead:

1. **Startup**: Full verify (API call to Tulzo)
2. **Every 1 hour**: Re-verify in background (refresh plan/limits)
3. **On 403 response**: Immediate re-verify (plan may have changed)
4. **Local guardrails**: Count requests locally against known limits

## Runtime: How Native-Host Uses Tulzo

After login, native-host calls Tulzo endpoints using the API key for ongoing operation:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    NATIVE-HOST → TULZO ENDPOINTS                         │
│                                                                           │
│  STARTUP:                                                                │
│  ① GET /api/oauth/plugin/verify      → is key valid? plan?              │
│  ② GET /api/plugin/config            → quotas, guardrails, custom rules │
│                                                                           │
│  DURING OPERATION:                                                       │
│  ③ POST /api/plugin/query            → RAG lookup (knowledge, rules)    │
│     Body: { query: "how to handle X", rag_name: "guardrails" }          │
│     Returns: relevant documents from user's vector store                 │
│                                                                           │
│  PERIODIC (hourly):                                                      │
│  ④ GET /api/oauth/plugin/verify      → re-check plan still valid        │
│  ⑤ GET /api/plugin/config            → refresh guardrails if changed    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Config Response (`/api/plugin/config`)

```json
{
  "plan": "pro",
  "quotas": {
    "requests_per_hour": 100,
    "concurrent_sessions": 5,
    "scheduled_tasks": 10,
    "skill_storage_mb": 50,
    "max_page_actions_per_task": 200
  },
  "guardrails": {
    "blocked_domains": ["*.gov", "*.mil", "bank*"],
    "require_confirmation_for": ["payment", "delete", "transfer"],
    "max_retries_per_step": 3,
    "timeout_per_action_ms": 30000,
    "allow_file_download": false,
    "allow_screenshot_capture": true,
    "allow_form_submission": true,
    "allow_login_automation": true
  },
  "custom_rules": [
    "Never submit forms on banking sites without explicit user confirmation",
    "Always screenshot before and after form submissions"
  ]
}
```

### RAG Query (`/api/plugin/query`)

The native-host can query the user's Supabase vector store mid-operation.
Use cases:
- Before navigating to a domain → check if any guardrails apply
- Before a practitioner acts → retrieve learned rules for that domain
- During skill execution → look up reference data

```json
// Request
POST /api/plugin/query
{ "query": "rules for sagasoft invoice entry", "rag_name": "guardrails", "limit": 3 }

// Response
{
  "results": [
    { "content": "Always verify CAEN code matches...", "score": 0.89 },
    { "content": "Require confirmation before posting...", "score": 0.82 }
  ]
}
```

## What Tulzo Controls (Server-Side)

| Guardrail | Implementation |
|-----------|----------------|
| **Plan check** | `/api/oauth/plugin/verify` returns plan + limits |
| **Rate limiting** | Track in `api_usage_log`, return 429 if exceeded |
| **Key revocation** | Mark key `is_active=false`, next verify fails |
| **Feature gating** | `/api/plugin/config` returns capabilities per plan |
| **Custom rules** | User-defined guardrails in RAG, served via `/api/plugin/config` |
| **Knowledge base** | Vector store queries via `/api/plugin/query` |

## What Native-Host Enforces (Client-Side)

| Guardrail | Implementation |
|-----------|----------------|
| **Won't start without auth** | Blocked until valid credentials obtained |
| **Local rate counter** | Track requests/hour against `quotas.requests_per_hour` |
| **Domain blocking** | Check URL against `guardrails.blocked_domains` before navigating |
| **Confirmation gates** | If action matches `require_confirmation_for`, ask user first |
| **Timeout enforcement** | Kill action if exceeds `timeout_per_action_ms` |
| **Periodic re-sync** | Re-fetch config hourly to catch plan/guardrail changes |

## Files to Modify in Native-Host (Future)

| File | Change |
|------|--------|
| `native-host/src/index.ts` | Add auth gate before `connectAll()` / `startPolling()` / `startScheduler()` |
| `native-host/src/tulzo-auth.ts` (new) | Login flow: temp HTTP server, browser open, credential save, verify calls |
| `native-host/data/config/tulzo_auth.json` | Stored credentials (created by auth flow, not committed to git) |
| `plugin/src/panel/Panel.tsx` | Show "Login required" state when native-host reports unauthenticated |

## API Endpoints on Tulzo (Already Created)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/oauth/plugin/authorize` | Clerk session | Login flow — opens in browser, redirects API key to localhost callback |
| `GET /api/oauth/plugin/verify` | Bearer API key | Validate key, return plan + limits |
| `GET /api/plugin/config` | Bearer API key | Full config: quotas, guardrails, custom rules from RAG |
| `POST /api/plugin/query` | Bearer API key | Query user's vector store (RAG) for knowledge/rules |
| `GET /api/usage/stats` | Clerk session | Dashboard usage stats (for control panel UI) |

## Security Notes

- API key is the sole authentication token for the plugin/native-host
- It's generated server-side (Clerk or custom), stored hashed in DB
- The localhost callback approach is standard (same as GitHub CLI `gh auth login`)
- State parameter prevents CSRF on the callback
- No secrets stored in extension code — only user's own API key after auth
