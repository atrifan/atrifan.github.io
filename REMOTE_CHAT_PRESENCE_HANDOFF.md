# Remote Chat — Device-Side Presence & Relay Handoff

**Audience:** implementers of the "Horia" browser assistant (extension + native-host repo).
**Status:** Tulzo (control-plane) side is built. This is the device half.
**Supersedes:** the "presence via `/api/verify` hourly touch" stopgap — see *Why polling is the wrong model* below.

**Chosen approach (decided):** ship **Phase 1** now — keep the existing long-poll relay and add
**presence via a keepalive heartbeat** (report on connect + ~60s tick, stop on disconnect). No new
dependency, fully unit-testable today, works with Tulzo's existing logic unchanged. **Defer the
Supabase Realtime unification (Phase 2)** until the Tulzo server half (Realtime Presence reader)
exists. Both phases are specified below; build Phase 1.

---

## TL;DR

**Phase 1 (build now):** the background worker, while the device is activated and connected,
`POST`s `/api/plugin/report` **on connect and every ~60s**, and stops on disconnect. That keepalive
*is* the presence signal — it keeps `device_heartbeats.updated_at` inside Tulzo's existing 10-min
window, so "online" becomes accurate within ~a minute of a genuine connection, with **zero Tulzo
changes and no new dependency**. The relay keeps using the existing long-poll
(`GET /api/plugin/chat/poll` for `to_device` frames, `POST /api/plugin/chat/emit` for `to_page`).

**Phase 2 (deferred):** collapse presence + relay into **one persistent Supabase Realtime
connection** — Presence membership on `device:<api_key_id>` becomes the exact online/offline signal
(no window, instant `leave`), and the same channel carries the relay. This needs a Tulzo-side
Presence reader first; do it when that lands.

In **both** phases native-host keeps doing **only** hourly API-key validation
(`GET /api/oauth/plugin/verify`) — it is no longer responsible for presence. The keepalive lives in
the **background worker**, not native-host, so it reflects a real live connection rather than a timer.

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

### Phase 1 — long-poll relay + keepalive presence (BUILD NOW)

```
[Phone / 2nd computer]            [Tulzo / Supabase]                [Device: Horia worker]
  RemoteChat (built)  ──send──▶  POST /api/plugin/chat/send ─▶ chat_relay_frames (to_device)
  RemoteChat          ◀─stream─  POST /api/plugin/chat/emit ◀── worker (to_page)              │
                                 GET  /api/plugin/chat/poll ◀── worker long-polls to_device ──┘
  Overview / picker   ◀── device_heartbeats (<10min) ◀── worker POSTs /api/plugin/report
                                                          on connect + every ~60s (keepalive)
```

- **Keepalive presence.** While the device is activated **and** the worker's connection is up, the
  worker `POST`s `/api/plugin/report` on connect and every ~60s, and **stops on disconnect**. This
  keeps `device_heartbeats.updated_at` inside the existing 10-min window, so `computeDeviceStatus`
  returns `online` for a genuinely-connected device with **no Tulzo change**. The keepalive lives in
  the **background worker** (not native-host, not a page) so it tracks a real live connection and
  survives the agent navigating tabs.
- **Long-poll relay.** The worker long-polls `GET /api/plugin/chat/poll` (Bearer key) for
  `to_device` frames and posts `to_page` frames via `POST /api/plugin/chat/emit`. Both endpoints
  exist. (`poll` also touches presence as a safety net, but the keepalive is the primary signal.)
- **No new dependency.** Everything is REST the device already speaks; unit-testable today.

### Phase 2 — Supabase Realtime unification (DEFERRED, needs Tulzo server half)

```
  RemoteChat          ◀─stream─  Supabase Realtime  ◀──emit──  worker holds ONE persistent socket
                                 Presence on device:<api_key_id> ◀── worker JOINS (exact online signal)
  Overview / picker   ◀──────  presence snapshot  ◀────────────────  (leave = offline instantly)
```

- Collapse presence + relay into **one persistent Realtime client in the background worker** (NOT a
  page/content-script — navigation must never drop it). Presence membership on `device:<api_key_id>`
  becomes the exact online/offline signal (no 10-min window; `leave`/socket-close ⇒ offline at once),
  and channel `chat:<session_id>` carries the relay frames.
