import { z } from 'zod';

export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
export const timestamp = z.string().refine((value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
});
const state = z.enum(['running', 'waiting', 'idle', 'unknown']);
const pending = z.object({ requestId: uuid, kind: z.enum(['question', 'approval']), prompt: z.string().max(16384) }).strict().nullable();
export const message = z.object({ id: uuid, position: z.number().int().nonnegative().safe(), role: z.enum(['user', 'assistant']), text: z.string(), streaming: z.boolean() }).strict();
const projection = { stateVersion: uuid, state, loopId: uuid.nullable(), pending };
export const sessionRow = z.object({
  sessionId: uuid, title: z.string().max(256).nullable(), createdAt: timestamp, lastActivity: z.number().finite().refine((value) => Number.isFinite(new Date(value).getTime())), state,
  surface: z.string().min(1).max(64), capabilities: z.object({ watch: z.boolean(), reply: z.boolean(), answer: z.boolean(), stop: z.boolean() }).strict(),
  snippet: z.string().max(120).optional(), domain: z.string().max(253).optional(), startedAt: z.number().finite().optional(),
  lastChunkAt: z.number().finite().optional(), loopId: uuid.optional(),
}).strict();

const base = { requestId: uuid };
const watch = { ...base, sessionId: uuid, watchId: uuid };
export const logicalFrame = z.discriminatedUnion('type', [
  z.object({ type: z.literal('DEVICE_READY'), ...base, connectionId: uuid, capabilities: z.object({ catalog: z.literal(true), history: z.literal(true), watch: z.literal(true), create: z.boolean() }).strict() }).strict(),
  z.object({ type: z.literal('CATALOG_RESULT'), ...base, scope: z.enum(['active', 'history']), sessions: z.array(sessionRow).max(50), catalog: z.object({ version: z.literal(2), complete: z.boolean(), nextCursor: z.string().max(2048).nullable() }).strict() }).strict(),
  z.object({ type: z.literal('CREATE_RESULT'), ...base, commandId: uuid, session: sessionRow, outcome: z.literal('applied') }).strict(),
  z.object({ type: z.literal('HISTORY_RESULT'), ...base, sessionId: uuid, messages: z.array(message).max(100), nextCursor: z.string().max(2048).nullable(), complete: z.boolean(), revision: uuid }).strict(),
  z.object({ type: z.literal('WATCH_SNAPSHOT'), ...watch, through: z.number().int().nonnegative().safe(), ...projection, messages: z.array(message), historyComplete: z.boolean(), historyCursor: z.string().max(2048).nullable(), leaseExpiresAt: timestamp }).strict(),
  z.object({ type: z.literal('WATCH_EVENT'), ...watch, eventSeq: z.number().int().positive().safe(), change: z.discriminatedUnion('kind', [z.object({ kind: z.literal('message'), message }).strict(), z.object({ kind: z.literal('state'), ...projection }).strict()]) }).strict(),
  z.object({ type: z.literal('WATCH_RENEWED'), ...watch, leaseExpiresAt: timestamp }).strict(),
  z.object({ type: z.literal('WATCH_DETACHED'), ...watch }).strict(),
  z.object({ type: z.literal('COMMAND_RESULT'), ...watch, commandId: uuid, outcome: z.enum(['applied', 'rejected']), reason: z.string().optional() }).strict(),
  z.object({ type: z.literal('REQUEST_CANCELED'), ...base, targetRequestId: uuid, outcome: z.enum(['canceled', 'too_late', 'not_found']) }).strict(),
  z.object({ type: z.literal('REQUEST_ERROR'), ...base, reason: z.enum(['unsupported', 'not_found', 'offline', 'history_unavailable', 'resync_required', 'expired', 'stale_target', 'already_answered', 'canceled', 'payload_too_large', 'rate_limited', 'internal', 'clock_unavailable']), sessionId: uuid.optional(), watchId: uuid.optional() }).strict(),
]);
export type LogicalFrame = z.infer<typeof logicalFrame>;
export type SessionRow = z.infer<typeof sessionRow>;
export type Snapshot = Extract<LogicalFrame, { type: 'WATCH_SNAPSHOT' }>;
export type WatchEvent = Extract<LogicalFrame, { type: 'WATCH_EVENT' }>;
export type Command = { kind: 'reply'; text: string } | { kind: 'stop'; loopId: string } | { kind: 'answer'; requestId: string; text: string } | { kind: 'answer'; requestId: string; decision: 'approve' | 'deny' };
export type Operation = { kind: 'hello' } | { kind: 'catalog.list'; scope: 'active' | 'history'; cursor: string | null; limit: number }
  | { kind: 'session.create'; commandId: string } | { kind: 'history.read'; sessionId: string; cursor: string | null; limit: number }
  | { kind: 'watch.attach' | 'watch.renew' | 'watch.detach'; sessionId: string; watchId: string }
  | { kind: 'command'; sessionId: string; watchId: string; commandId: string; stateVersion: string; command: Command }
  | { kind: 'request.cancel'; targetRequestId: string };

export const ready = z.object({ protocol: z.literal(2), streamId: uuid, viewerToken: z.string().min(1).max(4096), ownerUserId: z.string().min(1), deviceId: uuid, serverTime: timestamp, authorizedUntil: timestamp, expiresAt: timestamp }).strict();
export const heartbeat = z.object({ protocol: z.literal(2), serverTime: timestamp, authorizedUntil: timestamp }).strict();
export const frameEnvelope = z.object({ protocol: z.literal(2), deviceId: uuid, viewerStreamId: uuid, connectionId: uuid, part: z.object({ frameId: uuid, requestId: uuid, index: z.number().int().nonnegative(), count: z.number().int().min(1).max(128), sha256: z.string().regex(/^[0-9a-f]{64}$/), data: z.string().max(87384) }).strict() }).strict();
