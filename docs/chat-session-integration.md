# Chat session discovery and attachment: frontend consumer

## Delivery status

This is **UI/frontend consumer work only**, not a working native integration. Browser tests use a **simulated device; frontend contract only**. They mount the real `ChatApp` without production authentication, a database, extension, native daemon, or live producer. They do not prove authorization or actual command execution.

The current Tulzo server discovery endpoint returns only relay table rows. It does **not** enumerate arbitrary native conversations, produce the optional catalog/metadata below, or create stable authorized relay/native bindings. Optional response enrichment, a discovery provider and stable binding are **future Tulzo backend work**, not merely assistant work. This change does not implement a native session bridge, change API handlers, prescribe a migration, persist native transcripts, or modify the assistant. Current real payloads therefore leave other assistant conversations unavailable; existing web chats remain usable.

When discovery has no native integration the UI says:

> Other assistant conversations are unavailable. This connection needs an assistant integration upgrade.

No capability is synthesized from device version, presence, model or source name. Metadata is not an execution acknowledgement.

## Entry and UI behavior

`app/(chat)/chat/page.tsx` → `ChatApp` → `SessionsDrawer` / `NativeSessionChat` (optional native row) or existing `RemoteChat` (web row). Native rendering uses safe Markdown/text and simple questions/approvals only; it does not advertise rich native forms, plans, proposals or allow-always controls. Existing rich web rendering is unchanged.

The selected device's drawer defaults to **History**, with an accessible **Active (n)** / **History** tablist. Only known running/waiting rows count as active. Active rows show source, Streaming/Needs you, supplied start/last-output timing and Attach (This chat / Open for the current conversation). History groups last activity into local-calendar-day Today, Yesterday, This week (day difference 2–6), Older, sorted descending with stable ties. Surface labels match the assistant brief: Panel, CLI, Telegram, Schedule, IDE, capitalized raw names and Unknown surface. Snippets and site chips appear only when supplied; no synthetic Other bucket or preview.

Discovery polling is every three seconds only on Active while the document is visible **and a version-1 catalog is advertised**. Requests never overlap. History, hiding, device switch and disposal cancel the active polling request. History paging is separate, cursor-driven and explicitly incomplete until the producer says otherwise. It is not an Active-only enumeration pretending to be all history.

Opening, retrying and reattaching are read-only operations. Detach releases this page's watch, keeps the transcript read-only, and never stops the turn. An attached idle conversation can explicitly continue through a native reply if complete, current and capable; merely opening it does not start work. A requested turn already finished before attach is shown as finished with history.

## Optional discovery response: proposed, absent from real producers

Existing `GET /api/plugin/chat/sessions → {sessions: RelaySession[]}` remains valid. Existing row fields and relay UUID remain unchanged. Optional additions:

```ts
lastActivity?: number; // epoch ms; UI falls back to parseable updated_at, then created_at
snippet?: string;
domain?: string;       // genuine hostname, not inferred from title or native ID
native?: {
  sessionId: string;   // opaque native identity, never the relay UUID
  surface?: string;
  state: 'running' | 'waiting' | 'idle' | 'unknown';
  protocol?: 1;
  capabilities?: {watch: boolean; reply: boolean; answer: boolean; stop: boolean};
  startedAt?: number; lastChunkAt?: number; loopId?: string;
};
catalog?: {version: 1; complete: boolean; nextCursor: string | null};
```

These listing fields correspond to the assistant's planned `buildHistoryListing` lastActivity/snippet/domain/surface and `LIST_ACTIVE` live-loop metadata. None is claimed to be present in current deployed payloads.

Only a nonempty advertised nextCursor enables Load more chats, using the existing GET with `?cursor=<encoded>`. Merge unique relay IDs within the selected device/generation. `complete:false,nextCursor:null` explicitly means incomplete without continuation. Missing catalog means legacy relay-only discovery; unknown catalog versions do not enable polling or paging. Never call a capped result complete. Native stored discovery currently has a 500-row default; the history brief also identifies a 1000-row cap. Producers must supply continuation or disclose truncation.

Every advertised native row needs a real authorized relay binding:

`(authenticated user, device key, native sessionId) → stable relay UUID`

Creating this metadata-only binding must not create a native conversation, copy its transcript, or open an automation tab. Authorization is checked on every request and at the adapter. Native IDs may repeat on different devices. A missing, foreign, malformed or unsupported native row must not fall through to a sendable new web chat. Native rename/delete are not supported.

