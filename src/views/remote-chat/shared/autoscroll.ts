// Autoscroll decision for the chat list.
//
// Bug (#76): during streaming, `messages` updates every chunk, so the autoscroll effect
// fires constantly and the old onScroll guard (`Date.now() - lastAutoScroll < 100ms`) was
// ALWAYS inside its window — every user scroll got mistaken for an autoscroll echo, so
// `userScrolledUp` never flipped and the chat was locked to the bottom (couldn't scroll up
// while text generated). The robust rule doesn't use a timer: a scroll event is either OUR
// programmatic scroll (ignore) or a USER scroll (decide pause by position). Pure + tested.

export interface ScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

// Within `threshold` px of the bottom → considered "at bottom" (autoscroll should stick).
export function isAtBottom(m: ScrollMetrics, threshold = 80): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight < threshold
}

// Given a scroll event, return the next "autoscroll paused" state.
//  - wasProgrammatic: the scroll came from our own scrollTop write → never changes pause
//    state (it's not the user expressing intent).
//  - otherwise it's a USER scroll: pause autoscroll when they've moved away from the bottom,
//    resume when they return to the bottom.
export function nextPausedState(currentPaused: boolean, m: ScrollMetrics, wasProgrammatic: boolean, threshold = 80): boolean {
  if (wasProgrammatic) return currentPaused
  return !isAtBottom(m, threshold)
}

// Should the effect auto-scroll to the bottom right now? Only when not paused.
export function shouldAutoScroll(paused: boolean): boolean {
  return !paused
}

// Sending a NEW user message is explicit intent to follow the conversation, so autoscroll must
// resume regardless of a prior paused state — otherwise the new turn streams off-screen and the
// list stays stuck where the user had scrolled ("can't scroll down / had to reopen" bug). Always
// returns false (not paused). Kept as a named function so the invariant is unit-tested, not just
// an inline assignment in the send handler.
export function pausedAfterSend(): boolean {
  return false
}
