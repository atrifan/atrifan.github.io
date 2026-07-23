/**
 * Chat Relay Service
 *
 * Shared logic for the remote-chat relay: a phone / second computer signed into
 * the same account chats with a connected "Horia" device. Tulzo is a transport
 * pipe between the remote page and the device (Supabase Realtime broadcast +
 * these frame rows for reliable delivery) plus a durable store for history.
 *
 * Frames are opaque `PanelToWorker` / `WorkerToPanel` objects (the assistant's
 * message contract) — the relay does not interpret them beyond spotting the
 * terminal `STREAM_DONE` frame to persist the finished assistant message.
 *
 * Two auth paths use this service:
 *  - Device routes (poll/emit) authenticate with a Bearer API key
 *    (`authenticateApiKey`, reused from marketplace-service).
 *  - Page routes (sessions/messages/send) authenticate with Clerk and pass the
 *    resolved userId in directly.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getApiKeyByHash,
  hashApiKey,
  computeDeviceStatus,
  upsertDeviceHeartbeat,
} from './supabase-services';

// Untyped client against the STORAGE project — the relay tables aren't in the
// generated Database type yet (acceptable per coding-standards.md).
function getClient(): SupabaseClient {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type RelayFrame = Record<string, unknown>;
export type FrameDirection = 'to_device' | 'to_page';

export interface RelaySession {
  id: string;
  user_id: string;
  api_key_id: string;
  device_name: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface RelayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: Record<string, unknown>;
  seq: number;
  created_at: string;
}

export interface DeviceAuth {
  userId: string;
  apiKeyId: string;
  deviceName: string;
  plan: 'pro' | 'plus';
}

export type DeviceAuthOutcome =
  | { ok: true; auth: DeviceAuth }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Authenticate a connected device by its Bearer API key. Unlike the marketplace
 * auth this also returns the api_key_id + device_name so we can scope sessions
 * to the specific device. Free plan is rejected.
 */
export async function authenticateDevice(authHeader: string | null): Promise<DeviceAuthOutcome> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing Authorization header' };
  }
  const key = authHeader.slice(7).trim();
  if (!key) {
    return { ok: false, status: 401, error: 'Missing Authorization header' };
  }

  const record = await getApiKeyByHash(hashApiKey(key));
  if (!record || !record.is_active) {
    return { ok: false, status: 401, error: 'Invalid or revoked API key' };
  }
  if (record.plan === 'free') {
    return { ok: false, status: 403, error: 'plan_required' };
  }
  return {
    ok: true,
    auth: {
      userId: record.user_id,
      apiKeyId: record.id,
      deviceName: record.device_name,
      plan: record.plan as 'pro' | 'plus',
    },
  };
}

/**
 * Refresh a device's presence marker by touching its `device_heartbeats` row.
 *
 * The device does not POST a real heartbeat today — it only GETs `/api/verify`
 * (hourly) and, while a chat session is live, long-polls `/api/plugin/chat/poll`.
 * Both call this so the control panel's "online" status reflects a device that
 * is actually reachable. `verify` is a coarse (~hourly) signal; `poll` is a
 * tight, live one. Best-effort — never fail the caller on a presence write.
 */
export async function touchDevicePresence(
  apiKeyId: string,
  userId: string,
  deviceName: string
): Promise<void> {
  try {
    await upsertDeviceHeartbeat(apiKeyId, userId, deviceName, {});
  } catch {
    // Best-effort presence only.
  }
}

