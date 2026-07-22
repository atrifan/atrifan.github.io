// The message contract carried by the remote chat relay. The frame unions live
// in the verbatim copy of the assistant's contract (`shared/types.ts`) so both
// ends stay byte-identical — we re-export them here as the transport's public
// shape rather than maintaining a divergent subset.
//
// `RelayMessage` / `RelaySession` are Tulzo-specific durable-store shapes
// (chat_relay_messages / chat_relay_sessions rows) and have no plugin analogue.

export type { PanelToWorker, WorkerToPanel } from './shared/types';

// Any frame — the relay treats frames as opaque JSON, so unknown types are fine.
export type RelayFrame = { type: string; [k: string]: unknown };

// A durable, rendered message as stored by the relay (chat_relay_messages).
export interface RelayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: { text?: string; steps?: string[]; actions?: string[]; [k: string]: unknown };
  seq: number;
  created_at?: string;
}

// A relay session (targets one connected device).
export interface RelaySession {
  id: string;
  user_id: string;
  api_key_id: string;
  device_name: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}
