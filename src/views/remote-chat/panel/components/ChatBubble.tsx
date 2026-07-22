import { memo, useMemo, useState, useCallback, useRef, useEffect } from "react"
import ReactMarkdown, { defaultUrlTransform } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import { ChartBlock } from "./ChartBlock"
import { MermaidBlock } from "./MermaidBlock"
import { KatexBlock } from "./KatexBlock"
import { VariationsBlock } from "./VariationsBlock"
import { MessagesBlock } from "./MessagesBlock"
import { MapBlock } from "./MapBlock"
import { stripFollowupProse } from "../../shared/followups-dedup"
import { HtmlBlock } from "./HtmlBlock"
import { useLightbox } from "./LightboxModal"
import { parseChartConfig } from "./parseChartConfig"
import { renderFenceRegex } from "../../shared/render-fence-langs"
import { shouldNavigateActiveTab } from "../link-open"
import { RenderBlockInner } from "./RenderBlockView"

interface Props {
  role: "user" | "assistant" | "error"
  content: string
  thinking?: string
  streaming?: boolean
  error?: boolean
  interrupted?: boolean // user stopped the loop mid-turn → red "Agent Interrupted by User…" notice
  actions?: string[]
  steps?: string[]
  // Out-of-band render blocks (map/table/followups/…) emitted by skill code during
  // THIS turn (e.g. MAP_SEARCH/__renderMap). They render inside the bubble under the
  // answer text so they read as part of the answer, not a detached trailing entry.
  renderBlocks?: import("../../shared/types").RenderBlock[]
  onButtonClick?: (value: string) => void
  onRetry?: () => void
  // Reveal/open a generated file (e.g. the XLSX card's name + folder button). Must be
  // threaded to the in-bubble render blocks or those buttons do nothing.
  onOpenFile?: (path: string) => void
  onOpenFolder?: (path: string) => void
  // Open a chat link in the CURRENT tab (keeps the side-panel chat) instead of a new tab.
  onOpenLink?: (href: string) => void
  // Answer feedback (like/dislike) on a completed assistant answer. `feedback` is the current
  // persisted rating; onFeedback toggles it (passing null clears). Absent → no buttons shown.
  feedback?: "like" | "dislike" | null
  onFeedback?: (feedback: "like" | "dislike" | null) => void
  // Answer self-check state → a small footer chip on the bubble. "verifying" shows a live
  // "🛡 Verifying…" marker while the silent claim-check runs; "verified" shows a permanent
  // "✓ Verified" once it passes. "unverified" is handled by the host collapsing the answer to a
  // step (so it doesn't linger as a ✗ chip) — we still render a brief marker if it arrives.
  verifyState?: "verifying" | "verified" | "unverified"
}

type ContentPart =
  | { type: "text"; value: string }
  | { type: "chart"; config: unknown }
  | { type: "mermaid"; diagram: string }
  | { type: "collapse"; title: string; body: string }
  | { type: "diff"; lines: string }
  | { type: "math"; expression: string }
  | { type: "progress"; value: number; total: number; label: string }
  | { type: "buttons"; buttons: Array<{ text: string; value: string }> }
  | { type: "followups"; suggestions: string[] }
  | { type: "variations"; tabs: Array<{ label: string; content: string }> }
  | { type: "messages"; data: import("./MessagesBlock").MessagesData }
  | { type: "map"; spec: unknown }
  | { type: "html"; html: string }

function pushTextOrVariations(parts: ContentPart[], text: string, placeholders: Array<Array<{ label: string; content: string }>>): void {
  const placeholderRegex = /\x00VARIATIONS_(\d+)\x00/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = placeholderRegex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) })
    const idx = parseInt(m[1], 10)
    if (placeholders[idx]) parts.push({ type: "variations", tabs: placeholders[idx] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) })
}

