'use client';

// RelayPort — a transport shim that mimics the Chrome `Port` interface the
// assistant's panel chat is written against (`postMessage` + `onMessage`), but
// rides Tulzo's server relay instead of a same-browser Chrome runtime port.
//
// Outbound (page → device): POST the PanelToWorker frame to /api/plugin/chat/send.
// Inbound (device → page): poll /api/plugin/chat/receive with a seq cursor and
// dispatch each WorkerToPanel frame once, in seq order (model/frame-sequence.ts).
// The page is Clerk-authed with no Supabase JWT, so Supabase Realtime can't
// deliver to it under RLS; the HTTP poll is the delivery path.

import type { PanelToWorker, WorkerToPanel } from './frames';
import { parseReceive, takeFresh } from './model/frame-sequence';

type Listener = (frame: WorkerToPanel) => void;

export interface RelayPortLike {
  /** Resolves true once the relay accepted the frame (false: a STREAM_ERROR was dispatched). */
  postMessage: (frame: PanelToWorker) => Promise<boolean>;
  onMessage: {
    addListener: (fn: Listener) => void;
    removeListener: (fn: Listener) => void;
  };
  disconnect: () => void;
}

export interface RelayPortOptions {
  /**
   * Read the session's frames from the beginning instead of priming the cursor at the
   * newest one. For a session created a moment ago, so a reply that lands before the
   * first poll isn't skipped. Existing sessions prime (history comes from /messages).
   */
  fromStart?: boolean;
}

const IDLE_MS = 1200;

export function createRelayPort(sessionId: string, opts: RelayPortOptions = {}): RelayPortLike {
  const listeners = new Set<Listener>();
  const dispatch = (frame: WorkerToPanel) => listeners.forEach((fn) => fn(frame));

  let cursor = 0;
  let primed = !!opts.fromStart;
  let polling = true;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const pollOnce = async () => {
    if (!polling) return;
    let gotFrames = false;
    try {
      const after = primed ? String(cursor) : 'latest';
      const res = await fetch(`/api/plugin/chat/receive?session_id=${encodeURIComponent(sessionId)}&after=${after}`);
      if (res.ok && polling) {
        const { frames, cursor: serverCursor } = parseReceive(await res.json());
        if (!primed) {
          cursor = serverCursor ?? 0;
          primed = true;
        }
        const next = takeFresh(frames, cursor);
        cursor = next.cursor;
        for (const { frame } of next.fresh) dispatch(frame as unknown as WorkerToPanel);
        gotFrames = next.fresh.length > 0;
      }
    } catch {
      /* transient — retry on the next tick */
    }
    // Drain promptly while frames are flowing; idle-wait when quiet.
    if (polling) pollTimer = setTimeout(() => void pollOnce(), gotFrames ? 0 : IDLE_MS);
  };
  void pollOnce();

  const postMessage = async (frame: PanelToWorker): Promise<boolean> => {
    try {
      const res = await fetch('/api/plugin/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, frame }),
      });
      if (res.ok) return true;
      let error = 'send_failed';
      try {
        const body = await res.json();
        if (typeof body?.error === 'string') error = body.error;
      } catch {
        /* ignore */
      }
      dispatch({ type: 'STREAM_ERROR', error });
      return false;
    } catch {
      dispatch({ type: 'STREAM_ERROR', error: 'network_error' });
      return false;
    }
  };

  return {
    postMessage,
    onMessage: {
      addListener: (fn: Listener) => listeners.add(fn),
      removeListener: (fn: Listener) => listeners.delete(fn),
    },
    disconnect: () => {
      listeners.clear();
      polling = false;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    },
  };
}
