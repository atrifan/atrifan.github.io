// Turn an assistant answer into text worth READING ALOUD (TTS). The raw content contains render
// fences (```html card / ```chart / ```map / ```mermaid …) and code blocks that must NOT be spoken
// verbatim — reading markup/JSON aloud is noise. This strips them to a short spoken placeholder and
// lightly de-markdowns the rest, so voice speaks the human prose only. Pure + tested. Mirrors
// Telegram's stripRenderFences intent (native-host) for the panel side.

import { renderFenceRegex, type RenderFenceLang } from "./render-fence-langs"

// What to say in place of each stripped rich block (so the listener knows something visual exists).
const SPOKEN_PLACEHOLDER: Record<string, string> = {
  chart: "a chart",
  map: "a map",
  html: "a card",
  mermaid: "a diagram",
  messages: "",
  collapse: "",
  diff: "a diff",
  math: "a formula",
  progress: "",
  buttons: "",
  followups: "",
}

export function speakableText(raw: string): string {
  if (!raw) return ""
  let out = raw

  // 1) Replace known render fences with a short spoken placeholder ("Here's a chart.").
  out = out.replace(renderFenceRegex(), (_m, lang: RenderFenceLang) => {
    const p = SPOKEN_PLACEHOLDER[lang] ?? ""
    return p ? ` (${p}) ` : " "
  })

  // 2) Drop any remaining generic fenced code blocks (```lang\n…```), spoken as "a code block".
  out = out.replace(/```[^\n]*\n[\s\S]*?```/g, " (code block) ")

  // 3) Light de-markdown so we don't read syntax aloud:
  out = out
    .replace(/`([^`]+)`/g, "$1") // inline code ticks
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/^#{1,6}\s+/gm, "") // heading hashes
    .replace(/^\s*[-*]\s+/gm, "") // bullet markers
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → link text
    .replace(/^\s*>\s?/gm, "") // blockquote markers

  // 4) Collapse whitespace runs the strips created.
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return out
}