- **Blocked on Tulzo** adding a server-side Presence reader (see *Tulzo-side contract* → Phase 2).
  Do not start this until that lands; Phase 1's keepalive is the interim presence signal.

---

## Device-side requirements

> Requirements **1** and **8** differ by phase; the rest apply to both. Build the Phase 1 variants now.

1. **Persistent worker connection.**
   - **Phase 1:** on activation, the background worker starts the keepalive loop (report on connect
     + ~60s tick, stop on disconnect) and the relay long-poll. Both live in the **service worker /
     native-host**, independent of any open tab, and survive the agent navigating tabs (the user's
     "interact in a different tab while the old tab stays connected" requirement).
   - **Phase 2:** replace both with a single Supabase Realtime connection joining
     `device:<api_key_id>` with Presence `track()`, same persistence/tab-independence constraints.

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

6. **Report the active model in the heartbeat.** Tulzo's remote-chat composer now seeds its model
   from the device's reported `model` (heartbeat field `model`, surfaced by `/api/plugin/devices`).
   The Phase 1 keepalive `POST /api/plugin/report` already carries `model` — just make sure it sends
   the current orchestrator model so the phone shows the right one, not a default. (Phase 2: include
   it in the presence payload.)

7. **Auth & gating.** Reuse the device-authorized check; gate on plan (paid only) and per-session
   ownership. Consider adding a `chat`/`stream` frame family to the control-plane allow-list rather
   than a raw passthrough.

8. **Keepalive lifecycle (Phase 1).** Start the ~60s report tick when the worker connection comes up;
   **stop it on disconnect / device deactivation** so a dead device ages out of the 10-min window and
   correctly flips to offline. Do not run it from a timer that outlives the connection (that would
   report a dead device as online). This is the whole point — presence must track the live connection.

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

**Phase 1 — nothing to add.** The keepalive path reuses `POST /api/plugin/report` and the existing
`computeDeviceStatus` 10-min window. Tulzo already reflects fresh status/model (the remote-chat page
re-polls `/api/plugin/devices` every 15s). No server change required to ship Phase 1.

**Phase 2 — Presence reader (deferred).** When the device moves to a persistent Realtime connection,
add a server-side presence reader so `computeDeviceStatus` (or a parallel `isPresent(api_key_id)`)
consults the `device:<api_key_id>` Presence channel instead of only the heartbeat window — giving
exact, instant offline detection. This is the trigger to start the device-side Phase 2 work; until
it exists, Phase 1's keepalive is the presence signal.

---

## Instrumentation gap (separate, related)

Overview shows `Requests Today = 0` because **nothing writes a `'request'` event** to
`api_usage_log`. Only `config_fetch`, `rag_query` (via `/api/plugin/query`), and marketplace actions
are logged; the actual chat/MCP request paths are not instrumented. If per-request counts are
desired, add a usage-log write on the real request path (chat/MCP). This is a product decision, not
a bug — noting it here because it surfaces alongside presence in the same panel.

---

## Acceptance (Phase 1)

**Unit-testable now (no live device needed):**
- Keepalive starts on connect and posts `/api/plugin/report` on an interval; **stops on disconnect**
  (assert no further posts after teardown).
- Report payload includes the current orchestrator `model`.
- Relay long-poll drains `to_device` frames and posts `to_page` frames to `emit`.

**Manual E2E (with a real device):**
1. Activate the device; with **no Tulzo tab open on the device**, open `/chat` on a phone → the
   device shows **online** within ~60s (the panel re-polls every 15s; keepalive ticks every ~60s).
2. Kill the assistant → the phone shows **offline** within ~10 min (heartbeat ages out of the
   window; Phase 2 makes this instant).
3. Send "go to example.com and summarize" from the phone → the *device's* dedicated automation tab
   navigates; the summary streams back to the phone **and** the device's local panel simultaneously.
4. The phone's composer shows the device's **actual** model, not a hardcoded default.
5. Reload the phone → history rehydrates from `chat_relay_messages`.
