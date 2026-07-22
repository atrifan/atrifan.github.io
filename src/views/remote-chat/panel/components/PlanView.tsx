import type { TaskPlan } from "../../shared/types"

interface Props {
  plan: TaskPlan
  onApprove: () => void
  onReject: () => void
}

const STATUS_ICON: Record<string, string> = {
  pending: "○",   // ○
  running: "◐",   // ◐
  done:    "✓",   // ✓
  skipped: "–",   // –
  failed:  "✗",   // ✗
}

const STATUS_CLASS: Record<string, string> = {
  pending: "step-pending",
  running: "step-running",
  done:    "step-done",
  skipped: "step-skipped",
  failed:  "step-failed",
}

export function PlanView({ plan, onApprove, onReject }: Props) {
  return (
    <div className="plan-view">
      <div className="plan-view-header">
        <span className="plan-view-title">{plan.title}</span>
        <span className="plan-view-status">{plan.status}</span>
      </div>

      <ol className="plan-view-steps">
        {plan.steps.map((step) => (
          <li key={step.id} className={`plan-view-step ${STATUS_CLASS[step.status] ?? ""}`}>
            <span className="plan-view-step-icon">{STATUS_ICON[step.status] ?? "?"}</span>
            <span className="plan-view-step-label">{step.label}</span>
            {step.requires_confirmation && step.status === "pending" && (
              <span className="plan-view-step-confirm" title="Requires confirmation">!</span>
            )}
            {step.result && <span className="plan-view-step-result">{step.result}</span>}
          </li>
        ))}
      </ol>

      {plan.status === "pending" && (
        <div className="plan-view-actions">
          <button className="plan-view-btn plan-view-btn-approve" onClick={onApprove}>
            Approve
          </button>
          <button className="plan-view-btn plan-view-btn-reject" onClick={onReject}>
            Reject
          </button>
        </div>
      )}
    </div>
  )
}
