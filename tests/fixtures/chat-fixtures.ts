/**
 * Remote chat fixtures for signed-in UI specs (e2e, a11y, visual).
 *
 * Every test creates its OWN device (an api_keys row owned by the Clerk E2E
 * customer, on a unique server_name) and opens the page with
 * `?device=<apiKeyId>`, so parallel workers and the four themed projects never
 * see each other's sessions. Deleting the device cascades its sessions,
 * messages and frames.
 *
 * The device side of the relay is driven over HTTP exactly like the real
 * assistant does it: `emitFrame` POSTs /api/plugin/chat/emit and `pollDevice`
 * GETs /api/plugin/chat/poll, both with the device's Bearer key.
 *
 * Needs the Supabase service-role env (hasSupabaseEnv) and the Clerk dev keys
 * (hasClerkTestEnv); specs skip without them.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClerkClient } from '@clerk/backend';
import type { APIRequestContext } from '@playwright/test';
import crypto from 'crypto';
import { E2E_USERS } from './clerk-users';

export const CHAT_DEVICE_NAME = 'Studio laptop';
const SERVER_PREFIX = 'chat-e2e-';

export type ChatPresence = 'online' | 'offline' | 'never';

export interface ChatDevice {
  userId: string;
  apiKey: string;
  apiKeyId: string;
  deviceName: string;
  serverName: string;
}

export interface SeedMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** A conversation with the rich content the bubbles must render: lists, code, a table. */
export const RICH_CONVERSATION: SeedMessage[] = [
  { role: 'user', text: 'Compare the two cheapest flights to Lisbon next Friday.' },
  {
    role: 'assistant',
    text: [
      'I checked both airlines. Here are the two cheapest options:',
      '',
      '| Airline | Departs | Price |',
      '|---|---|---|',
      '| TAP | 07:10 | €89 |',
      '| Ryanair | 13:45 | €74 |',
      '',
      '- Ryanair is cheaper but lands later.',
      '- TAP includes a cabin bag.',
    ].join('\n'),
  },
  { role: 'user', text: 'Show me the script you used.' },
  {
    role: 'assistant',
    text: ['Sure, this is the snippet:', '', '```ts', "const offers = await search({ to: 'LIS', date: '2026-10-16' });", 'offers.sort((a, b) => a.price - b.price);', '```'].join('\n'),
  },
];

