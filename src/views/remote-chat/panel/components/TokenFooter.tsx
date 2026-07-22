import { AnyModel, SessionUsage, ProviderConfig, PROVIDER_LABELS, ProviderType } from "../../shared/types"

interface Props {
  model: AnyModel
  usage: SessionUsage
  onModelChange: (m: AnyModel) => void
  activeProvider?: string
  providers?: Record<string, ProviderConfig>
  sessionCost?: number
}

export function TokenFooter({ model, usage, onModelChange, activeProvider, providers, sessionCost }: Props) {
  const activeConfig = activeProvider && providers ? providers[activeProvider] : null
  const providerLabel = activeConfig ? (PROVIDER_LABELS[activeConfig.type as ProviderType] ?? activeProvider) : ""

  return (
    <div className="token-footer">
      <select className="model-select" value={model} onChange={(e) => onModelChange(e.target.value as AnyModel)}>
        {activeConfig ? (
          <option value={activeConfig.models.orchestrator}>{activeConfig.models.orchestrator}</option>
        ) : (
          <option value={model}>{model}</option>
        )}
      </select>

      <div className="token-stats">
        {/* CUMULATIVE session usage (sum of every turn), distinct from the composer's context
            gauge which shows the CURRENT prompt's context fill. Titles make that explicit so the
            two numbers don't read as contradictory. */}
        <span
          className="token-stat"
          title="Total input tokens this session (cumulative across all turns) — not the current context size (see the context gauge by the composer)"
        >
          <span className="arrow">↑</span>
          {usage.inputTokens.toLocaleString()}
        </span>
        <span className="token-stat" title="Total output tokens this session (cumulative)">
          <span className="arrow">↓</span>
          {usage.outputTokens.toLocaleString()}
        </span>
        {sessionCost != null && sessionCost > 0 && <span className="token-stat">${sessionCost.toFixed(4)}</span>}
        <span className="token-stat" style={{ color: "#7c9cbf" }}>
          {providerLabel}
        </span>
      </div>
    </div>
  )
}
