// De-duplicate consecutive near-identical STEP lines. Weak/verbose models re-narrate the
// same intent each iteration — e.g. "I'll retrieve your 3 recent Outlook emails." then
// "I'll fetch your 3 recent Outlook emails now." — producing 2+ steps that say the same
// thing. We drop a step when it's a near-duplicate of the immediately-preceding one, so the
// steps view stays meaningful. Pure + tested.

// Normalize a step to its semantic core: lowercase, strip punctuation, and remove common
// filler / re-narration tokens ("now", "first", "then", "next", "i'll", "let me", "going
// to", "actually") + collapse whitespace. Two steps that only differ by filler/verb synonyms
// collapse to a very similar normalized form.
const FILLER = new Set([
  "now",
  "first",
  "then",
  "next",
  "actually",
  "ok",
  "okay",
  "so",
  "let",
  "me",
  "i",
  "ill",
  "i'll",
  "im",
  "i'm",
  "going",
  "to",
  "will",
  "gonna",
  "just",
  "the",
  "a",
  "your",
  "you",
  "for",
])
// Verb synonyms that mean the same action — map to a canonical token so "retrieve"/"fetch"/
// "get"/"check"/"look up" don't defeat the dup detection.
const VERB_SYNONYMS: Record<string, string> = {
  fetch: "get",
  retrieve: "get",
  grab: "get",
  pull: "get",
  load: "get",
  read: "get",
  check: "get",
  lookup: "get",
  find: "get",
  show: "get",
  list: "get",
  display: "get",
}

function normalizeStep(s: string): string {
  const tokens = (s || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/'/g, ""))
    .filter((t) => t && !FILLER.has(t))
    .map((t) => VERB_SYNONYMS[t] ?? t)
  return tokens.join(" ")
}

// Containment overlap: intersection / size-of-SMALLER set (0..1). Re-narration typically
// just ADDS detail ("...using the Outlook Mail skill", "...for rain"), so the shorter step's
// tokens are a near-subset of the longer — containment catches that where Jaccard (which the
// added words dilute) would miss it.
function containment(a: string, b: string): number {
  const sa = new Set(a.split(" ").filter(Boolean))
  const sb = new Set(b.split(" ").filter(Boolean))
  if (sa.size === 0 && sb.size === 0) return 1
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  return inter / Math.min(sa.size, sb.size)
}

// Is `candidate` a near-duplicate of `previous`? (normalized-equal, or ≥ threshold of the
// smaller step's tokens are shared — i.e. one is essentially a re-narration of the other).
// Guard against trivial collapses: require the smaller normalized step to have ≥3 tokens
// before containment alone triggers, so two short-but-different steps aren't merged.
export function isNearDuplicateStep(candidate: string, previous: string | undefined, threshold = 0.8): boolean {
  if (!previous) return false
  const na = normalizeStep(candidate)
  const nb = normalizeStep(previous)
  if (!na && !nb) return true
  if (na === nb) return true
  const minTokens = Math.min(na.split(" ").filter(Boolean).length, nb.split(" ").filter(Boolean).length)
  if (minTokens < 3) return false
  return containment(na, nb) >= threshold
}

// Push a step onto the list unless it near-duplicates the LAST one. Returns whether it was
// added (false = suppressed as a dup).
export function pushStepDedup(steps: string[], step: string): boolean {
  const s = step.trim()
  if (!s) return false
  if (isNearDuplicateStep(s, steps[steps.length - 1])) return false
  steps.push(s)
  return true
}
