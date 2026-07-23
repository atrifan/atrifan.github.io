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

  if (client) {
    channel = client.channel(`chat:${sessionId}`, { config: { broadcast: { ack: false } } });
    channel
      .on('broadcast', { event: 'frame' }, (msg) => {
        const payload = msg.payload as { direction?: string; frame?: RelayFrame } | undefined;
        if (payload?.direction === 'to_page' && payload.frame) {
          dispatch(payload.frame);
        }
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_relay_frames', filter: `session_id=eq.${sessionId}` },
        (msg) => {
          const row = msg.new as { id?: string; direction?: string; frame?: RelayFrame } | undefined;
          if (row?.direction === 'to_page' && row.frame) {
            dispatch(row.frame, row.id);
          }
        }
      )
      .subscribe();
  }

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
      if (channel && client) client.removeChannel(channel);
      channel = null;
    },
  };
}
