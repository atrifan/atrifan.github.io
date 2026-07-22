// Stream-delta parsing shared by the worker (tabStreamStates accumulation) and the
// panel (Chat.tsx message rendering). The tab-streaming-architecture rule requires
// these two to parse IDENTICALLY — so the logic lives here, in one tested place,
// instead of being copy-pasted into both (where they silently drift).
//
// A streamed CLAUDE_CHUNK delta is one of:
//   - action trace:  `selector` → result   OR   *[ACTION]* → result
//   - system note:   *[ ... ]*      (native annotations — compaction, queued-msg, cost caps)
//   - separator:     "<!--step-->"  (native step boundary: flush content→steps)
//   - content:       anything else  (appended to the live answer)
//
// STEP SEPARATOR: the native loop emits the invisible HTML-comment sentinel `<!--step-->`
// right BEFORE an action runs — so streamed text becomes a collapsed "step" ONLY when an
// action follows it; the final streamed answer (no action/sentinel after) stays in `content`
// (the bubble). We deliberately do NOT treat a bare "---" as a separator anymore: it collided
// with the model's own markdown horizontal rules, splitting a report's content into steps. A
// "---" delta is now model content (renders as a real <hr>). The model can't emit the sentinel.
//
// IMPORTANT: native annotations use the *[...]* form ONLY. We deliberately do NOT treat a
// bare "> " prefix as a system note anymore — that collided with MODEL-authored markdown
// blockquotes ("> • Request Rate: ~1", nested "> > *"), which were being hijacked into the
// actions list and rendered as garbled fragments. A "> " delta is model content.

import { pushStepDedup } from "./step-dedup"

export type DeltaKind = "action" | "separator" | "content"

// Classify a raw delta. The *[...]* form covers BOTH action traces (with an arrow) and native
// system notes (no arrow) — both are pushed onto the actions list. A bare "> " is model
// markdown → content (see the header note).
export function classifyDelta(delta: string): DeltaKind {
  const t = delta.trim()
  // Two action/note forms:
  //   `ACTION` → result   (the form native-host emits for a tool call; agent.ts)
  //   *[ANYTHING]*        (native annotation: action label, compaction/queued/cost note)
  // The `*[...]*` check matches a closing `]*` anywhere (not only at end-of-string),
  // so `*[NAVIGATE]* → home` is correctly an action — the previous `endsWith("*")`
  // only matched when nothing followed the label.
  const isActionTrace = (t.startsWith("`") && t.includes("` →")) || (t.startsWith("*[") && t.includes("]*"))
  if (isActionTrace) return "action"
  if (t === STEP_SENTINEL) return "separator"
  return "content"
}

// The invisible step-boundary sentinel the native loop emits before an action. An HTML comment
// so it renders to nothing if it ever reaches markdown; the model can't produce it.
export const STEP_SENTINEL = "<!--step-->"

// Clean an action-trace delta into its display form (strip the backtick/`*[`
// wrappers and normalize the ` → ` arrow). Operates on the trimmed delta.
export function cleanActionTrace(delta: string): string {
  return delta
    .trim()
    .replace(/^`/, "") // strip leading backtick of `ACTION` form
    .replace(/`\s*→\s*/, " → ") // normalize `ACTION` → result
    .replace(/^\*\[/, "") // strip leading *[ of *[ACTION]* form
    .replace(/\]\*\s*→\s*/, " → ") // *[ACTION]* → result  → ACTION → result
    .replace(/\]\*$/, "") // bare *[ACTION]* (no arrow)    → ACTION
    .replace(/\*$/, "") // any stray trailing *
}

// The minimal mutable shape both consumers accumulate into.
export interface StreamAccumulator {
  content: string
  actions: string[]
  steps: string[]
}

// Apply one delta to an accumulator (in place), per the rules above. Returns the
// same object for convenience. This is the single source of truth for how a delta
// mutates stream state — worker and panel both route through it.
export function applyDelta<T extends StreamAccumulator>(acc: T, delta: string): T {
  switch (classifyDelta(delta)) {
    case "action":
      acc.actions.push(cleanActionTrace(delta))
      break
    case "separator":
      if (acc.content.trim()) {
        // De-dupe: skip a step that just re-narrates the previous one (weak models emit
        // "I'll retrieve X" then "I'll fetch X now" as separate steps). Shared so worker +
        // panel stay identical.
        pushStepDedup(acc.steps, acc.content.trim())
        acc.content = ""
      }
      break
    case "content":
      acc.content += delta
      break
  }
  return acc
}
