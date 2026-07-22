interface Props {
  handMode: boolean
  brainMode: boolean
  onToggle: (mode: "hand" | "brain", value: boolean) => void
}

export function ModeToggles({ handMode, brainMode, onToggle }: Props) {
  return (
    <div className="mode-toggles">
      <button
        className={`nav-btn mode-toggle ${handMode ? "mode-toggle-active" : ""}`}
        onClick={() => onToggle("hand", !handMode)}
        data-tooltip={handMode ? "Auto Approve OFF" : "Auto Approve ON"}
      >
        ✋
      </button>
      <button
        className={`nav-btn mode-toggle ${brainMode ? "mode-toggle-active" : ""}`}
        onClick={() => onToggle("brain", !brainMode)}
        data-tooltip={brainMode ? "Plan Mode ON" : "Plan Mode OFF"}
      >
        🧠
      </button>
    </div>
  )
}
