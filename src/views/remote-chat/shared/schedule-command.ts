// `/schedule` command parsing + formatting — shared, pure, unit-tested, so the plugin behaves like
// the CLI: list/pause/resume/delete are DETERMINISTIC direct native calls (SCHEDULE_LIST/PAUSE/
// RESUME/REMOVE), NOT an LLM prompt. Only `create` (freeform → cron parsing) needs the agent.
//
// Why: `/schedule list` used to be sent to the model as "List my tasks — use CLI_EXEC or the
// scheduler", which made it probe for a nonexistent ~/.config/horia-assistant/schedules.json file
// and then report "no scheduled tasks" even though LIST_SCHEDULES returned real ones. Schedules
// are DB-backed; reading/toggling them is a plain lookup, not a reasoning task.

export interface ScheduleRow {
  id: string
  cron: string
  prompt: string
  enabled?: boolean
  type?: string
  last_run?: string | null
}

// A direct native action (no LLM) or a create-instruction for the agent.
export type ScheduleCommand =
  | { kind: "list" }
  | { kind: "pause"; id: string }
  | { kind: "resume"; id: string }
  | { kind: "delete"; id: string }
  | { kind: "create"; instruction: string }

// Map `/schedule <sub>` to a command. list/pause/resume/delete are deterministic; anything else is
// a create instruction handled by the agent (it parses the time/cron + task).
export function parseScheduleCommand(sub: string): ScheduleCommand {
  const s = sub.trim()
  const id = (rest: string) => rest.trim().replace(/^#/, "")
  if (!s || s === "list") return { kind: "list" }
  if (s.startsWith("pause ")) return { kind: "pause", id: id(s.slice("pause ".length)) }
  if (s.startsWith("resume ")) return { kind: "resume", id: id(s.slice("resume ".length)) }
  if (s.startsWith("delete ")) return { kind: "delete", id: id(s.slice("delete ".length)) }
  return { kind: "create", instruction: s }
}

// Run a deterministic /schedule command to its bubble markdown, given a native-call fn. Extracted
// so the worker handler is a thin wrapper and this — the part that must ALWAYS return a string
// (never throw, never leave the panel with no reply) — is unit-tested. `create` is not run here
// (the panel routes it to the agent); if it slips through, we return a usage hint.
export async function runScheduleCommand(
  sub: string,
  nativeCall: <T>(type: string, params?: Record<string, unknown>) => Promise<T>,
): Promise<string> {
  const cmd = parseScheduleCommand(sub)
  try {
    if (cmd.kind === "list") {
      const r = await nativeCall<{ schedules: ScheduleRow[] }>("SCHEDULE_LIST", {})
      return formatSchedulesMarkdown(r.schedules ?? [])
    }
    if (cmd.kind === "pause") {
      const r = await nativeCall<{ ok: boolean }>("SCHEDULE_PAUSE", { id: cmd.id })
      return r.ok ? `⏸ Paused schedule \`${cmd.id}\`.` : `Could not pause \`${cmd.id}\` — no such schedule.`
    }
    if (cmd.kind === "resume") {
      const r = await nativeCall<{ ok: boolean }>("SCHEDULE_RESUME", { id: cmd.id })
      return r.ok ? `▶ Resumed schedule \`${cmd.id}\`.` : `Could not resume \`${cmd.id}\` — no such schedule.`
    }
    if (cmd.kind === "delete") {
      const r = await nativeCall<{ ok: boolean }>("SCHEDULE_REMOVE", { id: cmd.id })
      return r.ok ? `🗑 Deleted schedule \`${cmd.id}\`.` : `Could not delete \`${cmd.id}\` — no such schedule.`
    }
    return "To create a schedule, use `/schedule <time> <when> <task>`."
  } catch (e) {
    return `Schedule command failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

// Render schedules as a markdown table for a chat bubble. Deterministic — mirrors the CLI's
// formatScheduleTable. Empty list → an honest "no scheduled tasks" (only when the DB truly has none).
export function formatSchedulesMarkdown(schedules: ScheduleRow[]): string {
  if (!schedules || schedules.length === 0) {
    return "You have no scheduled tasks."
  }
  const lines = [`**Scheduled tasks (${schedules.length}):**`, ""]
  for (const s of schedules) {
    const status = s.enabled === false ? "⏸ paused" : "▶ active"
    const kind = s.type === "notify" ? " · notify" : ""
    const last = s.last_run ? new Date(s.last_run).toLocaleString() : "never"
    lines.push(`- \`${s.id}\` · \`${s.cron}\` · ${status}${kind}`)
    lines.push(`  - ${s.prompt}`)
    lines.push(`  - last run: ${last}`)
  }
  return lines.join("\n")
}
