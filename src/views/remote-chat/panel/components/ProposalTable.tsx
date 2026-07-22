import { useState } from "react"
import type { ProposalItem } from "../../shared/types"

interface Props {
  title?: string
  items: ProposalItem[]
  onRespond: (approved: string[], rejected: string[]) => void
  onDismiss?: () => void
}

export function ProposalTable({ title, items: initial, onRespond, onDismiss }: Props) {
  const [items, setItems] = useState<ProposalItem[]>(initial)
  const [submitted, setSubmitted] = useState(false)

  function toggle(id: string, approved: boolean) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, approved } : it)))
  }

  function approveAll() {
    setItems((prev) => prev.map((it) => ({ ...it, approved: true })))
  }

  function rejectAll() {
    setItems((prev) => prev.map((it) => ({ ...it, approved: false })))
  }

  function submit() {
    const approved = items.filter((it) => it.approved === true).map((it) => it.id)
    const rejected = items.filter((it) => it.approved === false).map((it) => it.id)
    setSubmitted(true)
    onRespond(approved, rejected)
  }

  const pending = items.filter((it) => it.approved === null).length

  if (submitted) {
    const approvedCount = items.filter((it) => it.approved === true).length
    const rejectedCount = items.filter((it) => it.approved === false).length
    return (
      <div className="proposal-table submitted">
        <span className="proposal-submitted-badge">
          ✓ {approvedCount} approved · {rejectedCount} rejected
        </span>
      </div>
    )
  }

  return (
    <div className="proposal-table">
      {title && <div className="proposal-title">{title}</div>}

      <div className="proposal-rows">
        {items.map((item) => (
          <div key={item.id} className={`proposal-row ${item.approved === true ? "approved" : item.approved === false ? "rejected" : ""}`}>
            <div className="proposal-label" title={item.reasoning}>
              {item.label}
            </div>
            <div className="proposal-values">
              {item.current != null && <span className="proposal-current">{item.current}</span>}
              <span className="proposal-arrow">→</span>
              <span className="proposal-proposed">{item.proposed}</span>
            </div>
            <div className="proposal-reasoning">{item.reasoning}</div>
            <div className="proposal-actions">
              <button className={`proposal-btn approve ${item.approved === true ? "active" : ""}`} onClick={() => toggle(item.id, true)}>
                ✓
              </button>
              <button className={`proposal-btn reject ${item.approved === false ? "active" : ""}`} onClick={() => toggle(item.id, false)}>
                ✗
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="proposal-footer">
        <button className="proposal-bulk" onClick={approveAll}>
          Approve all
        </button>
        <button className="proposal-bulk" onClick={rejectAll}>
          Reject all
        </button>
        {onDismiss && (
          <button className="proposal-bulk" onClick={onDismiss} aria-label="Dismiss proposals and return to the agent">
            Dismiss
          </button>
        )}
        <button
          className="proposal-submit"
          disabled={pending > 0}
          onClick={submit}
          title={pending > 0 ? `${pending} items still pending` : ""}
        >
          Confirm {items.filter((it) => it.approved === true).length} changes
        </button>
      </div>
    </div>
  )
}