/** Split content into text segments, chart configs, mermaid diagrams, and new block types */
function parseContentBlocks(text: string): ContentPart[] {
  // Pre-pass: extract ```variations blocks first (they contain nested fences in JSON strings)
  // Replace them with placeholders to avoid regex confusion
  const variationsPlaceholders: Array<{ label: string; content: string }[]> = []
  const processed = text.replace(/```variations\s*\n([\s\S]*?)\n```(?=\s|$)/g, (full, body) => {
    try {
      const tabs = JSON.parse(body.trim())
      if (Array.isArray(tabs) && tabs.length > 0 && tabs[0].label && tabs[0].content !== undefined) {
        variationsPlaceholders.push(tabs)
        return `\x00VARIATIONS_${variationsPlaceholders.length - 1}\x00`
      }
    } catch {
      /* fall through */
    }
    return full
  })

  const parts: ContentPart[] = []
  // Render-fence languages come from the shared list so this parser and VariationsBlock's
  // tab parser can't drift (they did — html/map were missing from tabs).
  const regex = renderFenceRegex()
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(processed)) !== null) {
    const [fullMatch, lang, titleAttr, body] = match
    // Text before this block
    if (match.index > lastIndex) {
      const before = processed.slice(lastIndex, match.index)
      pushTextOrVariations(parts, before, variationsPlaceholders)
    }

    if (lang === "chart") {
      const config = parseChartConfig(body)
      if (config) {
        parts.push({ type: "chart", config })
      } else {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "html") {
      const raw = body.trim()
      if (raw) {
        parts.push({ type: "html", html: raw })
      } else {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "mermaid") {
      const diagram = body.trim()
      if (diagram) {
        parts.push({ type: "mermaid", diagram })
      } else {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "collapse") {
      const title = titleAttr || "Details"
      parts.push({ type: "collapse", title, body: body.trim() })
    } else if (lang === "diff") {
      parts.push({ type: "diff", lines: body })
    } else if (lang === "math") {
      const expression = body.trim()
      if (expression) {
        parts.push({ type: "math", expression })
      } else {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "progress") {
      try {
        const config = JSON.parse(body.trim())
        parts.push({
          type: "progress",
          value: config.value ?? 0,
          total: config.total ?? 100,
          label: config.label ?? "",
        })
      } catch {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "messages") {
      try {
        const parsed = JSON.parse(body.trim())
        if (Array.isArray(parsed) && parsed.length > 0) {
          parts.push({ type: "messages", data: parsed })
        } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          parts.push({ type: "messages", data: parsed })
        } else {
          parts.push({ type: "text", value: fullMatch })
        }
      } catch {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "buttons") {
      try {
        const btns = JSON.parse(body.trim())
        if (Array.isArray(btns) && btns.length > 0) {
          parts.push({ type: "buttons", buttons: btns })
        } else {
          parts.push({ type: "text", value: fullMatch })
        }
      } catch {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "followups") {
      try {
        const raw = JSON.parse(body.trim())
        // Accept ["a","b"] or [{text}|{label}] — normalize to string[].
        const suggestions = Array.isArray(raw)
          ? raw.map((s) => (typeof s === "string" ? s : (s?.text ?? s?.label ?? ""))).filter((s: string) => s.trim())
          : []
        if (suggestions.length > 0) {
          parts.push({ type: "followups", suggestions })
        } else {
          parts.push({ type: "text", value: fullMatch })
        }
      } catch {
        parts.push({ type: "text", value: fullMatch })
      }
    } else if (lang === "map") {
      try {
        const spec = JSON.parse(body.trim())
        if (spec && typeof spec === "object") {
          parts.push({ type: "map", spec })
        } else {
          parts.push({ type: "text", value: fullMatch })
        }
      } catch {
        parts.push({ type: "text", value: fullMatch })
      }
    }

    lastIndex = match.index + fullMatch.length
  }

  // Remaining text after last block
  if (lastIndex < processed.length) {
    const remaining = processed.slice(lastIndex)
    pushTextOrVariations(parts, remaining, variationsPlaceholders)
  }

  // De-dupe: if there's a followups block (clickable chips), strip any text part that just
  // repeats those suggestions as a prose/numbered list — the chips already show them.
  const followup = parts.find((p) => p.type === "followups") as { type: "followups"; suggestions: string[] } | undefined
  if (followup) {
    for (const p of parts) {
      if (p.type === "text") p.value = stripFollowupProse(p.value, followup.suggestions)
    }
  }

  const nonEmpty = parts.filter((p) => p.type !== "text" || p.value.trim() !== "")
  return nonEmpty.length > 0 ? nonEmpty : [{ type: "text", value: text }]
}

/** Process inline math ($...$) within text parts — returns mixed text/math parts */
function processInlineMath(text: string): Array<{ type: "text" | "inlineMath"; value: string }> {
  const parts: Array<{ type: "text" | "inlineMath"; value: string }> = []
  // Match $...$ but not $$...$$ and not escaped \$
  const regex = /(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) })
    }
    parts.push({ type: "inlineMath", value: match[1] })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) })
  }

  return parts.length > 0 ? parts : [{ type: "text", value: text }]
}

