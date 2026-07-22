# Remote Chat — Device-Side Presence & Relay Handoff

**Audience:** implementers of the "Horia" browser assistant (extension + native-host repo).
**Status:** Tulzo (control-plane) side is built. This is the device half.
**Supersedes:** the "presence via `/api/verify` hourly touch" stopgap — see *Why polling is the wrong model* below.

---

## TL;DR

The assistant's background worker must hold **one persistent Supabase Realtime connection** to
Tulzo. That single connection does two jobs at once:

1. **Presence** — the worker's membership in a Realtime **Presence** channel *is* the device's
   online/offline signal. Joined ⇒ online; the socket drops ⇒ Tulzo learns immediately. No
   heartbeat polling, no 10-minute freshness window.
2. **Relay** — the same channel carries `PanelToWorker` frames from a remote page (phone / 2nd
   computer) into the agent loop, and streams `WorkerToPanel` frames back.

native-host keeps doing **only** hourly API-key validation (`GET /api/oauth/plugin/verify`). It is
no longer responsible for presence.

---

## Why the current model is wrong

Today Tulzo derives "online" from `device_heartbeats.updated_at < 10 min` (`computeDeviceStatus`).
That row is only freshened as a **side effect** of device REST calls:

| Writer | Cadence | Reality |
|--------|---------|---------|
| `POST /api/plugin/report` | whenever the device chooses | rich heartbeat, but not guaranteed frequent |
| `GET /api/verify` | ~hourly | far coarser than the 10-min window it feeds |
| `GET /api/plugin/chat/poll` | only during a live relay chat | **not implemented on the device yet** |

Two consequences the user hit:
- A device that is **actively connected** in the browser (the `window.postMessage` bridge in
  `src/lib/extension-bridge.ts` is green) still shows **offline** on a phone, because the live
  bridge is tab-local and **never tells the server** it's connected.
- The remote-chat composer and Overview read server-side state, so they lag or show wrong data.

Polling harder doesn't fix this — presence is a *connection liveness* fact, and the device already
needs a persistent connection for the relay. Reuse it.

---

## Target architecture

```
[Phone / 2nd computer]            [Tulzo / Supabase]                [Device: Horia worker]
  RemoteChat (built)  ──send──▶  POST /api/plugin/chat/send  ──┐
                                                               │  broadcast on chat:<session_id>
  RemoteChat          ◀─stream─  Supabase Realtime  ◀──emit──  │
                                 Presence on device:<api_key_id> ◀── worker JOINS (online signal)
                                                               │
  Overview / picker   ◀──────  presence snapshot  ◀────────────┘
```

- **One Realtime client in the persistent background worker** (NOT a page/content-script — a page
  navigation must never drop presence). It authenticates to Supabase with the device's context.
- **Presence channel per device:** `device:<api_key_id>`. The worker `track()`s itself on join.
  Tulzo (or a Realtime-authorized reader) treats a tracked member as **online**; a Realtime
  `leave` / socket close marks it **offline** at once.
