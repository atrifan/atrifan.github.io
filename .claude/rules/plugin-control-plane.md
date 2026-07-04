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

`src/views/ControlPanelPage.tsx` (live at `/dashboard`) — accessible tablist (roles `tablist`/`tab`/
`tabpanel`, arrow-key nav) with tabs: Overview, Devices, Usage, Logs, Docs, Marketplace, Publisher, Budget.
The Overview "Recent Activity" card and `GET /api/dashboard/activity` surface interactions (from
`api_usage_log`) and per-device installed inventory (from heartbeats). Package install/manage on-device
goes through `extension-bridge.ts` (`LIST_INSTALLED`, `INSTALL_PACKAGE`, `MCP_ADD_SERVER`). The live
device view also manages skills/plugins (enable/disable, YAML settings), notification channels, and
schedules over the same bridge — see [[plugin-admin]].

The in-browser side panel connects via a control-plane content-script bridge on the tulzo/zip.run.place
domains (`window.postMessage` handshake carrying the API key + device name).