/** Extract text content from React children (for code block copy) */
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children
  if (typeof children === "number") return String(children)
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join("")
  if (children && typeof children === "object" && "props" in children) {
    return extractTextFromChildren((children as React.ReactElement).props.children)
  }
  return ""
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])

  return (
    <button className={`copy-btn ${copied ? "copied" : ""} ${className ?? ""}`} onClick={handleCopy} title={copied ? "Copied!" : "Copy"}>
      {copied ? "✓" : "⎘"}
    </button>
  )
}

function DiffBlock({ lines }: { lines: string }) {
  return (
    <div className="diff-block">
      {lines.split("\n").map((line, i) => {
        let cls = "diff-line-neutral"
        if (line.startsWith("+")) cls = "diff-line-add"
        else if (line.startsWith("-")) cls = "diff-line-remove"
        return (
          <div key={i} className={cls}>
            {line}
          </div>
        )
      })}
    </div>
  )
}

function ProgressBlock({ value, total, label }: { value: number; total: number; label: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="progress-block">
      <div className="progress-bar-outer">
        <div className="progress-bar-inner" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-label">
        {label ? `${label} — ` : ""}
        {value}/{total} ({percent}%)
      </div>
    </div>
  )
}

function ButtonsBlock({
  buttons,
  onButtonClick,
}: {
  buttons: Array<{ text: string; value: string }>
  onButtonClick?: (value: string) => void
}) {
  return (
    <div className="buttons-block">
      {buttons.map((btn, i) => (
        <button key={i} className="inline-btn" onClick={() => onButtonClick?.(btn.value)}>
          {btn.text}
        </button>
      ))}
    </div>
  )
}