function db(): SupabaseClient {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

let cachedUserId: string | null = null;

/** Clerk user id of the E2E customer (created by the Playwright `setup` project). */
export async function customerUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  let found: Awaited<ReturnType<typeof clerk.users.getUserList>> | undefined;
  for (let attempt = 1; !found; attempt++) {
    try {
      found = await clerk.users.getUserList({ emailAddress: [E2E_USERS.customer.email] });
    } catch (e) {
      // Transient network errors to the Clerk API; give up after three tries.
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  const user = found.data[0];
  if (!user) throw new Error('E2E customer missing: run the Playwright setup project first');
  cachedUserId = user.id;
  return user.id;
}

/**
 * Create a device for the customer. `online` writes a fresh heartbeat, `offline`
 * one `lastSeenMinutesAgo` (default 25) minutes old, `never` none at all.
 */
export async function createChatDevice(
  opts: { presence?: ChatPresence; lastSeenMinutesAgo?: number; deviceName?: string; model?: string } = {},
): Promise<ChatDevice> {
  const userId = await customerUserId();
  const apiKey = `tlz_chat_e2e_${crypto.randomBytes(12).toString('hex')}`;
  const serverName = `${SERVER_PREFIX}${crypto.randomUUID()}`;
  const deviceName = opts.deviceName ?? CHAT_DEVICE_NAME;
  const client = db();

  const { data, error } = await client
    .from('api_keys')
    .insert({
      user_id: userId,
      api_key_hash: crypto.createHash('sha256').update(apiKey).digest('hex'),
      api_key_suffix: apiKey.slice(-4),
      name: deviceName,
      server_name: serverName,
      device_name: deviceName,
      provider: 'custom',
      plan: 'pro',
      is_active: true,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createChatDevice: ${error?.message ?? 'no row'}`);
  const apiKeyId = (data as { id: string }).id;

  const presence = opts.presence ?? 'online';
  if (presence !== 'never') {
    const minutes = presence === 'online' ? 0 : (opts.lastSeenMinutesAgo ?? 25);
    await client.from('device_heartbeats').upsert(
      {
        api_key_id: apiKeyId,
        user_id: userId,
        device_name: deviceName,
        model: opts.model ?? 'claude-sonnet-4-6',
        updated_at: new Date(Date.now() - minutes * 60_000).toISOString(),
      },
      { onConflict: 'api_key_id' },
    );
  }
  return { userId, apiKey, apiKeyId, deviceName, serverName };
}

/** Set a device's heartbeat age (minutes ago); `null` removes it. */
export async function setDevicePresence(device: ChatDevice, minutesAgo: number | null): Promise<void> {
  const client = db();
  if (minutesAgo === null) {
    await client.from('device_heartbeats').delete().eq('api_key_id', device.apiKeyId);
    return;
  }
  await client.from('device_heartbeats').upsert(
    {
      api_key_id: device.apiKeyId,
      user_id: device.userId,
      device_name: device.deviceName,
      updated_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    },
    { onConflict: 'api_key_id' },
  );
}

/**
 * Create a relay session for the device with optional history. `updatedMinutesAgo`
 * controls its place in the (newest-first) chat list. Returns the session id.
 */
export async function createChatSession(
  device: ChatDevice,
  opts: { title?: string | null; messages?: SeedMessage[]; updatedMinutesAgo?: number } = {},
): Promise<string> {
  const client = db();
  const updatedAt = new Date(Date.now() - (opts.updatedMinutesAgo ?? 0) * 60_000).toISOString();
  const { data, error } = await client
    .from('chat_relay_sessions')
    .insert({
      user_id: device.userId,
      api_key_id: device.apiKeyId,
      device_name: device.deviceName,
      title: opts.title === undefined ? 'Seeded chat' : opts.title,
      created_at: updatedAt,
      updated_at: updatedAt,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`createChatSession: ${error?.message ?? 'no row'}`);
  const sessionId = (data as { id: string }).id;

  // One insert per message keeps seq (BIGSERIAL) in conversation order.
  for (const m of opts.messages ?? []) {
    await client.from('chat_relay_messages').insert({
      session_id: sessionId,
      user_id: device.userId,
      role: m.role,
      content: { text: m.text },
    });
  }
  // appendMessage-style inserts don't touch updated_at here, so restore the requested order.
  await client.from('chat_relay_sessions').update({ updated_at: updatedAt }).eq('id', sessionId);
  return sessionId;
}

/** Sessions of a device, newest first (to assert renames/deletes persisted). */
export async function listDeviceSessions(device: ChatDevice): Promise<Array<{ id: string; title: string | null }>> {
  const { data } = await db()
    .from('chat_relay_sessions')
    .select('id, title')
    .eq('api_key_id', device.apiKeyId)
    .order('updated_at', { ascending: false });
  return (data as Array<{ id: string; title: string | null }> | null) ?? [];
}

/** Remove the device and (by cascade) its sessions, messages and frames. */
export async function deleteChatDevice(device: ChatDevice | undefined): Promise<void> {
  if (!device) return;
  const client = db();
  await client.from('device_heartbeats').delete().eq('api_key_id', device.apiKeyId);
  await client.from('api_keys').delete().eq('id', device.apiKeyId);
}

/** Delete chat fixture devices older than an hour (left behind by an interrupted run). */
export async function purgeStaleChatFixtures(): Promise<void> {
  const client = db();
  const cutoff = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data } = await client
    .from('api_keys')
    .select('id')
    .like('server_name', `${SERVER_PREFIX}%`)
    .lt('created_at', cutoff);
  const ids = ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  await client.from('device_heartbeats').delete().in('api_key_id', ids);
  await client.from('api_keys').delete().in('id', ids);
}

/** Device → page: emit one frame into a session, as the assistant does. */
export async function emitFrame(
  request: APIRequestContext,
  device: ChatDevice,
  sessionId: string,
  frame: Record<string, unknown>,
): Promise<void> {
  const res = await request.post('/api/plugin/chat/emit', {
    headers: { authorization: `Bearer ${device.apiKey}` },
    data: { sessionId, frame },
  });
  if (!res.ok()) throw new Error(`emit ${frame.type}: ${res.status()} ${await res.text()}`);
}

export interface InboxEnvelope {
  seq: number;
  sessionId: string;
  frame: { type: string; [k: string]: unknown };
}

/** Page → device: drain the device inbox once, as the assistant's relay does. */
export async function pollDevice(request: APIRequestContext, device: ChatDevice): Promise<InboxEnvelope[]> {
  const res = await request.get('/api/plugin/chat/poll', { headers: { authorization: `Bearer ${device.apiKey}` } });
  if (!res.ok()) throw new Error(`poll: ${res.status()} ${await res.text()}`);
  return ((await res.json()) as { frames: InboxEnvelope[] }).frames;
}

/**
 * Poll the device inbox until a frame matching `match` arrives (the page posts
 * asynchronously). Returns every envelope seen, the match last.
 */
export async function waitForDeviceFrame(
  request: APIRequestContext,
  device: ChatDevice,
  match: (env: InboxEnvelope) => boolean,
  timeoutMs = 15_000,
): Promise<InboxEnvelope> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frames = await pollDevice(request, device);
    const hit = frames.find(match);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('waitForDeviceFrame: timed out');
}
