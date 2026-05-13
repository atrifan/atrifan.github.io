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

## Implementation Plan

### File: `native-host/src/tulzo-auth.ts` (NEW)

This is the core auth module. All other files import from here.

```typescript
// ── Constants ────────────────────────────────────────────────────────────
const AUTH_FILE = resolve(__dirname, "..", "data", "config", "tulzo_auth.json")
const TULZO_URL = process.env.TULZO_URL || "https://tulzo.vercel.app"
const VERIFY_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

// ── Types ────────────────────────────────────────────────────────────────
interface TulzoCredentials {
  api_key: string
  user_id: string
  plan: "pro" | "plus"
  verified_at: string
  tulzo_url: string
}

interface TulzoConfig {
  plan: "pro" | "plus"
  quotas: {
    requests_per_hour: number
    concurrent_sessions: number
    scheduled_tasks: number
    max_page_actions_per_task: number
  }
  guardrails: {
    blocked_domains: string[]
    require_confirmation_for: string[]
    max_retries_per_step: number
    timeout_per_action_ms: number
    allow_file_download: boolean
  }
  custom_rules: string[]
}

// ── Exports ──────────────────────────────────────────────────────────────
export function loadCredentials(): TulzoCredentials | null
export async function verify(): Promise<{ valid: boolean; plan?: string; error?: string }>
export async function login(): Promise<TulzoCredentials>  // blocking — opens browser
export async function fetchConfig(): Promise<TulzoConfig>
export async function queryRAG(query: string, ragName?: string): Promise<string[]>
export function getApiKey(): string | null
export function isAuthenticated(): boolean
export function getPlan(): string | null
```

**Implementation details:**

```typescript
// loadCredentials()
// Read native-host/data/config/tulzo_auth.json
// Return parsed JSON or null if missing/corrupt

// verify()
// GET ${TULZO_URL}/api/oauth/plugin/verify
// Headers: { Authorization: "Bearer ${api_key}" }
// If 200: update verified_at in file, return valid
// If 401/403: delete file, return invalid

// login()
// 1. Generate random state + pick random port (49152-65535)
// 2. Start http.createServer on localhost:${port}
// 3. Open browser:
//    - macOS: exec(`open "${TULZO_URL}/api/oauth/plugin/authorize?callback_port=${port}&state=${state}"`)
//    - win32: exec(`start "" "${url}"`)
//    - linux: exec(`xdg-open "${url}"`)
// 4. Wait for GET /callback?api_key=X&plan=X&user_id=X&state=X
// 5. Verify state matches
// 6. Write tulzo_auth.json
// 7. Close server
// 8. Return credentials
// Timeout after 120s → throw error

// fetchConfig()
// GET ${TULZO_URL}/api/plugin/config
// Headers: { Authorization: "Bearer ${api_key}" }
// Cache locally for 1 hour

// queryRAG(query, ragName?)
// POST ${TULZO_URL}/api/plugin/query
// Headers: { Authorization: "Bearer ${api_key}" }
// Body: { query, rag_name: ragName, limit: 5 }
// Return array of content strings
```

---

### File: `native-host/src/index.ts` (MODIFY)

Add auth gate at the top, before any services start:

```typescript
// CURRENT (line ~43):
connectAll().catch(...)
startPolling()
startScheduler()
ensureDaemonReady()...

// NEW — wrap everything in auth gate:
import { loadCredentials, verify, login, fetchConfig, isAuthenticated } from "./tulzo-auth"

async function boot() {
  process.stderr.write("[native-host] Checking Tulzo auth...\n")

  let creds = loadCredentials()

  if (creds) {
    // Verify existing credentials
    const result = await verify()
    if (!result.valid) {
      process.stderr.write(`[native-host] Stored key invalid: ${result.error}\n`)
      creds = null
    }
  }

  if (!creds) {
    // No valid creds — trigger login
    process.stderr.write("[native-host] No valid credentials. Opening browser for login...\n")
    try {
      creds = await login()
      process.stderr.write(`[native-host] Logged in as ${creds.user_id} (${creds.plan})\n`)
    } catch (e) {
      process.stderr.write(`[native-host] Login failed: ${e}\n`)
      process.stderr.write("[native-host] Cannot operate without Tulzo auth. Exiting.\n")
      process.exit(1)
    }
  }

  // Fetch config (quotas, guardrails)
  const config = await fetchConfig()
  process.stderr.write(`[native-host] Plan: ${config.plan}, ${config.quotas.requests_per_hour} req/hr\n`)

  // NOW start services (existing code)
  connectAll().catch(...)
  watchConfig(...)
  startPolling()
  startScheduler()
  ensureDaemonReady()...
  startCliSocketServer()

  // Periodic re-verify (every hour)
  setInterval(async () => {
    const check = await verify()
    if (!check.valid) {
      process.stderr.write("[native-host] Key revoked or plan expired. Stopping.\n")
      // Graceful shutdown or re-trigger login
    }
  }, 60 * 60 * 1000)
}

boot()
```

