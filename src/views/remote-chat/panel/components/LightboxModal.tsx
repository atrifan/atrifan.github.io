import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { Chart, registerables } from "chart.js"
import { MapBlock } from "./MapBlock"

Chart.register(...registerables)

// --- Types ---

export type LightboxContent =
  | { type: "chart"; config: unknown }
  | { type: "mermaid"; svgHtml: string; source?: string }
  | { type: "table"; columns: string[]; rows: string[][]; title?: string }
  | { type: "map"; spec: unknown }

interface LightboxContextValue {
  open: (content: LightboxContent) => void
  close: () => void
}

// --- Context ---

const LightboxContext = createContext<LightboxContextValue>({
  open: () => {},
  close: () => {},
})

export function useLightbox() {
  return useContext(LightboxContext)
}

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<LightboxContent | null>(null)

  const open = useCallback((c: LightboxContent) => setContent(c), [])
  const close = useCallback(() => setContent(null), [])

  return (
    <LightboxContext.Provider value={{ open, close }}>
      {children}
      {content && <LightboxModal content={content} onClose={close} />}
    </LightboxContext.Provider>
  )
}

// --- PNG Export Utilities ---

function downloadDataUrl(dataUrl: string, filename: string) {
  const byteString = atob(dataUrl.split(",")[1])
  const mimeString = dataUrl.split(",")[0].split(":")[1].split(";")[0]
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
  const blob = new Blob([ab], { type: mimeString })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function svgToPngDataUrl(svgHtml: string): Promise<string> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgHtml, "image/svg+xml")
  const svgEl = doc.documentElement

  let width = parseInt(svgEl.getAttribute("width") || "0")
  let height = parseInt(svgEl.getAttribute("height") || "0")

  if (!width || !height) {
    const vb = svgEl.getAttribute("viewBox")
    if (vb) {
      const parts = vb.split(/[\s,]+/)
      width = parseInt(parts[2]) || 800
      height = parseInt(parts[3]) || 600
    } else {
      width = 800
      height = 600
    }
  }

  const svgBlob = new Blob([svgHtml], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(svgBlob)

  const canvas = document.createElement("canvas")
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext("2d")!
  ctx.scale(2, 2)

  const img = new Image()
  img.src = url
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
  })
  ctx.drawImage(img, 0, 0, width, height)
  URL.revokeObjectURL(url)

  return canvas.toDataURL("image/png")
}