/** Fetch a session by id. Returns null if it doesn't exist. */
export async function getRelaySession(sessionId: string): Promise<RelaySession | null> {
  const db = getClient();
  const { data } = await db
    .from('chat_relay_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  return (data as RelaySession | null) ?? null;
}

/**
 * Load a session and assert it is owned by `userId` and (optionally) targets
 * `apiKeyId`. Returns a discriminated result so callers can map to 403/404.
 */
export async function authorizeSession(
  sessionId: string,
  opts: { userId: string; apiKeyId?: string }
): Promise<{ ok: true; session: RelaySession } | { ok: false; status: 403 | 404 }> {
  const session = await getRelaySession(sessionId);
  if (!session) return { ok: false, status: 404 };
  if (session.user_id !== opts.userId) return { ok: false, status: 403 };
  if (opts.apiKeyId && session.api_key_id !== opts.apiKeyId) return { ok: false, status: 403 };
  return { ok: true, session };
}

/** List a user's relay sessions, newest first. */
export async function listSessions(userId: string): Promise<RelaySession[]> {
  const db = getClient();
  const { data } = await db
    .from('chat_relay_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  return (data as RelaySession[] | null) ?? [];
}

/**
 * Create a session targeting a device the user owns. Verifies the api key
 * belongs to the user (and is online-eligible). Throws on ownership mismatch.
 */
export async function createSession(
  userId: string,
  apiKeyId: string,
  title?: string
): Promise<RelaySession> {
  const db = getClient();
  const { data: key } = await db
    .from('api_keys')
    .select('id, user_id, device_name, is_active')
    .eq('id', apiKeyId)
    .single();
  const keyRow = key as { user_id: string; device_name: string; is_active: boolean } | null;
  if (!keyRow || keyRow.user_id !== userId || !keyRow.is_active) {
    throw new Error('device_not_found');
  }

  const { data, error } = await db
    .from('chat_relay_sessions')
    .insert({
      user_id: userId,
      api_key_id: apiKeyId,
      device_name: keyRow.device_name,
      title: title ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as RelaySession;
}

/**
 * Rename a session the user owns. Returns the updated row, or null if it doesn't
 * exist / isn't theirs (caller maps to 404).
 */
export async function renameSession(
  sessionId: string,
  userId: string,
  title: string
): Promise<RelaySession | null> {
  const db = getClient();
  const { data } = await db
    .from('chat_relay_sessions')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();
  return (data as RelaySession | null) ?? null;
}

/**
 * Delete a session the user owns (its messages + frames cascade). Returns true
 * if a row was removed.
 */
export async function deleteRelaySession(sessionId: string, userId: string): Promise<boolean> {
  const db = getClient();
  const { data } = await db
    .from('chat_relay_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select('id');
  return Array.isArray(data) && data.length > 0;
}

/**
 * Give a still-untitled session a title derived from its first user message.
 * Called on the first SEND_MESSAGE so the history list shows something readable
 * instead of "New chat". No-op if the session already has a title. Best-effort —
 * a titling failure must never break the send.
 */
export async function maybeAutoTitleSession(session: RelaySession, text: string): Promise<void> {
  if (session.title && session.title.trim()) return;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return;
  const title = clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
  try {
    await renameSession(session.id, session.user_id, title);
  } catch {
    /* best-effort auto-title */
  }
}

/** Is the device targeted by this session currently online (recent heartbeat)? */
export async function isSessionDeviceOnline(session: RelaySession): Promise<boolean> {
  const db = getClient();
  const { data } = await db
    .from('device_heartbeats')
    .select('*')
    .eq('api_key_id', session.api_key_id)
    .single();
  return computeDeviceStatus((data as never) ?? null) === 'online';
}

/** Realtime channel name for a session — both ends subscribe to this. */
export function channelName(sessionId: string): string {
  return `chat:${sessionId}`;
}

/**
 * Per-device Realtime channel. A device can subscribe to this with only its own
 * api_key_id — no session discovery needed — and receive every inbound
 * (to_device) frame across all its sessions. Payloads carry session_id so the
 * device knows where to emit replies. Complements inbox polling.
 */
export function deviceChannelName(apiKeyId: string): string {
  return `device:${apiKeyId}`;
}

/** Best-effort broadcast of a frame to a device's per-device channel. */
async function broadcastToDevice(
  apiKeyId: string,
  sessionId: string,
  frame: RelayFrame
): Promise<void> {
  try {
    const db = getClient();
    const channel = db.channel(deviceChannelName(apiKeyId), { config: { broadcast: { ack: false } } });
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
      setTimeout(resolve, 1500);
    });
    await channel.send({ type: 'broadcast', event: 'frame', payload: { session_id: sessionId, frame } });
    await db.removeChannel(channel);
  } catch {
    // Best-effort only.
  }
}

/**
 * Best-effort Realtime broadcast of a frame. This is the low-latency path
 * (token streaming); the durable frame row inserted by `enqueueFrame` is the
 * reliable delivery fallback. Broadcast failures are swallowed — never let a
 * transient Realtime hiccup fail the request.
 */
export async function broadcastFrame(
  sessionId: string,
  direction: FrameDirection,
  frame: RelayFrame
): Promise<void> {
  try {
    const db = getClient();
    const channel = db.channel(channelName(sessionId), { config: { broadcast: { ack: false } } });
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
      });
      // Don't hang the request if Realtime never connects.
      setTimeout(resolve, 1500);
    });
    await channel.send({ type: 'broadcast', event: 'frame', payload: { direction, frame } });
    await db.removeChannel(channel);
  } catch {
    // Best-effort only.
  }
}

/**
 * Enqueue a frame for reliable delivery (durable row → postgres_changes signal)
 * and also broadcast it for low latency. The row is authoritative; broadcast is
 * an optimization.
 */
export async function enqueueFrame(
  session: RelaySession,
  direction: FrameDirection,
  frame: RelayFrame
): Promise<void> {
  const db = getClient();
  await db.from('chat_relay_frames').insert({
    session_id: session.id,
    user_id: session.user_id,
    direction,
    frame,
  });
  await broadcastFrame(session.id, direction, frame);
  // Also fan a to_device frame onto the per-device channel so a device can
  // receive it by subscribing with just its api_key_id (no session discovery).
  if (direction === 'to_device') {
    await broadcastToDevice(session.api_key_id, session.id, frame);
  }
}

