// Notification sounds for the side panel. The service worker has no DOM/Audio, so
// the panel plays a short synthesized tone (Web Audio — no asset files) when the
// agent finishes, errors, or needs the user to act on a tab they are NOT currently
// watching. Honors the single shared "Sound" preference (mirrored from the
// native-host DB via the NOTIFICATION_* config round-trip). Never throws.

export type SoundKind = "done" | "error" | "input"

// Mirrors the DB's sound_enabled preference. Default ON; App.tsx pushes the real
// value once NOTIFICATION_CONFIG arrives.
let soundEnabled = true

export function setSoundEnabled(on: boolean): void {
  soundEnabled = on
}

export function getSoundEnabled(): boolean {
  return soundEnabled
}

// "Is the user NOT actively viewing this event?" — play only when the panel is
// hidden or the event belongs to a tab other than the one on screen.
export function shouldNotify(opts: { msgTabId: number | null; activeTabId: number | null; hidden: boolean }): boolean {
  if (opts.hidden) return true
  // Tab identity known on both sides → suppress only when they match (actively viewing).
  if (opts.msgTabId != null && opts.activeTabId != null) {
    return opts.msgTabId !== opts.activeTabId
  }
  // Unknown tab + visible panel → don't silently swallow; notify.
  return true
}

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  try {
    const Ctor =
      (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!ctx) ctx = new Ctor()
    return ctx
  } catch {
    return null
  }
}

// One short beep: an oscillator through a gain envelope so it fades cleanly.
function beep(context: AudioContext, freq: number, startAt: number, duration: number, type: OscillatorType = "sine"): void {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, startAt)
  // quick attack, exponential decay — pleasant, non-jarring
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  osc.connect(gain)
  gain.connect(context.destination)
  osc.start(startAt)
  osc.stop(startAt + duration)
}

// Distinct timbre per class: done = rising two-note chime, error = low buzz,
// input = gentle single ping.
export function playSound(kind: SoundKind): void {
  try {
    if (!soundEnabled) return
    const context = getCtx()
    if (!context) return
    const t = context.currentTime
    if (kind === "done") {
      beep(context, 660, t, 0.12)
      beep(context, 880, t + 0.12, 0.16)
    } else if (kind === "error") {
      beep(context, 200, t, 0.28, "square")
    } else {
      beep(context, 760, t, 0.16, "triangle")
    }
  } catch {
    // a notification sound must never break the panel
  }
}
