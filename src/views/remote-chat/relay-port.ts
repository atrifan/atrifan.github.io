'use client';

// RelayPort — a transport shim that mimics the Chrome `Port` interface the
// assistant's panel chat is written against (`postMessage` + `onMessage`), but
// rides Tulzo's server relay instead of a same-browser Chrome runtime port.
//
// Outbound (page → device): POST the PanelToWorker frame to /api/plugin/chat/send.
// Inbound (device → page): subscribe to the Supabase Realtime channel
// `chat:<session_id>` (broadcast, low latency) AND postgres_changes on
// chat_relay_frames (durable fallback), dispatching each WorkerToPanel frame to
// listeners. Duplicate frames (broadcast + row for the same event) are de-duped.

import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { PanelToWorker, WorkerToPanel, RelayFrame } from './frames';

type Listener = (frame: WorkerToPanel) => void;

export interface RelayPortLike {
  postMessage: (frame: PanelToWorker) => void;
  onMessage: {
    addListener: (fn: Listener) => void;
    removeListener: (fn: Listener) => void;
  };
  disconnect: () => void;
}

// The relay tables + broadcast live on the STORAGE Supabase project (see
// chat-relay-service.ts, which uses STORAGE_SUPABASE_URL). The browser must
// subscribe to that SAME project or it receives nothing — so prefer the
// STORAGE-prefixed public vars this app actually defines, falling back to the
// bare names for any deployment that uses those instead.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_STORAGE_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_STORAGE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export function createRelayPort(sessionId: string): RelayPortLike {
  const listeners = new Set<Listener>();
  const client: SupabaseClient | null =
    SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  let channel: RealtimeChannel | null = null;

  // De-dupe frames that may arrive via both broadcast and the durable row.
  const seen = new Set<string>();
  const dispatch = (frame: RelayFrame, dedupeKey?: string) => {
    if (dedupeKey) {
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
    }
    listeners.forEach((fn) => fn(frame as WorkerToPanel));
  };

  // Reliable receive path: HTTP poll of /api/plugin/chat/receive by seq cursor.
  // The page is Clerk-authed with no Supabase JWT, so it cannot receive to_page
  // frames over Realtime under RLS — Realtime above is a best-effort low-latency
  // optimization; THIS is what actually delivers. Mirrors the device's /poll.
  let cursor = 0;
  let polling = true;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  const IDLE_MS = 1200;

  let primed = false;

  const pollOnce = async () => {
    if (!polling) return;
    let gotFrames = false;
    try {
      // First poll primes the cursor to the current high-water seq so we stream
      // only NEW frames — durable history hydrates separately from messages.
      const after = primed ? String(cursor) : 'latest';
      const res = await fetch(
        `/api/plugin/chat/receive?session_id=${encodeURIComponent(sessionId)}&after=${after}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (res.ok) {
        const body = (await res.json()) as { frames?: Array<{ seq: number; frame: RelayFrame }>; cursor?: number };
        if (!primed) {
          cursor = typeof body?.cursor === 'number' ? body.cursor : 0;
          primed = true;
        }
        const frames = Array.isArray(body?.frames) ? body.frames : [];
        for (const { seq, frame } of frames) {
          if (seq > cursor) cursor = seq;
          // Dedupe by seq so a frame also delivered via Realtime isn't doubled.
          dispatch(frame, `seq:${seq}`);
        }
        gotFrames = frames.length > 0;
      }
    } catch {
      /* transient — retry on the next tick */
    }
    if (polling) {
      // Drain promptly while frames are flowing; idle-wait when quiet.
      pollTimer = setTimeout(() => void pollOnce(), gotFrames ? 0 : IDLE_MS);
    }
  };
  void pollOnce();

  // NOTE: Supabase Realtime is intentionally NOT used as the page's receive path.
  // The page authenticates with Clerk and holds no Supabase JWT, so under RLS its
  // `postgres_changes` subscription on `chat_relay_frames` receives nothing, and
  // broadcast from Tulzo's serverless routes is unreliable (no held WS). The HTTP
  // poll below (`/api/plugin/chat/receive`) is the reliable delivery path. `client`
  // is retained only so a future JWT-bearing surface can opt back into Realtime.
  void client;
  void channel;

  const postMessage = (frame: PanelToWorker) => {
    void fetch('/api/plugin/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, frame }),
    }).then(async (res) => {
      if (!res.ok) {
        let error = 'send_failed';
        try {
          const body = await res.json();
          if (typeof body?.error === 'string') error = body.error;
        } catch {
          /* ignore */
        }
        dispatch({ type: 'STREAM_ERROR', error });
      }
    }).catch(() => {
      dispatch({ type: 'STREAM_ERROR', error: 'network_error' });
    });
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
      if (channel && client) client.removeChannel(channel);
      channel = null;
    },
  };
}
