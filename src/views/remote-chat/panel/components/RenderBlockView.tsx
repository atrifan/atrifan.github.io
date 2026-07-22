import type React from "react"
import type { RenderBlock } from "../../shared/types"
import { ProposalTable } from "./ProposalTable"
import { PlanSteps } from "./PlanSteps"
import { VariationsBlock } from "./VariationsBlock"
import { MapBlock } from "./MapBlock"
import { useLightbox } from "./LightboxModal"

const FILE_ICONS: Record<string, string> = {
  xlsx: "\u{1F4CA}",
  xls: "\u{1F4CA}",
  pdf: "\u{1F4C4}",
  docx: "\u{1F4DD}",
  doc: "\u{1F4DD}",
  csv: "\u{1F4CB}",
  xml: "\u{1F4E6}",
  json: "\u{2699}\u{FE0F}",
  txt: "\u{1F4C3}",
  html: "\u{1F310}",
}

interface Props {
  block: RenderBlock
  onProposalsRespond?: (approved: string[], rejected: string[]) => void
  onOpenFile?: (path: string) => void
  onOpenFolder?: (path: string) => void
  onButtonClick?: (value: string) => void
}

export function RenderBlockView(props: Props) {
  const inner = <RenderBlockInner {...props} />
  const { open } = useLightbox()
  // If this kind renders nothing, don't emit an empty wrapper.
  if (renderBlockInner(props, open) === null) return null
  // Wrap in an assistant bubble wrapper so out-of-band render blocks (map, followups,
  // table, …) sit in the conversation flow aligned left like an assistant turn — not
  // floating full-width outside any bubble.
  return <div className="bubble-wrap assistant render-block-wrap">{inner}</div>
}

// The block content WITHOUT the bubble wrapper — reused by ChatBubble to render a
// render block attached to an assistant turn (in-bubble, under the answer text).
export function RenderBlockInner(props: Props) {
  const { open } = useLightbox()
  return <>{renderBlockInner(props, open)}</>
}

function renderBlockInner(
  { block, onProposalsRespond, onOpenFile, onOpenFolder, onButtonClick }: Props,
  open: ReturnType<typeof useLightbox>["open"],
): React.ReactNode {
  switch (block.kind) {
    case "proposals":
      return <ProposalTable title={block.title} items={block.items} onRespond={onProposalsRespond ?? (() => {})} />

    case "plan":
      return <PlanSteps title={block.title} steps={block.steps} />

    case "table":
      return (
        <div
          className="render-table expandable-viz"
          onClick={() => open({ type: "table", columns: block.columns, rows: block.rows, title: block.title })}
        >
          {block.title && <div className="render-table-title">{block.title}</div>}
          <table>
            <thead>
              <tr>
                {block.columns.map((col, i) => (
                  <th key={i}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    case "downloads":
      return (
        <div className="render-downloads">
          {block.title && <div className="render-downloads-title">{block.title}</div>}
          {block.files.map((f, i) => (
            <div key={i} className="render-download-item">
              <span className="render-download-type">{f.type}</span>
              <span className="render-download-name">{f.name}</span>
              <button
                className="render-download-copy"
                onClick={() => onOpenFile?.(f.path) ?? navigator.clipboard.writeText(f.path)}
                title={f.path}
              >
                Open
              </button>
              <button className="render-download-folder" onClick={() => onOpenFolder?.(f.path)} title="Show in Finder">
                &#x1F4C2;
              </button>
            </div>
          ))}
        </div>
      )

    case "generated-file":
      return (
        <div className="render-generated-file">
          <span className="render-gf-icon">{FILE_ICONS[block.file.type] || "\u{1F4C4}"}</span>
          <span className="render-gf-type">{block.file.type}</span>
          <span className="render-gf-name" onClick={() => onOpenFile?.(block.file.path)} title={block.file.path}>
            {block.file.name}
          </span>
          <button className="render-gf-folder" onClick={() => onOpenFolder?.(block.file.path)} title="Show in Finder">
            &#x1F4C2;
          </button>
        </div>
      )

    case "info":
      return (
        <div className="render-info">
          {block.title && <strong>{block.title}</strong>}
          <p>{block.body}</p>
        </div>
      )

    case "chart":
      return (
        <div className="render-chart-placeholder">
          <span>
            {block.title ?? "Chart"} ({block.chartType})
          </span>
          <pre>{JSON.stringify(block.data, null, 2).slice(0, 200)}</pre>
        </div>
      )

    case "variations":
      return <VariationsBlock tabs={block.tabs} />

    case "followups":
      return (
        <div className="followups-block" role="group" aria-label="Suggested follow-ups">
          {block.suggestions.map((s, i) => (
            <button key={i} type="button" className="followup-chip" onClick={() => onButtonClick?.(s)}>
              {s}
            </button>
          ))}
        </div>
      )

    case "map":
      return (
        <div className="expandable-viz" onClick={() => open({ type: "map", spec: block })}>
          <MapBlock spec={block} interactive={false} />
        </div>
      )

    default:
      return null
  }
}
