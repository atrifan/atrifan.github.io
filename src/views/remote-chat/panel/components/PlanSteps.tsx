import type { PlanStep } from "../../shared/types"

interface Props {
  title?: string
  steps: PlanStep[]
}

const STATUS_ICON: Record<PlanStep["status"], string> = {
  pending: "○",
  running: "⏳",
  done:    "✓",
  error:   "✗",
}

export function PlanSteps({ title, steps }: Props) {
  return (
    <div className="plan-steps">
      {title && <div className="plan-title">{title}</div>}
      <ol className="plan-list">
        {steps.map((step) => (
          <li key={step.id} className={`plan-step ${step.status}`}>
            <span className="plan-step-icon">{STATUS_ICON[step.status]}</span>
            <span className="plan-step-label">{step.label}</span>
            {step.detail && <span className="plan-step-detail">{step.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
