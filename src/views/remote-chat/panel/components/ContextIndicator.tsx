// The context-usage gauge shown in the composer. It's also the "clear context"
// affordance: hovering reveals a red trash over the gauge, and clicking clears the
// model's context for the session (the transcript stays on screen). Extracted as a
// standalone presentational component so the UI test can render the REAL element.

interface Props {
  used: number
  total: number
  onClear: () => void
}

export function ContextIndicator({ used, total, onClear }: Props) {
  if (total <= 0) return null
  const rawFrac = used / total
  // Clamp the GAUGE to [0,1] so the ring arc never overshoots (used can briefly exceed the
  // window right before auto-summarization, which made the ring look stuck "full/on top").
  const frac = Math.min(Math.max(rawFrac, 0), 1)
  const pct = Math.round(rawFrac * 100) // tooltip shows the TRUE percentage (may be >100%)
  const stroke = frac >= 0.8 ? "var(--error)" : frac > 0.6 ? "#eab308" : "var(--accent)"
  return (
    <button
      type="button"
      className="context-indicator"
      data-testid="clear-context-btn"
      onClick={onClear}
      aria-label="Clear context (keeps the conversation on screen; the next message starts fresh)"
      data-tooltip={`Context ${pct}% · ${Math.round(used / 1000)}k/${Math.round(total / 1000)}k · click to clear`}
    >
      <svg className="context-gauge" viewBox="0 0 20 20" width="18" height="18">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeDasharray={`${frac * 50.26} 50.26`}
          strokeLinecap="round"
          transform="rotate(-90 10 10)"
        />
      </svg>
      {/* Revealed on hover (see App.css): a red trash over the gauge — click to clear. */}
      <svg className="context-clear-icon" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
        <path
          d="M7 3h6M4 6h12M6 6l1 10a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-10M9 9v6M11 9v6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
