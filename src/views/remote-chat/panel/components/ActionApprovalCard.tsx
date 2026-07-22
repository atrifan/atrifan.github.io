import type { ActionApprovalPayload } from "../../shared/types"

interface Props {
  action: ActionApprovalPayload
  onDecision: (actionId: string, decision: "approve" | "deny" | "guide" | "queue" | "allow_always") => void
}

const ACTION_ICON: Record<string, string> = {
  CLICK: "👆",
  CLICK_AND_WAIT: "👆",
  FILL: "✏️",
  SELECT: "☑️",
  CHECK: "☑️",
  NAVIGATE: "🔗",
  BACK: "◀",
  FORWARD: "▶",
  RELOAD: "🔄",
  SCROLL_TO: "📜",
  SCROLL: "📜",
  TYPE: "⌨️",
  PRESS: "⌨️",
  EXEC: "⚡",
  BATCH: "📋",
  MCP_CALL: "🔌",
}

export function ActionApprovalCard({ action, onDecision }: Props) {
  const icon = ACTION_ICON[action.actionType] ?? "🖐"

  return (
    <div className="action-approval-card">
      <div className="action-approval-header">
        <span className="action-approval-icon">{icon}</span>
        <span className="action-approval-type">{action.actionType}</span>
      </div>

      <div className="action-approval-details">
        <div className="action-approval-target">
          <span className="action-approval-label">Target:</span>
          <code>{action.target}</code>
        </div>
        {action.value && (
          <div className="action-approval-value">
            <span className="action-approval-label">Value:</span>
            <code>{action.value}</code>
          </div>
        )}
        {action.reasoning && <div className="action-approval-reasoning">{action.reasoning}</div>}
      </div>

      <div className="action-approval-actions">
        <button className="action-approval-btn action-approval-btn-approve" onClick={() => onDecision(action.actionId, "approve")}>
          ✓ Approve
        </button>
        <button
          className="action-approval-btn action-approval-btn-deny"
          onClick={() => onDecision(action.actionId, "deny")}
          title="Reject this action — the agent is told you refused and picks another approach"
        >
          ✕ Deny
        </button>
        <button
          className="action-approval-btn action-approval-btn-guide"
          onClick={() => onDecision(action.actionId, "guide")}
          title="Don't run it — instead tell me how to do it manually"
        >
          📖 Guide me
        </button>
        <button
          className="action-approval-btn action-approval-btn-queue"
          onClick={() => onDecision(action.actionId, "queue")}
          title="Decide later — skip this action for now without running it"
        >
          ⏸ Queue
        </button>
        {action.allowAlways && (
          <button
            className="action-approval-btn action-approval-btn-always"
            data-testid="action-approval-always"
            onClick={() => onDecision(action.actionId, "allow_always")}
            title="Approve now and never ask again for this tool"
          >
            ✓✓ Always allow
          </button>
        )}
      </div>
    </div>
  )
}
