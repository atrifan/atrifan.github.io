import { useRef, useEffect, useState } from "react"

// Lazy import — mermaid is ~1MB, avoid blocking initial panel load
const mermaidPromise = import("mermaid").then((m) => {
  // securityLevel:"strict" (sanitize HTML, disable click handlers) — the diagram
  // is model-authored and the model's context includes untrusted scraped content.
  // Pinned explicitly so it can't silently change with a mermaid default update.
  return m.default
})

let mermaidCounter = 0

interface Props {
  diagram: string
}

export function MermaidBlock({ diagram }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${++mermaidCounter}`)

  useEffect(() => {
    let cancelled = false

    mermaidPromise
      .then(async (mermaid) => {
        if (cancelled) return
        try {
          // Follow the page theme (Tulzo sets data-theme on <html>); re-initialised per render
          // so a diagram drawn after a theme switch matches it.
          const dark = document.documentElement.dataset.theme === "dark"
          mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict" })
          const { svg: rendered } = await mermaid.render(idRef.current, diagram.trim())
          if (!cancelled) {
            setSvg(rendered)
            setError(null)
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Failed to render diagram")
            setSvg(null)
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(`Failed to load mermaid: ${e instanceof Error ? e.message : String(e)}`)
        }
      })

    return () => {
      cancelled = true
    }
  }, [diagram])

  if (error) {
    return (
      <div className="mermaid-block">
        <div className="mermaid-block-error">{error}</div>
        <pre className="mermaid-block-fallback">{diagram}</pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="mermaid-block">
        <div className="mermaid-block-loading">Rendering diagram...</div>
      </div>
    )
  }

  return (
    <div
      className="mermaid-block"
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
