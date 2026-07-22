// Voice capture (STT) for the Tulzo remote-chat page. This is the in-page port of the plugin's
// content/voice-capture.ts: the plugin had to INJECT that engine into the active tab because a
// Chrome side panel can't call getUserMedia — but a normal web page runs it directly. So the
// getUserMedia + webkitSpeechRecognition + amplitude-meter core is kept verbatim; only the
// chrome.runtime.sendMessage transport is replaced with React callbacks (onInterim/onFinal/
// onAmplitude/onError/onEnded).
//
// Lifecycle: start() prompts for mic (page origin), runs continuous+interim recognition, and
// graceful-stops after SILENCE_MS of quiet (webkitSpeechRecognition with continuous=true never
// ends on its own). stop() ends it gracefully. Unmount aborts.

import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: { length: number; [i: number]: { 0: { transcript: string }; isFinal: boolean } };
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const SILENCE_MS = 2500;

export interface VoiceCaptureCallbacks {
  /** Live (interim + accumulated final) transcript as the user speaks. */
  onInterim?: (text: string) => void;
  /** Final transcript when recognition ends. */
  onFinal?: (text: string) => void;
  /** Mic amplitude 0..1 for the orb glow. */
  onAmplitude?: (level: number) => void;
  /** A human-readable error (unsupported, permission denied, …). */
  onError?: (message: string) => void;
  /** Recognition fully stopped (after onFinal). */
  onEnded?: () => void;
}

export interface VoiceCaptureHook {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
}

export function useVoiceCapture(cbs: VoiceCaptureCallbacks): VoiceCaptureHook {
  const [supported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  });
  const [listening, setListening] = useState(false);

  // Callbacks change every render; keep them in a ref so the engine closure stays stable.
  const cbsRef = useRef(cbs);
  cbsRef.current = cbs;

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const finalTextRef = useRef('');
  const endedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    try {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close();
    } catch {
      /* ignore */
    }
    audioCtxRef.current = null;
    recRef.current = null;
    setListening(false);
  }, []);

  const finish = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    cbsRef.current.onFinal?.(finalTextRef.current.trim());
    cbsRef.current.onEnded?.();
    cleanup();
  }, [cleanup]);

  const armSilence = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      try {
        recRef.current?.stop(); // graceful → onend → finish()
      } catch {
        finish();
      }
    }, SILENCE_MS);
  }, [finish]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      finish();
    }
  }, [finish]);

  const start = useCallback(() => {
    if (!supported || recRef.current) return;
    const w = window as unknown as {
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      cbsRef.current.onError?.('Speech recognition not supported in this browser.');
      return;
    }
    endedRef.current = false;
    finalTextRef.current = '';
    setListening(true);

    // Permission FIRST (page-origin prompt), then start recognition + amplitude meter.
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        streamRef.current = s;
        // Amplitude meter for the orb glow (best-effort).
        try {
          const AC = window.AudioContext || w.webkitAudioContext!;
          const audioCtx = new AC();
          audioCtxRef.current = audioCtx;
          const src = audioCtx.createMediaStreamSource(s);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          src.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const d = (data[i] - 128) / 128;
              sum += d * d;
            }
            const rms = Math.sqrt(sum / data.length);
            cbsRef.current.onAmplitude?.(Math.min(1, rms * 3));
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        } catch {
          /* meter best-effort */
        }

        const rec = new Ctor();
        recRef.current = rec;
        rec.lang = navigator.language || 'en-US';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalTextRef.current += r[0].transcript;
            else interim += r[0].transcript;
          }
          cbsRef.current.onInterim?.((finalTextRef.current + interim).trim());
          armSilence(); // reset the quiet-timer on every bit of speech
        };
        rec.onerror = (ev) => {
          if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
            cbsRef.current.onError?.(ev.error);
          }
        };
        rec.onend = () => finish();
        try {
          rec.start();
          armSilence(); // start the quiet-timer so a session with NO speech still auto-stops
        } catch (e) {
          cbsRef.current.onError?.(e instanceof Error ? e.message : String(e));
          cleanup();
        }
      })
      .catch((e: { name?: string }) => {
        const name = e?.name;
        cbsRef.current.onError?.(
          name === 'NotAllowedError'
            ? 'Microphone permission denied on this page.'
            : `Microphone unavailable: ${name ?? 'error'}`
        );
        cleanup();
      });
  }, [supported, armSilence, finish, cleanup]);

  // Abort on unmount.
  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      cleanup();
    },
    [cleanup]
  );

  return { supported, listening, start, stop };
}