## Relay envelope and distinct identities

Unchanged authenticated HTTP routes:

- `POST /api/plugin/chat/send {session_id: <relay UUID>, frame}`
- `GET /api/plugin/chat/receive?session_id=<relay UUID>&after=<relay seq | latest>`

URL `?device=<device key>&session=<relay UUID>` and HTTP routing always use the relay UUID. Native sessionId selects execution context, watchId scopes one page's attachment attempt, loopId targets running work, commandId identifies one command. Native `eventSeq` is not relay delivery `seq`.

Every proposed native frame has `{protocol:1, watchId, nativeSessionId}`. A fresh UUID watchId is generated per attempt, independently for each page/tab. Protocol names below are the browser-relay adapter's namespace, not a competing daemon fan-out API:

| Type | Payload beyond common identity |
|---|---|
| SESSION_ATTACH | none; read-only subscription request |
| SESSION_DETACH | none; idempotent scoped release, never stop |
| SESSION_SNAPSHOT | through, stateVersion, state, loopId (string/null), messages, pending (object/null), historyComplete |
| SESSION_EVENT | eventSeq, change |
| SESSION_COMMAND | commandId, expiresAt (ISO), stateVersion, command |
| SESSION_COMMAND_RESULT | commandId, outcome (`applied`/`rejected`), optional safe-text reason |
| SESSION_ERROR | reason, optional safe-text message |

Snapshot/event state uses the four listing literals. A message is `{id,position,role:'user'|'assistant',text,streaming}`. Stable IDs/positions are native-session-local. Message events contain **full cumulative content** and replace the same message, never concatenate replay onto it. A state change is `{kind:'state',stateVersion,state,loopId,pending}`; a message change is `{kind:'message',message}`.

Pending request is `{requestId,kind:'question'|'approval',prompt}`. A question receives text; an approval receives explicit approve/deny. Unsupported native interaction types must remain read-only at the producer, not be normalized into fabricated supported interactions.

Commands are `{kind:'reply',text}`, `{kind:'stop',loopId}`, or `{kind:'answer',requestId,text? ,decision?:'approve'|'deny'}`. Answer requires text or decision. Error reasons: unsupported, not_found, offline, history_unavailable, resync_required, expired, stale_target, internal. Unknown versions/foreign watches are inert; malformed matching snapshots/events fail closed.

## Atomic history/live join and lifecycle

1. Install the scoped consumer, await a completed `after=latest` receive prime, then send SESSION_ATTACH. Continue numeric polling during attach. **Never re-prime latest after attach**: a synchronous snapshot could otherwise be skipped. Each retry gets its own fresh prime and watchId.
2. Snapshot is an atomic full user-visible history/partial-turn projection through native event watermark `through`. Buffer at most 1000 unique matching pre-snapshot events; apply only events strictly above through in contiguous sequence order. Ignore replay/duplicates at or below it. A gap requires explicit reattachment, not a guessed state.
3. Missing snapshot times out after 15 seconds. Each discovery/receive request also has a 15-second deadline, including body parsing, so a stalled connection cannot leave controls falsely live or discovery loading forever. Best-effort detach requests expire after five seconds. Malformed data, gaps, overflow, interrupted receive and incomplete history fail closed. Keep displayed text explicitly stale/read-only. Retry attachment is explicit, gets a new watch and snapshot, and never sends user text.
4. Native history comes only from this snapshot, not a concurrent legacy `/messages` request. `historyComplete:false` shows the partial-history warning and disables all commands. Full context/history ownership is a producer prerequisite, not something UI metadata can prove.
5. Session/device/New chat/unmount/retry cancel scoped requests, timers and listeners. Best-effort SESSION_DETACH only releases this watch; no STOP_STREAM, global disconnect or daemon shutdown. Pagehide release is best effort. Producer-side expiry is mandatory for abandoned watches.
6. Results must match this device/relay selection, native ID, watchId and current generation. Unknown/late/foreign-watch frames and late create/list/command completions cannot alter another selection. Draft identity includes device and relay/native IDs.

The client uses synchronous per-watch state and request cancellation/generation guards, not locks; there is no shared-memory storage mutation requiring locking.

## Controls and execution acknowledgement

