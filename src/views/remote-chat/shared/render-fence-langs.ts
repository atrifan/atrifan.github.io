// Single source of truth for the fenced-code languages the panel renders as rich blocks
// (chart/map/html/mermaid/…). Both parsers — ChatBubble.parseContentBlocks and
// VariationsBlock.parseTabContent — MUST use this so they can't drift (they did: `html`/`map`
// were missing from the split-view tab parser, so an html card inside a tab rendered as raw
// code). `variations` is intentionally NOT here: it's the container, parsed in a pre-pass.
//
// NOTE: native-host/src/render-fences.ts has a RELATED but broader list for a DIFFERENT
// purpose (deciding which fences are "output, not an action" for weak-model action salvage;
// it also lists markdown/md/mapview). Separate build — can't share this module. Keep the two
// consistent when adding a NEW renderable fence to the panel.
//
// Order matters only for readability; the regex alternation matches any.
export const RENDER_FENCE_LANGS = [
  "chart",
  "mermaid",
  "messages",
  "collapse",
  "diff",
  "math",
  "progress",
  "buttons",
  "followups",
  "map",
  "html",
] as const

export type RenderFenceLang = (typeof RENDER_FENCE_LANGS)[number]

// Build a fresh RegExp matching ```<lang> [title="…"]\n<body>``` for the shared langs.
// Returns a NEW instance each call (regex lastIndex is stateful — callers must not share).
// `subset` lets a caller restrict to a subset (e.g. exclude followups) if ever needed.
export function renderFenceRegex(subset?: readonly string[]): RegExp {
  const langs = (subset ?? RENDER_FENCE_LANGS).join("|")
  return new RegExp("```(" + langs + ')(?:\\s+title="([^"]*)")?\\s*\\n([\\s\\S]*?)```', "g")
}
