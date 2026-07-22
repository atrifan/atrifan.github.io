// The subset of the assistant's message contract (plugin/src/shared/types.ts)
// that the remote chat relay carries. Frames are opaque to Tulzo's server; the
// client interprets them to render a live turn. Keep the string literals
// byte-identical to the assistant so both ends agree.

// Page → device.
export type PanelToWorker =
  | { type: 'SEND_MESSAGE'; text: string; model?: string; sessionId?: string }
  | { type: 'STOP_STREAM' }
  | { type: 'USER_RESPONSE'; text: string }
  | { type: 'PLAN_RESPONSE'; planId: string; approved: boolean }
  | {
      type: 'ACTION_APPROVAL_RESPONSE';
      actionId: string;
      decision: 'approve' | 'deny' | 'guide' | 'queue' | 'allow_always';
    };

// Device → page (streaming events we render in v1). Additional WorkerToPanel
// frame types (rich blocks, sub-agents, plans) pass through the relay untouched
// and can be rendered as they are ported.
export type WorkerToPanel =
  | { type: 'STREAM_CHUNK'; delta: string; tabId?: number | null }
  | { type: 'THINKING_CHUNK'; delta: string; tabId?: number | null }
  | { type: 'STREAM_VERIFY'; state?: 'verifying' | 'verified' | 'unverified' }
  | { type: 'STREAM_DONE'; inputTokens?: number; outputTokens?: number }
  | { type: 'STREAM_ERROR'; error: string }
  | { type: 'WAIT_FOR_USER_PROMPT'; message: string }
  | { type: 'WAIT_FOR_USER_DONE' };

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