// Followup suggestion chips shown under an answer. Clicking one sends it as a normal
// user message (real conversation continuation, like prompt suggestions) — the user can
// also just type instead. A chip disables itself once clicked so it can't double-fire.
function FollowupsBlock({ suggestions, onButtonClick }: { suggestions: string[]; onButtonClick?: (value: string) => void }) {
  const [used, setUsed] = useState(false)
  return (
    <div className="followups-block" role="group" aria-label="Suggested follow-ups">
      {suggestions.map((s, i) => (
        <button
          key={i}
          type="button"
          className="followup-chip"
          disabled={used}
          onClick={() => {
            setUsed(true)
            onButtonClick?.(s)
          }}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

function CollapseBlock({ title, body }: { title: string; body: string }) {
  return (
    <details className="collapse-block">
      <summary>{title}</summary>
      <div className="content">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {body}
        </ReactMarkdown>
      </div>
    </details>
  )
}

// Parse + render raw text into rich blocks (charts, maps, followups, diffs, math, …)
// plus markdown. This is the SINGLE renderer used by BOTH the final-answer bubble and
// each step body, so a render fence (e.g. ```map) never silently degrades to a dead
// code fence just because the model emitted it inside an intermediate step.
function RichContent({
  text,
  onButtonClick,
  onOpenLink,
}: {
  text: string
  onButtonClick?: (value: string) => void
  onOpenLink?: (href: string) => void
}) {
  // Belt-and-suspenders: strip any stray <!--step--> boundary sentinel before rendering. The
  // stream parser normally consumes it as a step separator, but react-markdown renders an HTML
  // comment as LITERAL visible text (raw HTML is off), so a leaked sentinel would show as
  // "<!--step-->". Remove it (and the surrounding blank lines it carries) so it's never visible.
  const clean = useMemo(() => text.replace(/\n*<!--step-->\n*/g, "\n\n").trim(), [text])
  const parts = useMemo(() => parseContentBlocks(clean), [clean])
  const hasInlineMath = useMemo(() => /(?<!\$)\$(?!\$).+?(?<!\$)\$(?!\$)/.test(clean), [clean])
  return (
    <>
      {parts.map((part, i) =>
        part.type === "chart" ? (
          <ExpandableViz key={i} type="chart" config={part.config}>
            <ChartBlock config={part.config} />
          </ExpandableViz>
        ) : part.type === "mermaid" ? (
          <ExpandableViz key={i} type="mermaid" diagram={part.diagram}>
            <MermaidBlock diagram={part.diagram} />
          </ExpandableViz>
        ) : part.type === "collapse" ? (
          <CollapseBlock key={i} title={part.title} body={part.body} />
        ) : part.type === "diff" ? (
          <DiffBlock key={i} lines={part.lines} />
        ) : part.type === "math" ? (
          <KatexBlock key={i} math={part.expression} displayMode={true} />
        ) : part.type === "progress" ? (
          <ProgressBlock key={i} value={part.value} total={part.total} label={part.label} />
        ) : part.type === "buttons" ? (
          <ButtonsBlock key={i} buttons={part.buttons} onButtonClick={onButtonClick} />
        ) : part.type === "followups" ? (
          <FollowupsBlock key={i} suggestions={part.suggestions} onButtonClick={onButtonClick} />
        ) : part.type === "variations" ? (
          <VariationsBlock key={i} tabs={part.tabs} onButtonClick={onButtonClick} />
        ) : part.type === "messages" ? (
          <MessagesBlock key={i} data={part.data} />
        ) : part.type === "map" ? (
          <ExpandableViz key={i} type="map" spec={part.spec}>
            <MapBlock spec={part.spec} interactive={false} />
          </ExpandableViz>
        ) : part.type === "html" ? (
          <HtmlBlock key={i} html={part.html} onButtonClick={onButtonClick} />
        ) : (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            // react-markdown v10's default urlTransform strips `data:` URIs — but the twin
            // legitimately emits inline data-URI images (generated charts, encoded local
            // files via iconForDisplay/fileToDataUri). Allow image data URIs (+ the normal
            // http/https/mailto) so those render instead of silently vanishing; other
            // schemes still fall back to the safe default.
            urlTransform={(url) => (/^data:image\//i.test(url) ? url : defaultUrlTransform(url))}
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    // Plain click → navigate the CURRENT tab (side panel persists, chat kept);
                    // ⌘/ctrl/shift/middle-click fall through to the browser's new-tab default.
                    if (shouldNavigateActiveTab(e, href)) {
                      e.preventDefault()
                      onOpenLink?.(href!)
                    }
                  }}
                >
                  {children}
                </a>
              ),
              pre: ({ children, ...props }) => (
                <div className="code-block-wrapper">
                  <CopyButton text={extractTextFromChildren(children)} />
                  <pre {...props}>{children}</pre>
                </div>
              ),
              code: ({ className, children, ...props }) => {
                const isBlock = !!className
                if (isBlock) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  )
                }
                return (
                  <code className="inline-code" {...props}>
                    {children}
                  </code>
                )
              },
              p: ({ children, ...props }) => {
                if (!hasInlineMath) return <p {...props}>{children}</p>
                const processed = processChildrenForMath(children)
                return <p {...props}>{processed}</p>
              },
              // Async-decode + lazy-load images so a decoding image doesn't block/repaint the
              // whole bubble on each streaming chunk (a source of the growing-bubble flicker).
              // Sizing/containment is handled in CSS (.bubble img) which reserves space.
              img: ({ src, alt, ...props }) => <img src={src} alt={alt ?? ""} loading="lazy" decoding="async" {...props} />,
            }}
          >
            {part.value || ""}
          </ReactMarkdown>
        ),
      )}
    </>
  )
}

