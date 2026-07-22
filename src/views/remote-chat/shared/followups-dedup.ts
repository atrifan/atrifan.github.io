// Followups de-duplication. The model sometimes emits a ```followups``` fence (clickable chips)
// AND repeats the same suggestions as a prose/numbered list in the answer text ("Would you like
// me to: 1. … 2. …"). The chips ARE the offer, so the prose list is redundant. This strips a
// trailing prose list (numbered or bulleted, optional lead-in like "Would you like me to:")
// whose items duplicate the chips — keeping everything else. Pure + tested; the bubble applies
// it to the text part that precedes a followups block.

// Normalize a line/chip for loose comparison: lowercase, drop leading list markers + trailing
// punctuation, collapse whitespace.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "") // leading "1." / "-" / "•"
    .replace(/[.?!:,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// Does a text LINE duplicate any chip? Loose: equal after normalize, or one contains the other
// (models paraphrase slightly — "scroll down to see more panels" vs the chip's longer form).
function lineMatchesChip(line: string, chipNorms: string[]): boolean {
  const l = norm(line)
  if (!l) return false
  return chipNorms.some((c) => c === l || (c.length > 8 && l.length > 8 && (c.includes(l) || l.includes(c))))
}

export function stripFollowupProse(text: string, chips: string[]): string {
  if (!chips.length || !text.trim()) return text
  const chipNorms = chips.map(norm).filter(Boolean)
  const lines = text.split("\n")

  // Walk from the END: a trailing run of blank / list-item / lead-in lines where the LIST ITEMS
  // duplicate chips is the redundant block. We remove from the first such duplicated list item
  // (plus an immediately-preceding lead-in like "Would you like me to:") to the end.
  const isListItem = (ln: string) => /^\s*(?:\d+[.)]|[-*•])\s+/.test(ln)
  const isLeadIn = (ln: string) =>
    /^\s*(would you like|shall i|do you want|want me to|i can also|next steps?|options?)\b/i.test(ln.trim()) && ln.trim().endsWith(":")

  // Find the contiguous trailing block of (blank | list-item | lead-in) lines.
  let start = lines.length
  let sawDupItem = false
  let sawNonDupItem = false
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i]
    if (ln.trim() === "") {
      start = i
      continue
    }
    if (isListItem(ln)) {
      if (lineMatchesChip(ln, chipNorms)) sawDupItem = true
      else sawNonDupItem = true
      start = i
      continue
    }
    if (isLeadIn(ln)) {
      start = i
      // lead-in is the top of the block; stop extending upward past it
      i-- // include it, then break
      // continue scanning only if the line above is also blank/part — but a lead-in is the anchor
      break
    }
    break
  }

  // Only strip if the trailing block actually duplicated the chips AND wasn't a genuine
  // different list (some items matched, none clearly "real/unrelated" dominate).
  if (!sawDupItem || sawNonDupItem) return text
  if (start >= lines.length) return text
  return lines.slice(0, start).join("\n").trimEnd()
}
