// Pure voice-chat lifecycle machine (V1). The single source of truth both the composer mini-robot
// and the big listening orb read, so their state can never diverge (mirrors how stream-parse.ts is
// the one parser shared by the worker + panel). No DOM, no Web Speech calls — those live in the
// hooks; this only decides state/face/visibility and emits a side-effect SIGNAL the caller acts on.
//
// Faces are the TUI robot's (native-host/src/cli/tui-robot.ts): the browser component animates the
// blink for `idle-open` itself; this machine just picks which face applies.
//
// INVARIANTS:
//  • `happy` fires ONLY on a VERIFIED turn — never on mere completion. A confidently-wrong /
//    unverified answer shows `sad`, so the robot can't become a fact-hider.
//  • Barge-in: START_LISTENING while `speaking` cancels the speech (effect: "cancel-speech") and
//    switches to listening in one step.

export type VoiceState = "idle" | "listening" | "processing" | "speaking"
// Subset of the TUI robot faces this machine selects (idle-closed/blink is the component's own
// timer animation on top of idle-open).
export type RobotFace = "idle-open" | "thinking" | "happy" | "sad"
export type VoiceEffect = "cancel-speech" | null

export interface VoiceView {
  state: VoiceState
  robotFace: RobotFace
  orbVisible: boolean // big centered listening orb (listening only)
  pillVisible: boolean // "Speaking… ⏹ Stop" pill (speaking only)
  transcript: string // live interim text shown under the orb; cleared on finalize/cancel
  // A one-shot side-effect the caller must perform THIS tick, then it clears on the next event.
  // Only "cancel-speech" today (barge-in). Read it after each reduce; do not persist.
  effect: VoiceEffect
}

export type VoiceEvent =
  | { type: "START_LISTENING" } // user clicked the mic robot
  | { type: "INTERIM"; text: string } // live (interim) transcript update
  | { type: "FINALIZE" } // recognition ended; text handed to the composer
  | { type: "CANCEL_LISTENING" } // Esc / clicked orb to dismiss
  | { type: "TURN_START" } // an agent turn began (SEND_MESSAGE went out)
  | { type: "TURN_DONE"; verified: boolean } // agent turn ended; verified drives happy vs sad
  | { type: "SPEAK_START" } // TTS began reading the verified answer
  | { type: "SPEAK_END" } // TTS finished / was cancelled

export function voiceInit(): VoiceView {
  return { state: "idle", robotFace: "idle-open", orbVisible: false, pillVisible: false, transcript: "", effect: null }
}

// Base view for a plain state with no lingering transcript/effect/mood.
function view(state: VoiceState, robotFace: RobotFace, extra: Partial<VoiceView> = {}): VoiceView {
  return { state, robotFace, orbVisible: false, pillVisible: false, transcript: "", effect: null, ...extra }
}

export function voiceReduce(v: VoiceView, e: VoiceEvent): VoiceView {
  switch (e.type) {
    case "START_LISTENING": {
      // Barge-in: interrupting speech cancels TTS. From any state, clicking the mic → listening.
      const effect: VoiceEffect = v.state === "speaking" ? "cancel-speech" : null
      return view("listening", "idle-open", { orbVisible: true, effect })
    }
    case "INTERIM":
      if (v.state !== "listening") return v
      return { ...v, transcript: e.text, effect: null }
    case "FINALIZE":
      if (v.state !== "listening") return v
      return view("idle", "idle-open")
    case "CANCEL_LISTENING":
      if (v.state !== "listening") return v
      return view("idle", "idle-open")
    case "TURN_START":
      return view("processing", "thinking")
    case "TURN_DONE":
      if (v.state !== "processing") return v
      // happy ONLY when verified; otherwise sad.
      return view("idle", e.verified ? "happy" : "sad")
    case "SPEAK_START":
      // Reading the verified answer aloud — happy face + the Stop pill.
      return view("speaking", "happy", { pillVisible: true })
    case "SPEAK_END":
      if (v.state !== "speaking") return v
      return view("idle", "happy")
    default:
      return v
  }
}
