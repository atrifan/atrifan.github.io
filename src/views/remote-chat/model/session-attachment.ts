import type { NativeIncoming, NativeMessage, NativeMetadata, NativeProjection } from '../session-contract';

export interface AttachmentState {
  snapshot: NativeProjection | null;
  messages: NativeMessage[];
  through: number;
  historyComplete: boolean;
  buffer: Extract<NativeIncoming, { type: 'SESSION_EVENT' }>[];
  error: string | null;
}
export function initialAttachment(): AttachmentState {
  return { snapshot: null, messages: [], through: -1, historyComplete: false, buffer: [], error: null };
}
function upsert(messages: NativeMessage[], message: NativeMessage): NativeMessage[] {
  return [...messages.filter((m) => m.id !== message.id), message].sort((a, b) => a.position - b.position);
}
function event(state: AttachmentState, frame: Extract<NativeIncoming, { type: 'SESSION_EVENT' }>): AttachmentState {
  if (frame.eventSeq <= state.through) return state;
  if (frame.eventSeq !== state.through + 1) return { ...state, error: 'Conversation is out of sync. Could not attach to this conversation.' };
  return { ...state, through: frame.eventSeq,
    ...(frame.change.kind === 'message' ? { messages: upsert(state.messages, frame.change.message) } : { snapshot: frame.change }) };
}
/** Snapshot watermark and native event sequence are independent of relay delivery sequence. */
export function reduceAttachment(state: AttachmentState, frame: NativeIncoming): AttachmentState {
  if (state.error) return state;
  if (frame.type === 'SESSION_SNAPSHOT') {
    if (state.snapshot) return state;
    let next: AttachmentState = { ...state, snapshot: frame, through: frame.through, historyComplete: frame.historyComplete,
      messages: frame.messages.reduce<NativeMessage[]>(upsert, []), buffer: [],
      error: frame.historyComplete ? null : 'Some conversation history is unavailable (partial history).',
    };
    for (const buffered of [...state.buffer].sort((a, b) => a.eventSeq - b.eventSeq)) {
      if (next.error) break;
      next = event(next, buffered);
    }
    return next;
  }
  if (frame.type === 'SESSION_EVENT') {
    if (state.snapshot) return event(state, frame);
    if (state.buffer.some((f) => f.eventSeq === frame.eventSeq)) return state;
    if (state.buffer.length >= 1000) return { ...state, buffer: [], error: 'Too many events. Could not attach to this conversation.' };
    return { ...state, buffer: [...state.buffer, frame] };
  }
  if (frame.type === 'SESSION_ERROR') return { ...state, error: frame.message || `Could not attach to this conversation: ${frame.reason}` };
  return state;
}
export function supportsWatch(native: NativeMetadata | undefined): boolean {
  return !!native?.sessionId && native.protocol === 1 && native.capabilities?.watch === true;
}
export function canControl(state: AttachmentState, native: NativeMetadata, online: boolean, attached: boolean, pending: boolean, action: 'reply' | 'answer' | 'stop'): boolean {
  if (!supportsWatch(native) || !native.capabilities?.[action] || !online || !attached || pending || state.error || !state.historyComplete || !state.snapshot) return false;
  const current = state.snapshot;
  if (action === 'stop') return current.state === 'running' && !!current.loopId;
  if (action === 'answer') return current.state === 'waiting' && !!current.pending;
  return (current.state === 'running' || current.state === 'idle') && !current.pending;
}