async function tableToPngDataUrl(tableEl: HTMLElement): Promise<string> {
  const rect = tableEl.getBoundingClientRect()
  const width = Math.ceil(rect.width)
  const height = Math.ceil(rect.height)

  const clone = tableEl.cloneNode(true) as HTMLElement
  inlineStyles(tableEl, clone)

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" style="background:#ffffff">${clone.outerHTML}</div>
    </foreignObject>
  </svg>`

  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  const canvas = document.createElement("canvas")
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext("2d")!
  ctx.scale(2, 2)

  const img = new Image()
  img.src = url
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
  })
  ctx.drawImage(img, 0, 0, width, height)
  URL.revokeObjectURL(url)

  return canvas.toDataURL("image/png")
}

function inlineStyles(source: Element, target: Element) {
  const computed = window.getComputedStyle(source)
  const el = target as HTMLElement
  for (let i = 0; i < computed.length; i++) {
    const prop = computed[i]
    el.style.setProperty(prop, computed.getPropertyValue(prop))
  }
  const sourceChildren = source.children
  const targetChildren = target.children
  for (let i = 0; i < sourceChildren.length; i++) {
    if (targetChildren[i]) {
      inlineStyles(sourceChildren[i], targetChildren[i])
    }
  }
}

// --- Pan & Zoom Hook ---

function usePanZoom() {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const fitToView = useCallback(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) {
      setScale(1)
      setTranslate({ x: 0, y: 0 })
      return
    }

    // Temporarily reset transform to measure natural size
    content.style.transform = "none"
    const cRect = container.getBoundingClientRect()

    // Try to find an SVG and read its real dimensions
    const svg = content.querySelector("svg")
    let naturalW: number
    let naturalH: number

    if (svg) {
      const vb = svg.getAttribute("viewBox")
      if (vb) {
        const parts = vb.split(/[\s,]+/).map(Number)
        naturalW = parts[2] || svg.getBoundingClientRect().width
        naturalH = parts[3] || svg.getBoundingClientRect().height
      } else {
        const w = svg.getAttribute("width")
        const h = svg.getAttribute("height")
        naturalW = parseFloat(w || "0") || svg.getBoundingClientRect().width
        naturalH = parseFloat(h || "0") || svg.getBoundingClientRect().height
      }
    } else {
      // For non-SVG content (tables, charts)
      const child = content.firstElementChild as HTMLElement | null
      naturalW = child?.scrollWidth || 400
      naturalH = child?.scrollHeight || 300
    }

    const pad = 40
    const availW = cRect.width - pad
    const availH = cRect.height - pad

    const fitScale = Math.min(availW / naturalW, availH / naturalH)
    setScale(Math.max(0.2, Math.min(fitScale, 4)))
    setTranslate({ x: 0, y: 0 })

    // Restore (will be overridden by React re-render)
    content.style.transform = ""
  }, [])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setScale((s) => Math.min(5, Math.max(0.2, s + delta)))
  }, [])

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setTranslate((t) => ({ x: t.x + dx, y: t.y + dy }))
  }, [])

  const handleMouseUp = useCallback(() => {
    dragging.current = false
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener("wheel", handleWheel, { passive: false })
    el.addEventListener("mousedown", handleMouseDown)
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      el.removeEventListener("wheel", handleWheel)
      el.removeEventListener("mousedown", handleMouseDown)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp])

  // Start at scale 1 — SVG uses 100% width/height with viewBox so it fills naturally
  useEffect(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  const zoomIn = useCallback(() => setScale((s) => Math.min(5, s * 1.3)), [])
  const zoomOut = useCallback(() => setScale((s) => Math.max(0.2, s / 1.3)), [])

  return { containerRef, contentRef, scale, translate, zoomIn, zoomOut, fitToView }
}

// --- SVG Preparation ---

function prepareSvgForLightbox(svgHtml: string): string {
  // Extract viewBox or width/height to ensure we have one
  const vbMatch = svgHtml.match(/viewBox=["']([^"']+)["']/)
  const wMatch = svgHtml.match(/<svg[^>]*\swidth=["']([^"']+)["']/)
  const hMatch = svgHtml.match(/<svg[^>]*\sheight=["']([^"']+)["']/)

  let result = svgHtml

  // Add viewBox if missing
  if (!vbMatch && wMatch && hMatch) {
    const w = parseFloat(wMatch[1])
    const h = parseFloat(hMatch[1])
    result = result.replace(/<svg/, `<svg viewBox="0 0 ${w} ${h}"`)
  }

  // Replace width/height with 100%
  result = result.replace(/(<svg[^>]*)\swidth=["'][^"']*["']/, "$1")
  result = result.replace(/(<svg[^>]*)\sheight=["'][^"']*["']/, "$1")
  result = result.replace(/(<svg[^>]*)\sstyle=["'][^"']*["']/, "$1")
  result = result.replace(/<svg/, '<svg width="100%" height="100%" style="max-width:none;max-height:none"')

  return result
}

// --- Modal Component ---

interface ModalProps {
  content: LightboxContent
  onClose: () => void
}

function LightboxModal({ content, onClose }: ModalProps) {
  const [visible, setVisible] = useState(false)
  const chartCanvasRef = useRef<HTMLCanvasElement>(null)
  const chartInstanceRef = useRef<Chart | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const { containerRef, contentRef, scale, translate, zoomIn, zoomOut, fitToView } = usePanZoom()

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  // Chart.js instance for modal
  useEffect(() => {
    if (content.type !== "chart" || !chartCanvasRef.current) return

    const cfg = content.config as { type: string; data: object; options?: object }
    if (!cfg || !cfg.type || !cfg.data) return

    chartInstanceRef.current = new Chart(chartCanvasRef.current, {
      type: cfg.type as any,
      data: JSON.parse(JSON.stringify(cfg.data)),
      options: {
        responsive: true,
        maintainAspectRatio: true,
        animation: false,
        ...(cfg.options as any),
      },
    })

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy()
        chartInstanceRef.current = null
      }
    }
  }, [content])

  const handleDownload = async () => {
    try {
      if (content.type === "chart" && chartCanvasRef.current) {
        const dataUrl = chartCanvasRef.current.toDataURL("image/png")
        downloadDataUrl(dataUrl, "chart.png")
      } else if (content.type === "mermaid") {
        const dataUrl = await svgToPngDataUrl(content.svgHtml)
        downloadDataUrl(dataUrl, "diagram.png")
      } else if (content.type === "table" && tableRef.current) {
        const dataUrl = await tableToPngDataUrl(tableRef.current)
        downloadDataUrl(dataUrl, "table.png")
      }
    } catch (e) {
      console.error("PNG export failed:", e)
    }
  }

  const handleCopyMarkdown = () => {
    let md = ""
    if (content.type === "chart") {
      md = "```chart\n" + JSON.stringify(content.config, null, 2) + "\n```"
    } else if (content.type === "mermaid") {
      md = "```mermaid\n" + (content.source || content.svgHtml) + "\n```"
    } else if (content.type === "map") {
      md = "```map\n" + JSON.stringify(content.spec, null, 2) + "\n```"
    } else if (content.type === "table") {
      const header = "| " + content.columns.join(" | ") + " |"
      const sep = "| " + content.columns.map(() => "---").join(" | ") + " |"
      const rows = content.rows.map((r) => "| " + r.join(" | ") + " |").join("\n")
      md = (content.title ? `**${content.title}**\n\n` : "") + header + "\n" + sep + "\n" + rows
    }
    navigator.clipboard.writeText(md)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const transformStyle = {
    transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
    transformOrigin: "center center",
  }

  // Maps own their pan/zoom (Leaflet) — bypass the CSS-transform pan/zoom hook and
  // its toolbar buttons, and render the interactive map directly in the content area.
  const isMap = content.type === "map"

  return createPortal(
    <div className={`lightbox-backdrop ${visible ? "open" : ""}`} onClick={handleBackdropClick}>
      <div className="lightbox-container" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-toolbar">
          {!isMap && (
            <>
              <button className="lightbox-zoom-btn" onClick={zoomOut} title="Zoom out">
                -
              </button>
              <span className="lightbox-zoom-label">{Math.round(scale * 100)}%</span>
              <button className="lightbox-zoom-btn" onClick={zoomIn} title="Zoom in">
                +
              </button>
              <button className="lightbox-zoom-btn" onClick={fitToView} title="Fit to view">
                Fit
              </button>
            </>
          )}
          <div className="lightbox-toolbar-spacer" />
          <button className="lightbox-copy-btn" onClick={handleCopyMarkdown}>
            Copy Markdown
          </button>
          {!isMap && (
            <button className="lightbox-download-btn" onClick={handleDownload}>
              Download PNG
            </button>
          )}
          <button className="lightbox-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="lightbox-content" ref={containerRef}>
          {isMap ? (
            <div className="lightbox-map">
              <MapBlock spec={(content as { type: "map"; spec: unknown }).spec} interactive={true} />
            </div>
          ) : (
            <div className="lightbox-pannable" ref={contentRef} style={transformStyle}>
              {content.type === "chart" && (
                <div className="lightbox-chart">
                  <canvas ref={chartCanvasRef} />
                </div>
              )}
              {content.type === "mermaid" && (
                <div className="lightbox-mermaid" dangerouslySetInnerHTML={{ __html: prepareSvgForLightbox(content.svgHtml) }} />
              )}
              {content.type === "table" && (
                <div className="lightbox-table" ref={tableRef}>
                  {content.title && <div className="render-table-title">{content.title}</div>}
                  <table>
                    <thead>
                      <tr>
                        {content.columns.map((col, i) => (
                          <th key={i}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {content.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