Every action path (click, Enter, pending card) requires understood protocol, watch + action capability, online device, a complete current snapshot, known current state, healthy watch and no unresolved command. Running replies steer, waiting answers target the exact current request, stop targets the current loop, idle reply continues the same native identity. No native action uses legacy SEND_MESSAGE/STOP_STREAM, session creation or automation fallback.

Each command carries current stateVersion, fresh commandId and a deadline 10 seconds after issue. HTTP 2xx is only **Sent, awaiting assistant**, not Stopped/Approved. Stop remains Stopping until authoritative execution feedback. Message events alone add native transcript entries; no duplicate optimistic echo. Applied command results may clear the issued composer text; rejected/ambiguous/timeout results preserve draft, disable controls and require explicit reattachment/current-state review. There is no command persistence, resend queue or auto retry.

Legacy initial/idle web sends retain durable offline delivery with its delivery note. Legacy active steering, pending answers/approvals and stop are blocked offline. This is not a claim that legacy frames gained native-safe producer expiry.

## Future assistant + Tulzo integration checklist

- **Tulzo backend:** enrich discovery with real native metadata/catalog and stable user/device-authorized relay/native bindings; retain ownership checks on send/receive and reject mismatched bindings. This frontend does not implement the provider, storage scheme or API enrichment.
- **Assistant remote adapter:** implement SESSION_* v1 only when discovery, full history, live subscription, command handling and feedback all work end-to-end. Existing remote controller handles its own registered remote loops, not arbitrary native surfaces or these new frames.
- **Reuse planned native work:** adapt `LIST_ACTIVE`, `ATTACH_LIVE`, `DETACH_LIVE`, and `STREAM_REPLY` from `active-sessions-brief.md`. Reuse stream-hub/stream-routing rather than create competing fan-out. Map planned attachId/replay stream to browser watchId + atomic snapshot/native eventSeq, preserving scope and dedup.
- **Do not send socket STREAM_ATTACH on the extension's shared daemon connection:** it narrows that socket's routing. Use an independently scoped multiplexed subscription, or a dedicated authenticated connection per watch. Detach one leaves all other watches, panel tabs and shared traffic intact.
- **Full history/context:** replay alone is truncatable and not the full durable transcript. Resolve the original source surface's history owner and execution context. Do not copy all transcripts to Tulzo or persist SESSION_SNAPSHOT as a legacy terminal frame.
- **Same-session continuation:** STREAM_REPLY kind `none` returns an outcome; it does **not** start an idle turn. Deliberately start continuation with the original native ID, history and source context. Do not route imported sessions into startRemoteLoop: the current remote path supplies `history:[]`, uses `remote-<relay UUID>`, and may create an automation tab. That `history:[]` behavior is a current remote-history integration bug/ownership constraint, not resolved here. `prepareAgentStart` preserves supplied arrays (including empty ones); automatic history is only for allowlisted daemon-owned surfaces. Omitting history is not universal resume support.
- **Producer validation:** enforce authorized binding, current watch/native/loop/request/stateVersion, canceled-watch rejection, 10-second expiresAt, first-answer-wins and commandId idempotency before execution. Emit explicit applied/rejected results and authoritative state events. Expire orphan watches and clean question routes. Never execute an expired stop/approval after recovering an offline queue.
- **Durable relay race:** current `/send` durably enqueues offline. UI presence gating cannot prevent a presence race from leaving a frame queued. The producer must reject expired/stale commands. A stronger “never enqueue during race” guarantee would require future server admission work, outside this delivery.
- **Capability honesty:** advertise each action separately, only for actually supported surfaces/interaction types and a healthy bridge. Unknown versions, truncated history/catalog and unsupported sources stay unavailable/read-only.

## Required real acceptance later (not supplied by this UI suite)

Start conversations in web, editor/CLI and another supported native surface. Verify discovery beyond current caps, native history ownership and user/device access denial. Open running/waiting/idle without new work; join full history/replay/live without duplicate text; steer/answer/approve/deny/stop/continue the same ID; validate stale/expired/duplicate/canceled-watch commands; verify two watchers, device switches and browser disappearance. Confirm other panel/CLI/editor/Telegram behavior and shared daemon traffic remain unchanged. Record which surfaces actually work.

The isolated browser harness and pure model tests prove frontend consumption of a simulated contract only. Signed-in Next routing/auth, real API enrichment, native subscriptions/history and execution remain separately unverified until that integration exists.
