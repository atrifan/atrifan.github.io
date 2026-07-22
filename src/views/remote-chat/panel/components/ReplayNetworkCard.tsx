import type { ReplayNetworkPayload } from "../../shared/types"

interface Props {
  payload: ReplayNetworkPayload
  onDecision: (actionId: string, decision: "approve" | "deny") => void
}

const METHOD_BADGE: Record<string, string> = {
  GET: "🟢",
  POST: "🟠",
  PUT: "🔵",
  PATCH: "🟣",
  DELETE: "🔴",
}

export function ReplayNetworkCard({ payload, onDecision }: Props) {
  const badge = METHOD_BADGE[payload.method] ?? "⚪"

  return (
    <div className="action-approval-card replay-network-card">
      <div className="action-approval-header">
        <span className="action-approval-icon">🔄</span>
        <span className="action-approval-type">REPLAY_NETWORK_CALL</span>
      </div>

      <div className="action-approval-details">
        <div className="action-approval-target">
          <span className="action-approval-label">{badge} {payload.method}</span>
          <code>{payload.url}</code>
        </div>
        {payload.originalStatus != null && (
          <div className="action-approval-value">
            <span className="action-approval-label">Original status:</span>
            <code className={payload.originalStatus >= 400 ? "error-status" : ""}>{payload.originalStatus}</code>
          </div>
        )}
        {payload.bodyPreview && (
          <div className="action-approval-value">
            <span className="action-approval-label">Payload:</span>
            <code className="body-preview">{payload.bodyPreview}</code>
          </div>
        )}
        {payload.reasoning && (
          <div className="action-approval-reasoning">{payload.reasoning}</div>
        )}
      </div>

      <div className="action-approval-actions">
        <button
          className="action-approval-btn action-approval-btn-approve"
          onClick={() => onDecision(payload.actionId, "approve")}
        >
          ✓ Approve Replay
        </button>
        <button
          className="action-approval-btn action-approval-btn-queue"
          onClick={() => onDecision(payload.actionId, "deny")}
        >
          ✕ Deny
        </button>
      </div>
    </div>
  )
}
