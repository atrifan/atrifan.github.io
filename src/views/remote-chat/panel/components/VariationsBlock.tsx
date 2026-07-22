import { useState, useMemo, useCallback, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { ChartBlock } from "./ChartBlock"
import { MermaidBlock } from "./MermaidBlock"
import { KatexBlock } from "./KatexBlock"
import { MessagesBlock } from "./MessagesBlock"
import { HtmlBlock } from "./HtmlBlock"
import { MapBlock } from "./MapBlock"
import { useLightbox } from "./LightboxModal"
import { parseChartConfig } from "./parseChartConfig"
import { renderFenceRegex } from "../../shared/render-fence-langs"

interface Tab {
  label: string
  content: string
}

interface Props {
  tabs: Tab[]
  onButtonClick?: (value: string) => void
}

type TabContentPart =
  | { type: "text"; value: string }
  | { type: "chart"; config: unknown }
  | { type: "mermaid"; diagram: string }
  | { type: "math"; expression: string }
  | { type: "collapse"; title: string; body: string }
  | { type: "diff"; lines: string }
  | { type: "progress"; value: number; total: number; label: string }
  | { type: "buttons"; buttons: Array<{ text: string; value: string }> }
  | { type: "messages"; data: import("./MessagesBlock").MessagesData }
  | { type: "html"; html: string }
  | { type: "map"; spec: unknown }

function parseTabContent(text: string): TabContentPart[] {
  const parts: TabContentPart[] = []
  // Shared render-fence list so tab content renders the SAME blocks as the main bubble
  // (html/map were missing here → an html card inside a tab rendered as raw code).
  const regex = renderFenceRegex()
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const [fullMatch, lang, titleAttr, body] = match
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) })
    }
    if (lang === "chart") {
      const config = parseChartConfig(body)
      if (config) {
        parts.push({ type: "chart", config })
      } else {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "mermaid") {
      const diagram = body.trim()
      if (diagram) parts.push({ type: "mermaid", diagram })
      else parts.push({ type: "text", value: fullMatch })
    } else if (lang === "math") {
      const expression = body.trim()
      if (expression) parts.push({ type: "math", expression })
      else parts.push({ type: "text", value: fullMatch })
    } else if (lang === "collapse") {
      parts.push({ type: "collapse", title: titleAttr || "Details", body: body.trim() })
    } else if (lang === "diff") {
      parts.push({ type: "diff", lines: body })
    } else if (lang === "progress") {
      try {
        const config = JSON.parse(body.trim())
        parts.push({ type: "progress", value: config.value ?? 0, total: config.total ?? 100, label: config.label ?? "" })
      } catch {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "messages") {
      try {
        const parsed = JSON.parse(body.trim())
        if (Array.isArray(parsed) && parsed.length > 0) parts.push({ type: "messages", data: parsed })
        else if (parsed && typeof parsed === "object" && Array.isArray(parsed.messages) && parsed.messages.length > 0)
          parts.push({ type: "messages", data: parsed })
        else parts.push({ type: "text", value: fullMatch })
      } catch {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "buttons") {
      try {
        const btns = JSON.parse(body.trim())
        if (Array.isArray(btns) && btns.length > 0) parts.push({ type: "buttons", buttons: btns })
        else parts.push({ type: "text", value: fullMatch })
      } catch {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "html") {
      const html = body.trim()
      if (html) parts.push({ type: "html", html })
      else parts.push({ type: "text", value: fullMatch })
    } else if (lang === "map") {
      try {
        const spec = JSON.parse(body.trim())
        parts.push({ type: "map", spec })
      } catch {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "followups") {
      // Followups aren't meaningful inside a variations tab — render as text rather than drop.
      parts.push({ type: "text", value: fullMatch })
    }
    lastIndex = match.index + fullMatch.length
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) })
  }
  return parts.length > 0 ? parts : [{ type: "text", value: text }]
}

export function VariationsBlock({ tabs, onButtonClick }: Props) {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const { open } = useLightbox()

  const tabParts = useMemo(() => tabs.map((t) => parseTabContent(t.content)), [tabs])

  const copyContent = useCallback(() => {
    navigator.clipboard.writeText(tabs[active]?.content ?? "").then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [active, tabs])

  if (tabs.length === 0) return null

  const parts = tabParts[active] ?? []

  return (
    <div className="variations-block">
      <div className="variations-tabs">
        {tabs.map((t, i) => (
          <button
            key={i}
            className={`variations-tab${i === active ? " active" : ""}`}
            onClick={() => {
              setActive(i)
              setCopied(false)
            }}
          >
            {t.label}
          </button>
        ))}
        <button className="variations-copy" onClick={copyContent} title="Copy tab content">
          {copied ? "✓" : "⎘"}
        </button>
      </div>
      <div className="variations-content">
        {parts.map((part, i) => {
          const key = `${active}-${i}`
          if (part.type === "chart")
            return (
              <div key={key} className="expandable-viz" onClick={() => open({ type: "chart", config: part.config })}>
                <ChartBlock config={part.config} />
              </div>
            )
          if (part.type === "mermaid") return <ExpandableMermaid key={key} diagram={part.diagram} open={open} />
          if (part.type === "math") return <KatexBlock key={key} math={part.expression} displayMode={true} />
          if (part.type === "collapse")
            return (
              <details key={key} className="collapse-block">
                <summary>{part.title}</summary>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {part.body}
                </ReactMarkdown>
              </details>
            )
          if (part.type === "diff")
            return (
              <div key={key} className="diff-block">
                {part.lines.split("\n").map((line, j) => (
                  <div key={j} className={line.startsWith("+") ? "diff-line-add" : line.startsWith("-") ? "diff-line-remove" : ""}>
                    {line}
                  </div>
                ))}
              </div>
            )
          if (part.type === "progress")
            return (
              <div key={key} className="progress-block">
                <div className="progress-bar-outer">
                  <div className="progress-bar-inner" style={{ width: `${Math.min(100, (part.value / part.total) * 100)}%` }} />
                </div>
                <span>
                  {part.label} ({part.value}/{part.total})
                </span>
              </div>
            )
          if (part.type === "buttons")
            return (
              <div key={key} className="buttons-block">
                {part.buttons.map((btn, j) => (
                  <button key={j} className="inline-btn" onClick={() => onButtonClick?.(btn.value)}>
                    {btn.text}
                  </button>
                ))}
              </div>
            )
          if (part.type === "messages") return <MessagesBlock key={key} data={part.data} />
          if (part.type === "html") return <HtmlBlock key={key} html={part.html} onButtonClick={onButtonClick} />
          if (part.type === "map")
            return (
              <div key={key} className="expandable-viz" onClick={() => open({ type: "map", spec: part.spec })}>
                <MapBlock spec={part.spec} interactive={false} />
              </div>
            )
          return (
            <ReactMarkdown
              key={key}
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {part.value}
            </ReactMarkdown>
          )
        })}
      </div>
    </div>
  )
}

function ExpandableMermaid({ diagram, open }: { diagram: string; open: (content: any) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      className="expandable-viz"
      ref={ref}
      onClick={() => {
        const svgHtml = ref.current?.querySelector(".mermaid-block")?.innerHTML || ""
        if (svgHtml) open({ type: "mermaid", svgHtml, source: diagram })
      }}
    >
      <MermaidBlock diagram={diagram} />
    </div>
  )
}
