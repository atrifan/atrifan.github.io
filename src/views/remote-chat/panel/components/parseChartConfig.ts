// Tolerant parser for ```chart``` fenced blocks.
//
// Chart.js configs legitimately contain JS function callbacks (tooltip
// footer/label, scriptable colors, tick formatters). Those are NOT valid JSON,
// so a strict JSON.parse rejects the whole block and the chart falls back to
// raw text. We deliberately do NOT eval those functions — the model's context
// includes untrusted scraped web content, so running model-authored functions
// in the panel is an injection risk.
//
// Instead we strip function-valued properties (replace with null — Chart.js
// treats a null callback as "use the default"), so the chart still renders and
// only the custom callback is lost. Returns the parsed config, or null if the
// body isn't recoverable as a chart config at all.
//
// Models also emit other near-JSON sloppiness we tolerate: // and /* */ comments,
// trailing commas, and callbacks given as a *string* ("label": "function(...){...}")
// rather than a bare function — all normalized before parsing.

// Replace `key: function(...) {...}` and `key: (...) => ...` values with `key: null`.
// Brace/paren-aware so it handles nested bodies and arrow functions without a JS parser.
function stripFunctionValues(src: string): string {
  let out = ""
  let i = 0
  const n = src.length

  while (i < n) {
    const ch = src[i]

    // Skip string literals verbatim (so we don't mistake `"function"` text for a fn).
    if (ch === '"' || ch === "'") {
      const quote = ch
      out += ch
      i++
      while (i < n) {
        out += src[i]
        if (src[i] === "\\") { out += src[i + 1] ?? ""; i += 2; continue }
        if (src[i] === quote) { i++; break }
        i++
      }
      continue
    }

    // Detect a function value starting here: either `function` keyword or an
    // arrow `(...) =>` / `x =>`. We only treat it as a value if the preceding
    // non-space char is `:` or `,` or `{` or `[` (i.e. it's in value position).
    const rest = src.slice(i)
    const fnKeyword = /^function\b/.test(rest)
    const arrow = /^(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(rest)

    if (fnKeyword || arrow) {
      const prev = out.replace(/\s+$/, "").slice(-1)
      if (prev === ":" || prev === "," || prev === "{" || prev === "[" || prev === "(") {
        i = skipFunctionExpression(src, i)
        out += "null"
        continue
      }
    }

    out += ch
    i++
  }

  return out
}

// Given an index at the start of a function expression, return the index just
// past the end of that expression (after its body `{...}` or arrow expression).
function skipFunctionExpression(src: string, start: number): number {
  let i = start
  const n = src.length

  // Advance to the first `{` (function body) or the arrow `=>`.
  // Track parens so an arrow's param list `( ... )` isn't mistaken for a body.
  let sawArrow = false
  while (i < n) {
    const ch = src[i]
    if (ch === "(") { i = matchDelimited(src, i, "(", ")"); continue }
    if (ch === "{") { return matchDelimited(src, i, "{", "}") }
    if (ch === "=" && src[i + 1] === ">") { sawArrow = true; i += 2; continue }
    if (sawArrow) {
      // Arrow with a non-block body: consume up to the value's end (top-level , } ]).
      return consumeExpression(src, i)
    }
    i++
  }
  return i
}

// Return index just past the matching close delimiter, respecting strings + nesting.
function matchDelimited(src: string, start: number, open: string, close: string): number {
  let depth = 0
  let i = start
  const n = src.length
  while (i < n) {
    const ch = src[i]
    if (ch === '"' || ch === "'") {
      const q = ch; i++
      while (i < n) { if (src[i] === "\\") { i += 2; continue } if (src[i] === q) { i++; break } i++ }
      continue
    }
    if (ch === open) depth++
    else if (ch === close) { depth--; if (depth === 0) return i + 1 }
    i++
  }
  return i
}

// Consume a bare expression (arrow body) until a top-level `,`, `}` or `]`.
function consumeExpression(src: string, start: number): number {
  let i = start
  const n = src.length
  while (i < n) {
    const ch = src[i]
    if (ch === '"' || ch === "'") {
      const q = ch; i++
      while (i < n) { if (src[i] === "\\") { i += 2; continue } if (src[i] === q) { i++; break } i++ }
      continue
    }
    if (ch === "(") { i = matchDelimited(src, i, "(", ")"); continue }
    if (ch === "[") { i = matchDelimited(src, i, "[", "]"); continue }
    if (ch === "{") { i = matchDelimited(src, i, "{", "}"); continue }
    if (ch === "," || ch === "}" || ch === "]") return i
    i++
  }
  return i
}

// Remove // line comments and /* */ block comments, respecting string literals
// so a "//" or "/*" inside a string value is left intact.
function stripComments(src: string): string {
  let out = ""
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]
    if (ch === '"' || ch === "'") {
      const q = ch; out += ch; i++
      while (i < n) {
        out += src[i]
        if (src[i] === "\\") { out += src[i + 1] ?? ""; i += 2; continue }
        if (src[i] === q) { i++; break }
        i++
      }
      continue
    }
    if (ch === "/" && src[i + 1] === "/") {
      i += 2
      while (i < n && src[i] !== "\n") i++
      continue
    }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++
      i += 2
      continue
    }
    out += ch
    i++
  }
  return out
}

// Remove trailing commas before } or ] (outside strings).
function stripTrailingCommas(src: string): string {
  let out = ""
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]
    if (ch === '"' || ch === "'") {
      const q = ch; out += ch; i++
      while (i < n) {
        out += src[i]
        if (src[i] === "\\") { out += src[i + 1] ?? ""; i += 2; continue }
        if (src[i] === q) { i++; break }
        i++
      }
      continue
    }
    if (ch === ",") {
      let j = i + 1
      while (j < n && /\s/.test(src[j])) j++
      if (src[j] === "}" || src[j] === "]") { i++; continue } // drop the comma
    }
    out += ch
    i++
  }
  return out
}

// After a successful JSON.parse, walk the object and null out any string value
// that is actually a serialized function ("function(...){...}" or "(x)=>..."),
// e.g. "label": "function(context){...}". Chart.js can't use a string callback,
// and we won't eval it. Mutates in place.
function nullStringFunctions(value: unknown): void {
  if (Array.isArray(value)) {
    for (const v of value) nullStringFunctions(v)
    return
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    for (const key of Object.keys(obj)) {
      const v = obj[key]
      if (typeof v === "string" && /^\s*(async\s+)?(function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.test(v)) {
        obj[key] = null
      } else {
        nullStringFunctions(v)
      }
    }
  }
}

/**
 * Parse a ```chart``` block body into a Chart.js config object.
 * Tries strict JSON first; on failure, normalizes common model sloppiness
 * (comments, trailing commas, bare function values) and retries. Finally nulls
 * out any string-encoded function callbacks. Returns null if still unparseable.
 */
export function parseChartConfig(body: string): unknown | null {
  const trimmed = body.trim()

  let parsed: unknown | null = null
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Strict parse failed — normalize and retry.
    try {
      const cleaned = stripTrailingCommas(stripFunctionValues(stripComments(trimmed)))
      parsed = JSON.parse(cleaned)
    } catch {
      return null
    }
  }

  if (parsed && typeof parsed === "object") nullStringFunctions(parsed)
  return parsed
}
