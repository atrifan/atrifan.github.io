---
description: Browser assistant (Horia) ↔ Tulzo control-plane connection, API keys, and observability
appliesTo: ["app/api/plugin/**", "app/api/oauth/plugin/**", "app/api/keys/**", "app/api/dashboard/**", "src/lib/extension-bridge.ts"]
alwaysApply: false
---

# Plugin / Control Plane

Tulzo is the cloud control plane for the "Horia" browser assistant. The assistant authenticates with a
Tulzo API key; the control panel observes and manages devices, usage, and installed packages.

## Auth handshake

`GET /api/oauth/plugin/authorize?callback_port=&state=` → Clerk sign-in → redirect to
`http://localhost:<port>/callback?api_key=&plan=&user_id=&state=`. The assistant then calls
`GET /api/oauth/plugin/verify` (Bearer) and `GET /api/plugin/config` (plan, quotas, guardrails) on
startup and periodically. `POST /api/plugin/report` sinks device heartbeats.

## API keys

Multi-device, per `(user_id, server_name, device_name)`. SHA-256 hashed. Free plan blocked. Managed via
`app/api/keys/{generate,list,delete}`; heartbeat status via `getDevicesWithHeartbeats` +
`computeDeviceStatus`.

## Control panel observability

The ai. surface (`app/(ai)/ai/[[...tab]]`, `src/views/ai/*`, sections listed in `src/lib/ai-tabs.ts`):
Overview, Devices, Usage, Logs, Packages, MCP servers, Schedules, Secrets, Allowlist, A2A peers, Fleet,
Notifications, Providers, Docs, each at its own URL, signed-in only, noindex, no ads, on the design tokens.
`useControlPanelData` (mounted in the layout) holds devices/usage (server) and the bridge (connection,
typed `send`, message log, `GET_DEVICE_INFO` snapshot, presence beacon). Credits/billing live on the hub
(`surfaceUrl('hub','/credits')`); the catalog and publisher stats live on marketplace.

Every bridge command goes through `src/lib/bridge-commands.ts`: a typed table of the commands Tulzo sends
with the fields each native-host handler requires/reads, plus validated builders for the forms.
`tests/unit/bridge-contract.vitest.ts` reads the assistant source (`ASSISTANT_REPO`, default `../assistant`
beside the main checkout; skipped if absent) and fails if a command is off the extension allow-list
(`CONTROL_PLANE_ALLOWED_COMMANDS` in `plugin/src/background/worker.ts`), has no native-host `case`, sends a
field its handler does not read, or omits one the handler refuses without. `NOTIFICATION_TEST` and
`SCHEDULE_SET_CATCHUP` are NOT on the allow-list, so the dashboard cannot send them. `SECRETS_LIST` returns
stored values; `normalizeSecrets` (`src/lib/ai-device-data.ts`) drops them so they never reach the page.

`tests/live/ai-extension.live.spec.ts` (project `live-extension`, opt-in via `AI_EXTENSION_DIR` and
`AI_EXTENSION_PROFILE`) drives the panel against the real built extension and an isolated native host.

The in-browser side panel connects via a control-plane content-script bridge on the tulzo/zip.run.place
domains (`window.postMessage` handshake carrying the API key + device name).