- **Relay channel per session:** `chat:<session_id>` (already used by Tulzo's `chat-relay-service.ts`).
  The worker subscribes to `to_device` frames and posts `to_page` frames via `POST /api/plugin/chat/emit`.
  Fallback when Realtime can't be held: long-poll `GET /api/plugin/chat/poll` with the Bearer key
  (this endpoint already touches presence as a safety net).

---

## Device-side requirements

1. **Persistent worker connection.** On device activation (API key present), the background worker
   opens the Supabase Realtime connection and joins `device:<api_key_id>` with Presence `track()`.
   It must live in the **service worker / native-host**, independent of any open tab. It must
   survive the agent navigating tabs (the user's "interact in a different tab while the old tab
   stays connected" requirement).

2. **Never automate the control-plane tab.** Route agent actions to a **dedicated automation tab**
   (`chrome.tabs.create` if the only tab is the Tulzo/control-plane tab). The connection tab, if
   any, is excluded from automation.

3. **Use the connected-browser execution path**, not headless/in-process Playwright — remote chat
   must run against the real signed-in Chrome (`chrome.tabs.update`, `chrome.scripting.executeScript`,
   `chrome.debugger`/CDP) so it inherits live cookies/sessions. The native-host headless path has an
   empty cookie jar and must not be used for relayed sessions.

4. **Route inbound frames into the existing agent loop.** `SEND_MESSAGE`, `STOP_STREAM`, and the
   response frames (`USER_RESPONSE`, `PLAN_RESPONSE`, `ACTION_APPROVAL_RESPONSE`,
   `BRAIN_QUESTIONS_RESPONSE`, `FORM_RESPONSE`, `PROPOSALS_RESPONSE`, `CLEAR_SESSION_CONTEXT`,
   `STOP_SUBAGENT`, `OPEN_FILE/OPEN_FOLDER/OPEN_LINK`) feed the same loop the local panel uses.

5. **Fan out, don't re-route.** Outbound stream events (`STREAM_CHUNK`, `THINKING_CHUNK`,
   `RENDER_BLOCK`, `PLAN_*`, `ACTION_APPROVAL_REQUEST`, `STREAM_DONE`, `SESSION_USAGE`, …) go to
   **both** the local Chrome `Port` (the device's own panel) **and** the relay `emit` route, so the
   person at the device and the person on mobile watch one shared, live turn. Keep
   `shared/stream-parse.ts` byte-identical to Tulzo's copy (`src/views/remote-chat/shared/`).

6. **Report the active model in presence/heartbeat.** Tulzo's remote-chat composer now seeds its
   model from the device's reported `model` (heartbeat field `model`, surfaced by
   `/api/plugin/devices`). Include the current orchestrator model in the presence payload (or keep
   `POST /api/plugin/report` sending `model`) so the phone shows the right model, not a default.

7. **Auth & gating.** Reuse the device-authorized check; gate on plan (paid only) and per-session
   ownership. Consider adding a `chat`/`stream` frame family to the control-plane allow-list rather
   than a raw passthrough.

---

## Tulzo-side contract (already implemented / to add)

**Implemented:**
- Relay routes under `app/api/plugin/chat/`: `sessions`, `sessions/[id]/messages`, `send`, `poll`,
  `emit`. Frames are the unchanged `PanelToWorker`/`WorkerToPanel` objects.
- Durable history in `chat_relay_messages`; the device need only stream.
- Device auth: `Authorization: Bearer <api_key>`; channel `chat:<session_id>`.
- `computeDeviceStatus` + `getDevicesWithHeartbeats` feeding `/api/plugin/devices`, Overview, and
  the remote-chat picker. Remote-chat page re-polls `/api/plugin/devices` every 15s so it reflects
  fresh status/model.

**To add on the Tulzo side when the device adopts Realtime Presence** (small, do together with the
device work):
- A presence reader so `computeDeviceStatus` (or a parallel `isPresent(api_key_id)`) can consult
  the `device:<api_key_id>` Presence channel instead of only the 10-min heartbeat window. Options:
  (a) the device keeps upserting a heartbeat on presence join + a light keepalive, so the existing
  window logic Just Works; or (b) Tulzo subscribes to the Presence channel server-side. Option (a)
  is the lower-risk first step and needs no new Tulzo read path — the device simply upserts on join
  and on a ~60s keepalive while connected, and stops on disconnect.

> **Recommended minimal first step:** device joins `device:<api_key_id>`, and on join + every ~60s
> while connected calls `POST /api/plugin/report` (or a lighter presence ping). That alone makes
> "online" accurate within a minute using the *existing* Tulzo logic — no new server read path,
> and it's driven by a real persistent connection rather than an hourly poll. Full server-side
> Presence subscription can follow.

---

## Instrumentation gap (separate, related)

Overview shows `Requests Today = 0` because **nothing writes a `'request'` event** to
`api_usage_log`. Only `config_fetch`, `rag_query` (via `/api/plugin/query`), and marketplace actions
are logged; the actual chat/MCP request paths are not instrumented. If per-request counts are
desired, add a usage-log write on the real request path (chat/MCP). This is a product decision, not
a bug — noting it here because it surfaces alongside presence in the same panel.

---

## Acceptance (manual E2E, once device side lands)

1. Activate the device; with **no Tulzo tab open on the device**, open `/chat` on a phone → the
   device shows **online** within ~60s.
2. Kill the assistant → the phone shows **offline** within the presence/keepalive window.
3. Send "go to example.com and summarize" from the phone → the *device's* dedicated automation tab
   navigates; the summary streams back to the phone **and** the device's local panel simultaneously.
4. The phone's composer shows the device's **actual** model, not a hardcoded default.
5. Reload the phone → history rehydrates from `chat_relay_messages`.