export const ChatBubble = memo(function ChatBubble({
  role,
  content,
  thinking,
  streaming,
  error,
  interrupted,
  actions,
  steps,
  renderBlocks,
  onButtonClick,
  onRetry,
  onOpenFile,
  onOpenFolder,
  onOpenLink,
  feedback,
  onFeedback,
  verifyState,
}: Props) {
  const wrapClass = `bubble-wrap ${role === "user" ? "user" : "assistant"}${error ? " failed" : ""}${interrupted ? " interrupted" : ""}`
  const bubbleClass = `bubble ${role}${error ? " error" : ""}${interrupted ? " interrupted" : ""}`
  const isUser = role === "user"
  const stepsBlockRef = useRef<HTMLDetailsElement>(null)
  const stepsBodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const details = stepsBlockRef.current
    if (!details) return
    const onToggle = () => {
      if (details.open && stepsBodyRef.current) {
        stepsBodyRef.current.scrollTop = stepsBodyRef.current.scrollHeight
        setTimeout(() => {
          stepsBodyRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
        }, 50)
      }
    }
    details.addEventListener("toggle", onToggle)
    return () => details.removeEventListener("toggle", onToggle)
  }, [])
  useEffect(() => {
    const el = stepsBodyRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  })

  return (
    <div className={wrapClass}>
      {thinking && (
        <details className="thinking-block" open={streaming && !content}>
          <summary className="thinking-summary">
            <span className="thinking-chevron">{"▸"}</span>
            <span className="thinking-icon">{"◆"}</span> thinking
          </summary>
          {/* Copy button is a SIBLING of <summary> (not inside it) — nesting a button in the
              interactive <summary> is an axe nested-interactive violation. Copies the raw
              reasoning text so it's paste-able. */}
          <div className="thinking-body-wrap">
            <CopyButton text={thinking} className="thinking-copy-btn" />
            <div className="thinking-body">
              {/* Render the reasoning as markdown (bold, lists, paragraphs, code) so it reads as
                  prose, not raw `**weather**`. Plain ReactMarkdown (no render-fence machinery) —
                  a ```map inside reasoning should stay a code block, not become an interactive map. */}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{thinking}</ReactMarkdown>
            </div>
          </div>
        </details>
      )}
      {steps && steps.length > 0 && (
        <details className="steps-block" ref={stepsBlockRef} open={streaming && !content}>
          <summary className="steps-summary">
            <span className="thinking-chevron">{"▸"}</span>
            {steps.length} step{steps.length > 1 ? "s" : ""}
          </summary>
          <div className="steps-body" ref={stepsBodyRef}>
            {steps.map((rawStep, i) => {
              // Normalize once — a non-string step (from a malformed stream) must not
              // throw (ReactMarkdown rejects non-string children; .split throws). Also strip any
              // stray <!--step--> boundary sentinel so it's never visible in the preview/copy
              // (RichContent strips it for the body; the summary/copy use the raw string).
              const step = String(rawStep ?? "")
                .replace(/\n*<!--step-->\n*/g, "\n\n")
                .trim()
              return (
                <details
                  key={i}
                  className="step-item-details"
                  onToggle={(e) => {
                    if ((e.target as HTMLDetailsElement).open) {
                      setTimeout(() => (e.target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "nearest" }), 50)
                    }
                  }}
                >
                  <summary className="step-item-summary">
                    <span className="step-num">{i + 1}</span>
                    <span className="step-preview">{step.split("\n")[0].slice(0, 80)}</span>
                  </summary>
                  {/* Copy button is a SIBLING of <summary>, not a child — nesting an
                      interactive control inside the interactive <summary> is an axe
                      nested-interactive violation. */}
                  <CopyButton text={step} className="step-copy-btn" />
                  <div className="step-item-body">
                    {/* Steps render the same rich blocks as the final answer, so a
                        render fence (```map/```chart/```followups) in a step is
                        interactive, not a dead code fence. */}
                    <RichContent text={step} onButtonClick={onButtonClick} onOpenLink={onOpenLink} />
                  </div>
                </details>
              )
            })}
          </div>
        </details>
      )}
      <div className={bubbleClass}>
        {isUser ? (
          // User bubbles: plain text
          <>
            {content}
            {streaming && <span className="cursor" />}
          </>
        ) : (
          // Assistant bubbles: markdown with inline charts and rich blocks (same
          // renderer as steps — see RichContent).
          <>
            {content ? <RichContent text={content} onButtonClick={onButtonClick} onOpenLink={onOpenLink} /> : null}
            {streaming && <span className="cursor" />}
            {/* Render blocks emitted by skill code during this turn (MAP_SEARCH etc.)
                render here — inside the bubble, under the answer text — so they read as
                part of the answer, not a detached entry after the whole turn. Deferred
                until streaming completes: a map that mounts mid-stream lays out at the
                bubble's cramped early width (tiny, flashing beside the cursor); waiting
                for the final width mounts it once at full size. */}
            {!streaming &&
              renderBlocks?.map((block, i) => (
                <RenderBlockInner key={i} block={block} onButtonClick={onButtonClick} onOpenFile={onOpenFile} onOpenFolder={onOpenFolder} />
              ))}
          </>
        )}
      </div>
      {/* Answer self-check chip — a discreet footer marker on the bubble (NOT a purple thinking
          block: verification runs silently, only its verdict surfaces here). "🛡 Verifying…"
          while the check runs, permanent "✓ Verified" once it passes. The "unverified" verdict
          normally never lingers (the host collapses that answer to a step and continues the loop),
          so we render it only as a brief "✗" marker if it does arrive. Hidden for user bubbles. */}
      {!isUser && verifyState && (
        <div className={`bubble-verify verify-${verifyState}`} role="status" aria-live="polite">
          {verifyState === "verifying" ? (
            <span className="bubble-verify-badge">
              <span className="verify-spinner" aria-hidden="true">
                🛡
              </span>{" "}
              Verifying…
            </span>
          ) : verifyState === "verified" ? (
            <span className="bubble-verify-badge" title="This answer was self-checked against the actions taken.">
              ✓ Verified
            </span>
          ) : (
            <span className="bubble-verify-badge" title="This answer could not be verified — correcting.">
              ✗ Unverified
            </span>
          )}
        </div>
      )}
      {/* Actions executed — placed directly under the verify chip (and ABOVE the like/dislike
          feedback) so the "what did it do" trail sits next to the "was it verified" chip, and the
          rating buttons stay at the very bottom of the bubble. */}
      {actions && actions.length > 0 && (
        <details className="actions-block">
          <summary className="actions-summary">
            {actions.length} action{actions.length > 1 ? "s" : ""} executed
          </summary>
          <div className="actions-body">
            {actions.map((raw, i) => {
              // Coerce — a malformed action entry (non-string) must not throw on
              // .includes/.slice and blank the whole panel.
              const a = String(raw ?? "")
              const failed = a.includes('ok":false') || a.includes("→ ✗") || a.includes("not found")
              const title = a.slice(0, 70) + (a.length > 70 ? "…" : "")
              return (
                <details key={i} className={`action-item${failed ? " action-failed" : ""}`}>
                  <summary>
                    <span className="action-num">{i + 1}</span>
                    <span className="action-title">{title}</span>
                  </summary>
                  <div className="action-full">{a}</div>
                </details>
              )
            })}
          </div>
        </details>
      )}
      {/* Failed-turn flag + retry affordance */}
      {error && (
        <div className="bubble-error-flag">
          <span className="bubble-error-badge">⚠ Failed</span>
          {onRetry && (
            <button type="button" className="bubble-retry-btn" onClick={onRetry}>
              ↻ Try again
            </button>
          )}
        </div>
      )}
      {/* User-interrupted flag — shown regardless of whatever partial content is in the bubble. */}
      {interrupted && !error && (
        <div className="bubble-interrupted-flag">
          <span className="bubble-interrupted-badge">■ Agent Interrupted by User…</span>
        </div>
      )}
      {/* Message copy button */}
      {content && !streaming && <CopyButton text={content} className="message-copy-btn" />}
      {/* Answer feedback — discrete like/dislike on a completed assistant answer. Clicking the
          active rating again clears it (toggle). Persisted by the panel to the DB for later
          grading (see dbSetAnswerFeedback). Hidden while streaming / on error / for user bubbles. */}
      {!isUser && !error && !streaming && content && onFeedback && (
        <div className="bubble-feedback" role="group" aria-label="Rate this answer">
          <button
            type="button"
            className={`bubble-feedback-btn like${feedback === "like" ? " active" : ""}`}
            aria-pressed={feedback === "like"}
            aria-label={feedback === "like" ? "Remove like" : "Like this answer"}
            title="Good answer"
            onClick={() => onFeedback(feedback === "like" ? null : "like")}
          >
            👍
          </button>
          <button
            type="button"
            className={`bubble-feedback-btn dislike${feedback === "dislike" ? " active" : ""}`}
            aria-pressed={feedback === "dislike"}
            aria-label={feedback === "dislike" ? "Remove dislike" : "Dislike this answer"}
            title="Bad answer"
            onClick={() => onFeedback(feedback === "dislike" ? null : "dislike")}
          >
            👎
          </button>
        </div>
      )}
    </div>
  )
})

