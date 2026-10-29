import type { RelaySession } from './frames';

export const INTEGRATION_UNAVAILABLE = 'Other assistant conversations are unavailable. This connection needs an assistant integration upgrade.';

export type NativeState = 'running' | 'waiting' | 'idle' | 'unknown';
export interface NativeMetadata {
  sessionId: string;
  surface?: string;
  state: NativeState;
  protocol?: number;
  capabilities?: { watch: boolean; reply: boolean; answer: boolean; stop: boolean };
  startedAt?: number;
  lastChunkAt?: number;
  loopId?: string;
}
export interface Catalog { version: 1; complete: boolean; nextCursor: string | null }
export interface NativeMessage { id: string; position: number; role: 'user' | 'assistant'; text: string; streaming: boolean }
export interface PendingRequest { requestId: string; kind: 'question' | 'approval'; prompt: string }
export interface NativeIdentity { protocol: 1; watchId: string; nativeSessionId: string }
export interface NativeProjection {
  stateVersion: string;
  state: NativeState;
  loopId: string | null;
  pending: PendingRequest | null;
}
export type NativeChange = { kind: 'message'; message: NativeMessage } | ({ kind: 'state' } & NativeProjection);
export type NativeIncoming = NativeIdentity & (
  | ({ type: 'SESSION_SNAPSHOT'; through: number; messages: NativeMessage[]; historyComplete: boolean } & NativeProjection)
  | { type: 'SESSION_EVENT'; eventSeq: number; change: NativeChange }
  | { type: 'SESSION_COMMAND_RESULT'; commandId: string; outcome: 'applied' | 'rejected'; reason?: string }
  | { type: 'SESSION_ERROR'; reason: string; message?: string }
);
export type NativeCommand = { kind: 'reply'; text: string } | { kind: 'stop'; loopId: string }
  | { kind: 'answer'; requestId: string; text?: string; decision?: 'approve' | 'deny' };
export type NativeOutgoing = NativeIdentity & (
  | { type: 'SESSION_ATTACH' | 'SESSION_DETACH' }
  | { type: 'SESSION_COMMAND'; commandId: string; expiresAt: string; stateVersion: string; command: NativeCommand }
);

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && value.length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const timestamp = (value: unknown): value is number => finite(value) && Number.isFinite(new Date(value).getTime());
const sequence = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;
function state(value: unknown): value is NativeState { return text(value) && ['running', 'waiting', 'idle', 'unknown'].includes(value); }
function pending(value: unknown): boolean {
  return value === null || (record(value) && nonempty(value.requestId) && text(value.kind) && ['question', 'approval'].includes(value.kind) && text(value.prompt));
}
function projection(value: Record<string, unknown>): boolean {
  return nonempty(value.stateVersion) && state(value.state) && (value.loopId === null || nonempty(value.loopId)) && pending(value.pending);
}
function message(value: unknown): boolean {
  return record(value) && nonempty(value.id) && sequence(value.position) && text(value.role) && ['user', 'assistant'].includes(value.role) && text(value.text) && typeof value.streaming === 'boolean';
}

/** Identity is checked before parsing, so foreign and unknown-version frames are inert. */
export function matchesWatch(value: unknown, identity: NativeIdentity): boolean {
  return record(value) && value.protocol === 1 && value.watchId === identity.watchId && value.nativeSessionId === identity.nativeSessionId;
}
export function parseNativeFrame(value: unknown): NativeIncoming | null {
  if (!record(value) || value.protocol !== 1 || !nonempty(value.watchId) || !nonempty(value.nativeSessionId)) return null;
  let valid = false;
  switch (value.type) {
    case 'SESSION_SNAPSHOT':
      valid = sequence(value.through) && projection(value) && typeof value.historyComplete === 'boolean' && Array.isArray(value.messages) && value.messages.every(message);
      break;
    case 'SESSION_EVENT': {
      const change = value.change;
      valid = sequence(value.eventSeq) && record(change) && ((change.kind === 'message' && message(change.message)) || (change.kind === 'state' && projection(change)));
      break;
    }
    case 'SESSION_COMMAND_RESULT':
      valid = nonempty(value.commandId) && text(value.outcome) && ['applied', 'rejected'].includes(value.outcome) && (value.reason === undefined || text(value.reason));
      break;
    case 'SESSION_ERROR':
      valid = text(value.reason) && ['unsupported', 'not_found', 'offline', 'history_unavailable', 'resync_required', 'expired', 'stale_target', 'internal'].includes(String(value.reason)) && (value.message === undefined || text(value.message));
      break;
  }
  return valid ? value as unknown as NativeIncoming : null;
}

/** Native presence is retained even when malformed: it must never become a sendable web row. */
export function parseSession(value: unknown): RelaySession | null {
  if (!record(value) || !nonempty(value.id) || !nonempty(value.api_key_id) || !text(value.created_at) || !text(value.updated_at) || !(value.title === null || text(value.title))) return null;
  const row: RelaySession = {
    id: value.id, api_key_id: value.api_key_id, title: value.title, created_at: value.created_at, updated_at: value.updated_at,
    user_id: text(value.user_id) ? value.user_id : '', device_name: text(value.device_name) ? value.device_name : '',
  };
  if (timestamp(value.lastActivity)) row.lastActivity = value.lastActivity;
  if (text(value.snippet)) row.snippet = value.snippet;
  if (text(value.domain) && /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value.domain)) row.domain = value.domain;
  if ('native' in value) {
    const n = record(value.native) ? value.native : {};
    row.native = { sessionId: text(n.sessionId) ? n.sessionId : '', state: state(n.state) ? n.state : 'unknown' };
    if (text(n.surface)) row.native.surface = n.surface;
    if (finite(n.protocol)) row.native.protocol = n.protocol;
    if (record(n.capabilities)) row.native.capabilities = {
      watch: n.capabilities.watch === true, reply: n.capabilities.reply === true,
      answer: n.capabilities.answer === true, stop: n.capabilities.stop === true,
    };
    if (timestamp(n.startedAt)) row.native.startedAt = n.startedAt;
    if (timestamp(n.lastChunkAt)) row.native.lastChunkAt = n.lastChunkAt;
    if (nonempty(n.loopId)) row.native.loopId = n.loopId;
  }
  return row;
}
export function parseCatalog(value: unknown): Catalog | null {
  return record(value) && value.version === 1 && typeof value.complete === 'boolean' && (value.nextCursor === null || nonempty(value.nextCursor))
    ? { version: 1, complete: value.complete, nextCursor: value.nextCursor } : null;
}
