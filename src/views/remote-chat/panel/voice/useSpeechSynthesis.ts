// TTS via the browser Web Speech API (speechSynthesis). Reads the FINAL answer text aloud only —
// never thinking/actions (the caller passes clean answer text). Fail-safe: unsupported → supported
// false, speak() is a no-op. cancel() stops immediately (Stop pill + barge-in).

import { useCallback, useEffect, useRef, useState } from "react"

export interface SpeechSynthesisHook {
  supported: boolean
  speaking: boolean
  speak: (text: string, opts?: { onEnd?: () => void }) => void
  cancel: () => void
}

export function useSpeechSynthesis(): SpeechSynthesisHook {
  const [supported] = useState<boolean>(() => typeof window !== "undefined" && "speechSynthesis" in window)
  const [speaking, setSpeaking] = useState(false)
  const onEndRef = useRef<(() => void) | null>(null)

  const cancel = useCallback(() => {
    if (!supported) return
    onEndRef.current = null
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
    setSpeaking(false)
  }, [supported])

  const speak = useCallback<SpeechSynthesisHook["speak"]>(
    (text, opts) => {
      if (!supported) return
      const clean = (text ?? "").trim()
      if (!clean) return

      const doSpeak = () => {
        // Cancel anything mid-flight first (never overlap two utterances).
        try {
          window.speechSynthesis.cancel()
        } catch {
          /* ignore */
        }
        const u = new SpeechSynthesisUtterance(clean)
        u.lang = navigator.language || "en-US"
        // Prefer a matching-locale voice if the list is populated (helps some engines actually emit).
        try {
          const voices = window.speechSynthesis.getVoices()
          const v = voices.find((x) => x.lang?.startsWith((navigator.language || "en").slice(0, 2)))
          if (v) u.voice = v
        } catch {
          /* voices optional */
        }
        onEndRef.current = opts?.onEnd ?? null
        u.onend = () => {
          setSpeaking(false)
          const cb = onEndRef.current
          onEndRef.current = null
          cb?.()
        }
        u.onerror = () => {
          setSpeaking(false)
          onEndRef.current = null
        }
        setSpeaking(true)
        try {
          // Chrome sometimes leaves synthesis "paused" after a prior cancel — resume defensively.
          window.speechSynthesis.resume()
          window.speechSynthesis.speak(u)
        } catch {
          setSpeaking(false)
        }
      }

      // Chrome gotcha: getVoices() is empty until the voiceschanged event fires the first time, and
      // speak() before then can silently no-op. If no voices yet, wait once for them.
      let voicesReady = false
      try {
        voicesReady = window.speechSynthesis.getVoices().length > 0
      } catch {
        voicesReady = true // assume ok if the query throws
      }
      if (voicesReady) {
        doSpeak()
      } else {
        const once = () => {
          window.speechSynthesis.removeEventListener("voiceschanged", once)
          doSpeak()
        }
        window.speechSynthesis.addEventListener("voiceschanged", once)
        // Fallback if the event never fires (some builds): try anyway shortly.
        setTimeout(() => {
          window.speechSynthesis.removeEventListener("voiceschanged", once)
          doSpeak()
        }, 250)
      }
    },
    [supported],
  )

  // Stop any speech if the panel unmounts.
  useEffect(() => () => cancel(), [cancel])

  return { supported, speaking, speak, cancel }
}
