import { useRef, useMemo, useEffect } from "react"
import { sanitizeRenderHtml } from "../html-sanitize"

// Renders a skill/model-authored ```html card in a SHADOW DOM: the scoped <style> ships
// with the HTML and is isolated (no bleed either way). Content is sanitized first (no
// script/handlers/iframes). Interactive elements delegate via data-prompt (send as chat
// message) or data-action + data-args (dispatch an action into the loop) — the markup
// never executes; the panel wires the clicks. Host is width-constrained to the panel.
//
// Extracted from ChatBubble so VariationsBlock (split-view tabs) can render html fences too
// without a circular import — an html card inside a tab used to show as raw code.
export function HtmlBlock({ html, onButtonClick }: { html: string; onButtonClick?: (value: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const clean = useMemo(() => sanitizeRenderHtml(html), [html])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" })
    root.innerHTML =
      // :host is width-constrained; content must WRAP/SCROLL, never widen the panel. `all:initial`
      // on :host resets inherited constraints, so we re-impose containment inside the shadow:
      // clamp the host, break long tokens/URLs, scroll wide tables/pre, cap media. Without this a
      // model-authored ```html card with a wide table / fixed-width div overflowed the side panel.
      `<style>:host{all:initial;display:block;max-width:100%;overflow-x:hidden}*{box-sizing:border-box;min-width:0}` +
      `.__wrap{width:100%;max-width:100%;overflow-x:hidden;font-family:system-ui,-apple-system,sans-serif;` +
      `overflow-wrap:anywhere;word-break:break-word}` +
      `.__wrap img,.__wrap video,.__wrap svg{max-width:100%;height:auto}` +
      `.__wrap table,.__wrap pre{display:block;max-width:100%;overflow-x:auto}` +
      `[data-prompt],[data-action]{cursor:pointer;user-select:none}` +
      `[data-prompt]:hover,[data-action]:hover{filter:brightness(1.12)}` +
      `[data-prompt]:active,[data-action]:active{filter:brightness(0.95)}</style>` +
      `<div class="__wrap">${clean}</div>`

    const onClick = (e: Event) => {
      const path = e.composedPath()
      for (const el of path) {
        if (!(el instanceof HTMLElement)) continue
        const prompt = el.getAttribute("data-prompt")
        const action = el.getAttribute("data-action")
        if (prompt) {
          onButtonClick?.(prompt)
          return
        }
        if (action) {
          const args = el.getAttribute("data-args") || ""
          onButtonClick?.(args ? `${action} ${args}` : action)
          return
        }
      }
    }
    root.addEventListener("click", onClick)
    return () => root.removeEventListener("click", onClick)
  }, [clean, onButtonClick])

  return <div ref={hostRef} className="html-render-host" style={{ width: "100%", maxWidth: "100%" }} data-testid="html-render-host" />
}
