// The voice robot — the CLI/TUI robot (native-host/src/cli/tui-robot.ts) promoted to an animated
// SVG so it renders crisp at any size and can blink/pulse/glow. Two sizes:
//   • "mini"  — the small persistent composer avatar that doubles as the mic button.
//   • "orb"   — the big centered listening overlay; `amplitude` (0..1) drives its glow ring so it
//               breathes with the user's voice (ChatGPT-orb feel).
//
// `face` is the pure state machine's RobotFace (idle-open | thinking | happy | sad). The blink
// (idle-open ⇄ closed) is a local timer here — matching the TUI cadence (2500ms open / 300ms
// closed) — because the shared machine stays DOM-free. Purple = var(--accent), the brand color.

import { useEffect, useRef, useState } from "react"
import type { RobotFace } from "../../shared/voice-state"

const BLINK_INTERVAL = 2500
const BLINK_DURATION = 300

// Eye + mouth geometry per face, matching the TUI FACES table:
//  idle-open ◉ ◉ / ═ ; idle-closed — — / ═ ; thinking ◉_◉ / ─── ; happy ◕‿◕ / ▽ ; sad ╥_╥ / ─
function faceShapes(face: RobotFace, blinkClosed: boolean): { eyes: JSX.Element; mouth: JSX.Element } {
  const openEye = (cx: number) => <circle cx={cx} cy={42} r={5} className="vr-eye" />
  const closedEye = (cx: number) => <line x1={cx - 5} y1={42} x2={cx + 5} y2={42} className="vr-eye-line" />
  const L = 34
  const R = 66

  if (face === "idle-open") {
    const eyes = blinkClosed ? (
      <>
        {closedEye(L)}
        {closedEye(R)}
      </>
    ) : (
      <>
        {openEye(L)}
        {openEye(R)}
      </>
    )
    return { eyes, mouth: <line x1={42} y1={62} x2={58} y2={62} className="vr-mouth" /> }
  }
  if (face === "thinking") {
    return {
      eyes: (
        <>
          {openEye(L)}
          {openEye(R)}
        </>
      ),
      // a flat, contemplative line
      mouth: <line x1={38} y1={62} x2={62} y2={62} className="vr-mouth" />,
    }
  }
  if (face === "happy") {
    return {
      // slightly squashed happy eyes (◕)
      eyes: (
        <>
          <path d="M 29 44 Q 34 36 39 44" className="vr-eye-arc" />
          <path d="M 61 44 Q 66 36 71 44" className="vr-eye-arc" />
        </>
      ),
      // upward smile (▽-ish)
      mouth: <path d="M 40 60 Q 50 70 60 60" className="vr-mouth-curve" />,
    }
  }
  // sad ╥_╥
  return {
    eyes: (
      <>
        {openEye(L)}
        {openEye(R)}
      </>
    ),
    mouth: <path d="M 40 66 Q 50 58 60 66" className="vr-mouth-curve" />,
  }
}

export interface VoiceRobotProps {
  face: RobotFace
  size?: "mini" | "orb"
  amplitude?: number // 0..1, orb glow ring intensity (listening)
  className?: string
  // For the mini mic button: click + a11y label + pressed (listening) state.
  onClick?: () => void
  ariaLabel?: string
  pressed?: boolean
  disabled?: boolean
  title?: string
}

export function VoiceRobot({
  face,
  size = "mini",
  amplitude = 0,
  className,
  onClick,
  ariaLabel,
  pressed,
  disabled,
  title,
}: VoiceRobotProps) {
  const [blinkClosed, setBlinkClosed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Blink only in the idle-open face; other faces hold their expression.
  useEffect(() => {
    if (face !== "idle-open") {
      setBlinkClosed(false)
      return
    }
    let alive = true
    const openThenBlink = () => {
      if (!alive) return
      timer.current = setTimeout(() => {
        if (!alive) return
        setBlinkClosed(true)
        timer.current = setTimeout(() => {
          if (!alive) return
          setBlinkClosed(false)
          openThenBlink()
        }, BLINK_DURATION)
      }, BLINK_INTERVAL)
    }
    openThenBlink()
    return () => {
      alive = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [face])

  const { eyes, mouth } = faceShapes(face, blinkClosed)
  // Clamp amplitude and expose it as a CSS var so the glow ring scales with the voice.
  const amp = Math.max(0, Math.min(1, amplitude))

  const svg = (
    <svg className="vr-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {/* antenna */}
      <line x1={50} y1={6} x2={50} y2={16} className="vr-antenna" />
      <circle cx={50} cy={6} r={4} className="vr-antenna-dot" />
      {/* head */}
      <rect x={20} y={16} width={60} height={62} rx={12} className="vr-head" />
      {eyes}
      {mouth}
      {/* feet */}
      <line x1={34} y1={78} x2={34} y2={86} className="vr-foot" />
      <line x1={66} y1={78} x2={66} y2={86} className="vr-foot" />
    </svg>
  )

  const cls = `voice-robot vr-${size} vr-face-${face}${className ? " " + className : ""}`
  const style = { ["--vr-amp" as string]: String(amp) } as React.CSSProperties

  // Mini is an interactive button (the mic); orb is a decorative presentation element.
  if (size === "mini") {
    return (
      <button
        type="button"
        className={cls}
        style={style}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel ?? "Voice input"}
        aria-pressed={pressed ?? false}
        title={title ?? ariaLabel}
      >
        {svg}
      </button>
    )
  }
  return (
    <div className={cls} style={style} role="img" aria-label={ariaLabel ?? "Listening"}>
      {svg}
    </div>
  )
}
