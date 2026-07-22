import { useEffect, useState } from "react"
import "katex/dist/katex.min.css"

// Lazy import — KaTeX is large, avoid blocking initial panel load
const katexPromise = import("katex").then((m) => m.default)

interface Props {
  math: string
  displayMode?: boolean
}

export function KatexBlock({ math, displayMode = true }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    katexPromise
      .then((katex) => {
        if (cancelled) return
        try {
          const rendered = katex.renderToString(math.trim(), {
            displayMode,
            throwOnError: false,
            // trust:false (KaTeX default) — the math expression is model-authored
            // and the model's context includes untrusted scraped content. trust:true
            // would let \href/\html@mathml inject raw HTML into the panel (XSS).
            trust: false,
          })
          setHtml(rendered)
          setError(null)
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "Failed to render math")
            setHtml(null)
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(`Failed to load KaTeX: ${e instanceof Error ? e.message : String(e)}`)
        }
      })

    return () => { cancelled = true }
  }, [math, displayMode])

  if (error) {
    return (
      <div className="math-block">
        <code>{math}</code>
      </div>
    )
  }

  if (!html) {
    return (
      <div className="math-block">
        <span style={{ color: "#888", fontSize: 11, fontStyle: "italic" }}>Rendering math...</span>
      </div>
    )
  }

  return (
    <div
      className={displayMode ? "math-block" : "math-inline"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
