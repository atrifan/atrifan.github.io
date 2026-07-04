---
description: Assistant admin surfaces — skill enable/disable, per-skill settings, notification channels, schedules, and the plugin catalog
appliesTo: ["src/views/ControlPanelPage.tsx", "app/api/plugin/**"]
alwaysApply: false
---

# Plugin Admin (assistant-side capabilities the control panel manages)

The "Horia" assistant exposes these admin capabilities over the extension bridge
(`src/lib/extension-bridge.ts`, `bridge.send(command, params)`). The control panel
surfaces them in the live view of the connected device. See [[plugin-control-plane]]
for the connection model.

## Skill / plugin enable-disable

Skills and plugins are file-defined (frontmatter), not DB rows. Disabling adds
`disabled: true` to the SKILL.md/PLUGIN.md frontmatter; a disabled plugin disables
all its child skills. Disabled skills stay listable but are never injected/executed.

- `LIST_SKILLS` — each skill entry now carries `disabled`, `commands`,
  `settingsFile`, `notificationChannel` (top-level AND plugin-nested).
- `SKILL_SET_ENABLED` — `{ skillId | id: string, enabled?: boolean }` → `{ ok, id, kind:'skill', enabled }`.
- `PLUGIN_SET_ENABLED` — `{ pluginId | id: string, enabled?: boolean }` → `{ ok, id, kind:'plugin', enabled }`.

## Per-skill settings (`settings_file`)

A skill may declare `settings_file: <name>` (e.g. digital-twin's `twin-config.yaml`).
User edits are stored as a user-root copy that overrides the shipped default.

- `GET_SKILL_SETTINGS` — `{ skillId }` → `{ ok, skillId, settingsFile, content, source:'user'|'default'|'none' }`.
- `SET_SKILL_SETTINGS` — `{ skillId, content }` (YAML; validated) → `{ ok, detail? }`.

The control panel renders this as a generic YAML editor behind a gear icon on any
skill with a `settingsFile`.

## Notification channels (registry)

Chrome is the only built-in channel; every other channel is a skill declaring
`notification_channel:` (e.g. the Slack/Telegram channel skills) and is available
only when that skill is active + enabled.

- `NOTIFICATION_GET_CONFIG` → `config.availableChannels: [{ id, name, builtin }]`
  (dynamic) plus per-channel `enabled` + event rules.
- `NOTIFICATION_TEST` — `{ channel?: string }` sends a test to that channel (or via
  the event rules if omitted).

## Schedules

- `SCHEDULE_LIST` → `{ schedules: [{ id, cron, prompt, type, paused?, catchup? }] }`
- `SCHEDULE_ADD` — `{ cron, prompt, source? }` (also an LLM tool `ADD_SCHEDULE` with `scheduleType:'task'|'notify'`)
- `SCHEDULE_PAUSE` / `SCHEDULE_RESUME` — `{ id }`
- `SCHEDULE_REMOVE` — `{ id }`
- `SCHEDULE_SET_CATCHUP` — `{ id, value: boolean }`

## CLI

`/skill` (alias `/skills`) lists skills/plugins and toggles them
(`/skill enable|disable [--plugin] <id>`). Skills can also declare their own
`commands: [{ name, description, surfaces, prompt }]` shorthands (surfaces:
`cli|telegram|panel`), dispatched by typing `/name`.

## Plugin catalog (new connectors)

| Plugin / skill | Purpose | Auth |
|----------------|---------|------|
| microsoft → outlook-mail | List/read/send/reply Outlook mail (Graph) | OAuth `microsoft` (`$AUTH_TOKEN_MICROSOFT`) |
| microsoft → outlook-calendar | Outlook calendar agenda/events (Graph) | shares `microsoft` OAuth |
| google → google-calendar | Google Calendar agenda/events/free-busy | shares `google` OAuth (`calendar` scope) |
| **digital-twin** | Scheduled orchestrator: gather → triage → act → escalate → report → learn across Gmail/Outlook/Calendars/Slack/GitHub | none of its own; composes the above connectors + Telegram secrets + scheduler |

**digital-twin** is the flagship composition. Its editable policy lives in
`twin-config.yaml` (via `GET/SET_SKILL_SETTINGS`, `skillId: 'digital-twin'`): `watch`
targets per source, `escalate` channel + `quiet_hours`, and `autonomy`
(`approval-gated | tiered | autonomous`). A control plane surfaces its dependency
connectors' auth/health, the schedules driving its sweeps, its notification routing,
its enabled/disabled state, and its autonomy/quiet-hours policy.