---

### File: `plugin/src/background/native.ts` (MODIFY)

Add auth status awareness. The plugin asks native-host for auth state:

```typescript
// New command the plugin can send:
// { cmd: "getTulzoAuth" }
// Native-host responds: { authenticated: boolean, plan?: string, loginUrl?: string }

// In the plugin panel, before showing the main UI:
// 1. Send getTulzoAuth to native-host
// 2. If not authenticated:
//    - Show "Login Required" screen with button
//    - Button triggers: send { cmd: "tulzoLogin" } to native-host
//    - Native-host runs login() → opens tab via chrome.tabs.create (since we're in browser)
//    - Or: plugin itself opens the tab and passes callback info to native-host
```

---

### File: `native-host/src/index.ts` message handler (MODIFY)

Add two new commands to the native messaging protocol:

```typescript
// In the message handler switch/if chain:

case "getTulzoAuth":
  return {
    authenticated: isAuthenticated(),
    plan: getPlan(),
    user_id: creds?.user_id || null,
  }

case "tulzoLogin":
  // Plugin triggered login — use a different browser-open mechanism
  // since plugin is already in Chrome, it can open the tab itself
  // Native-host just starts the localhost callback server
  const { port, state } = await startCallbackServer()
  return {
    loginUrl: `${TULZO_URL}/api/oauth/plugin/authorize?callback_port=${port}&state=${state}`,
    port,
    state,
  }
  // Plugin opens this URL in a new tab
  // Native-host callback server receives the redirect and saves creds

case "tulzoLogout":
  // Delete tulzo_auth.json, stop services
  clearTulzoAuth()
  return { ok: true }
```

---

### File: `plugin/src/panel/Panel.tsx` (or equivalent UI) (MODIFY)

```
┌────────────────────────────────────────────┐
│  IF not authenticated:                     │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  🔐 Login Required                   │  │
│  │                                      │  │
│  │  Connect to Tex by Tulzo to enable   │  │
│  │  the assistant.                       │  │
│  │                                      │  │
│  │  [  Login with Tulzo  ]              │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  IF authenticated:                         │
│  → Show normal assistant panel             │
│  → Show plan badge (Pro/Plus)              │
└────────────────────────────────────────────┘
```

---

### File: `native-host/data/config/tulzo_auth.json` (CREATED BY AUTH FLOW)

```json
{
  "api_key": "ak_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "user_id": "user_2xKj...",
  "plan": "pro",
  "verified_at": "2026-05-13T14:30:00.000Z",
  "tulzo_url": "https://tulzo.vercel.app"
}
```

Add to `.gitignore`:
```
native-host/data/config/tulzo_auth.json
```

---

### Sequence: CLI Start (no prior login)

```
$ node bin/cli.js start
[native-host] Checking Tulzo auth...
[native-host] No valid credentials. Opening browser for login...
  → Browser opens: https://tulzo.vercel.app/api/oauth/plugin/authorize?callback_port=52847&state=abc123
  → User logs in (or is already signed in)
  → Tulzo redirects to: http://localhost:52847/callback?api_key=ak_XXX&plan=pro&user_id=user_2xKj&state=abc123
[native-host] Logged in as user_2xKj (pro)
[native-host] Plan: pro, 100 req/hr
[native-host] Headless browser ready
[native-host] CLI socket listening at /tmp/horia-browser.sock
[native-host] Telegram polling started
[native-host] Scheduler started
```

### Sequence: Plugin triggers login

```
Plugin panel opens → sends "getTulzoAuth" → { authenticated: false }
Plugin shows "Login Required" screen
User clicks "Login with Tulzo"
Plugin sends "tulzoLogin" → native-host starts callback server
  → returns { loginUrl: "https://...", port: 52847, state: "xyz" }
Plugin opens loginUrl in new tab (chrome.tabs.create)
User authenticates in the new tab
Tulzo redirects to localhost:52847/callback → native-host saves creds
Plugin polls "getTulzoAuth" → { authenticated: true, plan: "pro" }
Plugin shows normal assistant UI
```

### Sequence: Subsequent startup (already logged in)

```
$ node bin/cli.js start
[native-host] Checking Tulzo auth...
[native-host] Verifying stored key...
[native-host] Key valid. Plan: pro
[native-host] Headless browser ready
...
```

---

### Summary of Changes

| Location | File | Type | What |
|----------|------|------|------|
| native-host | `src/tulzo-auth.ts` | NEW | Auth module (login, verify, config, RAG query) |
| native-host | `src/index.ts` | MODIFY | Auth gate at boot, new message handlers |
| native-host | `data/config/tulzo_auth.json` | RUNTIME | Created by auth flow, gitignored |
| plugin | `src/background/native.ts` | MODIFY | Handle getTulzoAuth/tulzoLogin responses |
| plugin | `src/panel/` (UI component) | MODIFY | Show login-required vs authenticated state |
| git | `.gitignore` | MODIFY | Ignore `tulzo_auth.json` |

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
