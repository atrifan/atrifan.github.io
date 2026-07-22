// Sanitizer for the ```html render fence. Skill/model-authored HTML (with a scoped
// <style>) is rendered inside a shadow DOM for style isolation — but the markup is
// untrusted, so it must be stripped of anything executable BEFORE it reaches the DOM.
//
// REMOVE: <script>, <iframe>/<object>/<embed>, inline event handlers (on*=), and
// javascript: URLs. KEEP: structural HTML, <style> (shadow DOM scopes it), safe attrs
// (class/style/src/alt/title/href), data: image URIs, https links, and the interactive
// hooks data-prompt / data-action / data-args (the panel wires clicks — the markup never
// runs). Pure string→string so it's unit-testable without a DOM.

const DANGEROUS_TAGS = ["script", "iframe", "object", "embed", "link", "meta", "base"]

export function sanitizeRenderHtml(input: string): string {
  let html = input

  // 1. Remove dangerous elements (with or without a closing tag).
  for (const tag of DANGEROUS_TAGS) {
    // paired: <tag ...>…</tag>
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, "gi"), "")
    // self-closing / unclosed: <tag ...> or <tag/>
    html = html.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), "")
    // stray close
    html = html.replace(new RegExp(`</${tag}\\s*>`, "gi"), "")
  }

  // 2. Strip inline event-handler attributes: on*="…" / on*='…' / on*=bare.
  html = html.replace(/\son[a-z]+\s*=\s*"(?:[^"]*)"/gi, "")
  html = html.replace(/\son[a-z]+\s*=\s*'(?:[^']*)'/gi, "")
  html = html.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")

  // 3. Neutralize javascript:/vbscript:/data:text URLs in href/src (keep data:image).
  html = html.replace(/\s(href|src)\s*=\s*"(\s*(?:javascript|vbscript|data:text)[^"]*)"/gi, ' $1="#"')
  html = html.replace(/\s(href|src)\s*=\s*'(\s*(?:javascript|vbscript|data:text)[^']*)'/gi, " $1='#'")

  return html
}