function ExpandableViz({
  children,
  type,
  config,
  diagram,
  spec,
}: {
  children: React.ReactNode
  type: "chart" | "mermaid" | "map"
  config?: unknown
  diagram?: string
  spec?: unknown
}) {
  const { open } = useLightbox()
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClick = () => {
    if (type === "chart" && config) {
      open({ type: "chart", config })
    } else if (type === "mermaid" && containerRef.current) {
      const svgHtml = containerRef.current.querySelector(".mermaid-block")?.innerHTML || ""
      if (svgHtml) open({ type: "mermaid", svgHtml, source: diagram })
    } else if (type === "map" && spec) {
      open({ type: "map", spec })
    }
  }

  return (
    <div className="expandable-viz" ref={containerRef} onClick={handleClick}>
      {children}
    </div>
  )
}

/** Recursively process React children to replace inline $...$ with KaTeX */
function processChildrenForMath(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") {
    const parts = processInlineMath(children)
    if (parts.length === 1 && parts[0].type === "text") return children
    return parts.map((p, i) =>
      p.type === "inlineMath" ? <KatexBlock key={i} math={p.value} displayMode={false} /> : <span key={i}>{p.value}</span>,
    )
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        const parts = processInlineMath(child)
        if (parts.length === 1 && parts[0].type === "text") return child
        return parts.map((p, j) =>
          p.type === "inlineMath" ? (
            <KatexBlock key={`${i}-${j}`} math={p.value} displayMode={false} />
          ) : (
            <span key={`${i}-${j}`}>{p.value}</span>
          ),
        )
      }
      return child
    })
  }
  return children
}
