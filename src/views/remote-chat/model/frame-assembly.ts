// Assembling one assistant turn from the device's stream frames. The device emits
// STREAM_CHUNK / THINKING_CHUNK / STREAM_VERIFY / STREAM_RESET while the loop runs
// and STREAM_DONE (or STREAM_ERROR) at the end (assistant/plugin/src/background/
// remote-chat.ts). Some turns stream nothing and carry the whole answer only in
// STREAM_DONE.message.content, so the terminal frame fills an empty bubble.

import { applyDelta } from '../shared/stream-parse';
import type { ChatEntry } from '../shared/types';
import type { WireFrame } from './frame-sequence';

type VerifyState = NonNullable<ChatEntry['verifyState']>;

export interface StreamEntry {
  content: string;
  thinking?: string;
  actions?: string[];
  steps?: string[];
  verifyState?: VerifyState;
  streaming?: boolean;
  error?: boolean;
}

const STREAM_FRAME_TYPES = new Set([
  'STREAM_CHUNK',
  'THINKING_CHUNK',
  'STREAM_RESET',
  'STREAM_VERIFY',
  'STREAM_DONE',
  'STREAM_ERROR',
]);

/** True for the frames applyStreamFrame assembles into the live bubble. */
export function isStreamFrame(frame: { type: string }): boolean {
  return STREAM_FRAME_TYPES.has(frame.type);
}

/**
 * Text of a message content: a string, a `{ text }` object (Tulzo's durable
 * history rows) or an array of Anthropic-style content blocks.
 */
export function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b && b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
      .filter(Boolean)
      .join('\n\n');
  }
  if (content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string') {
    return (content as { text: string }).text;
  }
  return '';
}

/** The finished answer a STREAM_DONE frame carries, or ''. */
export function doneText(frame: WireFrame): string {
  const message = frame.message;
  if (!message || typeof message !== 'object') return '';
  return contentText((message as { content?: unknown }).content);
}

/** Apply one stream frame to the live assistant entry. Unrelated frames return the same entry. */
export function applyStreamFrame<T extends StreamEntry>(entry: T, frame: WireFrame): T {
  switch (frame.type) {
    case 'STREAM_CHUNK': {
      if (typeof frame.delta !== 'string') return entry;
      const acc = { content: entry.content, actions: [...(entry.actions ?? [])], steps: [...(entry.steps ?? [])] };
      applyDelta(acc, frame.delta);
      return { ...entry, content: acc.content, actions: acc.actions, steps: acc.steps };
    }
    case 'THINKING_CHUNK':
      if (typeof frame.delta !== 'string') return entry;
      return { ...entry, thinking: (entry.thinking ?? '') + frame.delta };
    case 'STREAM_RESET':
      return { ...entry, content: '', thinking: '', actions: [], steps: [] };
    case 'STREAM_VERIFY':
      return { ...entry, verifyState: frame.state as VerifyState };
    case 'STREAM_DONE':
      return { ...entry, streaming: false, content: entry.content || doneText(frame) };
    case 'STREAM_ERROR': {
      const error = typeof frame.error === 'string' && frame.error ? frame.error : 'The request failed.';
      return { ...entry, streaming: false, error: true, content: entry.content || error };
    }
    default:
      return entry;
  }
}