/**
 * Pull pending frames for a direction and mark them consumed. Used by the
 * device poll (to_device) fallback when it can't hold a Realtime subscription.
 */
export async function drainFrames(
  sessionId: string,
  direction: FrameDirection
): Promise<RelayFrame[]> {
  const db = getClient();
  const { data } = await db
    .from('chat_relay_frames')
    .select('id, frame')
    .eq('session_id', sessionId)
    .eq('direction', direction)
    .eq('consumed', false)
    .order('created_at', { ascending: true });

  const rows = (data as { id: string; frame: RelayFrame }[] | null) ?? [];
  if (rows.length > 0) {
    await db
      .from('chat_relay_frames')
      .update({ consumed: true })
      .in('id', rows.map(r => r.id));
  }
  return rows.map(r => r.frame);
}

/**
 * Drain the device's ENTIRE inbox: every unconsumed to_device frame across all
 * sessions that target this device (api_key_id), each tagged with its session_id
 * so the device knows where to emit replies. This lets a device consume chat
 * without any session discovery — it just polls its inbox with its Bearer key.
 * Returns [{ session_id, frame }] oldest-first and marks them consumed.
 */
export async function drainDeviceInbox(
  apiKeyId: string
): Promise<Array<{ seq: number; session_id: string; sessionId: string; frame: RelayFrame }>> {
  const db = getClient();

  // Sessions targeting this device.
  const { data: sessionRows } = await db
    .from('chat_relay_sessions')
    .select('id')
    .eq('api_key_id', apiKeyId);
  const sessionIds = ((sessionRows as { id: string }[] | null) ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const { data } = await db
    .from('chat_relay_frames')
    .select('id, seq, session_id, frame')
    .in('session_id', sessionIds)
    .eq('direction', 'to_device')
    .eq('consumed', false)
    .order('seq', { ascending: true });

  const rows = (data as { id: string; seq: number; session_id: string; frame: RelayFrame }[] | null) ?? [];
  if (rows.length > 0) {
    await db
      .from('chat_relay_frames')
      .update({ consumed: true })
      .in('id', rows.map((r) => r.id));
  }
  // Envelope shape the device long-poll client consumes: a monotonic `seq`
  // cursor for dedup + camelCase `sessionId` (its `parsePollFrames` requires a
  // numeric seq and reads env.sessionId). `session_id` kept for any snake_case
  // reader.
  return rows.map((r) => ({ seq: Number(r.seq), session_id: r.session_id, sessionId: r.session_id, frame: r.frame }));
}

/** Append a durable message to the session history and bump updated_at. */
export async function appendMessage(
  session: RelaySession,
  role: 'user' | 'assistant',
  content: Record<string, unknown>
): Promise<void> {
  const db = getClient();
  await db.from('chat_relay_messages').insert({
    session_id: session.id,
    user_id: session.user_id,
    role,
    content,
  });
  await db
    .from('chat_relay_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', session.id);
}

/**
 * Record a remote-chat interaction in api_usage_log so it counts toward the
 * dashboard's request stats + recent activity. Best-effort: a logging failure
 * must never break the send. `event_type: 'request'` matches the "API request"
 * label the control panel already knows.
 */
export async function logChatInteraction(session: RelaySession): Promise<void> {
  try {
    const db = getClient();
    await db.from('api_usage_log').insert({
      user_id: session.user_id,
      event_type: 'request',
      created_at: new Date().toISOString(),
      metadata: { source: 'remote_chat', session_id: session.id, device_name: session.device_name },
    });
  } catch {
    /* best-effort usage logging */
  }
}

/** Durable history for a session, oldest first. */
export async function getMessages(sessionId: string): Promise<RelayMessage[]> {
  const db = getClient();
  const { data } = await db
    .from('chat_relay_messages')
    .select('id, role, content, seq, created_at')
    .eq('session_id', sessionId)
    .order('seq', { ascending: true });
  return (data as RelayMessage[] | null) ?? [];
}

/**
 * Interpret an outbound (to_page) frame: if it is a terminal STREAM_DONE frame
 * carrying a finished assistant message, persist it to history. Returns true if
 * a message was persisted.
 */
export async function maybePersistTerminalFrame(
  session: RelaySession,
  frame: RelayFrame
): Promise<boolean> {
  if (frame?.type !== 'STREAM_DONE') return false;
  const message = frame.message as { role?: string; content?: Record<string, unknown> } | undefined;
  if (!message || (message.role !== 'assistant' && message.role !== 'user')) {
    // STREAM_DONE without an explicit message payload — nothing to persist.
    return false;
  }
  await appendMessage(session, message.role as 'user' | 'assistant', message.content ?? {});
  return true;
}
