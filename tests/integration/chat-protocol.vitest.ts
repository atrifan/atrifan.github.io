import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { dbReady, req } from './vitest-env';
import { assistantRepo, fieldsReadPerType, framesBuiltIn, typesHandled } from '../support/assistant-protocol';
import { parseReceive, takeFresh } from '@/src/views/remote-chat/model/frame-sequence';
import { applyStreamFrame, contentText, isStreamFrame } from '@/src/views/remote-chat/model/frame-assembly';
import { presenceOf } from '@/src/views/remote-chat/model/presence';

/**
 * Protocol contract between the assistant (device) and Tulzo's remote chat.
 *
 * The assistant side is read from its CODE in ASSISTANT_REPO (default ../assistant):
 * the frames remote-chat.ts builds, the fields its inbound handler reads, the inbound
 * allow-list (remote-fanout.ts), and its real relay + presence clients (remote-relay.ts,
 * remote-presence.ts), which are pure modules with an injected fetch. Here that fetch
 * is wired to Tulzo's route handlers, so the device's own client talks to Tulzo's own
 * routes: /api/plugin/chat/{poll,emit,send,receive,sessions} and /api/plugin/report.
 *
 * Skips when the assistant checkout is absent; the round-trip part also needs the
 * Supabase env (.env.local).
 */

const REPO = assistantRepo();
const PAGE = path.resolve(__dirname, '../../src/views/remote-chat/RemoteChat.tsx');
const at = (rel: string) => path.join(REPO ?? '', rel);

// The Clerk user the page routes see. Device routes authenticate the Bearer key instead.
const USER_ID = 'test_chat_protocol_user';
vi.mock('@clerk/nextjs/server', () => ({
  auth: async () => ({ userId: USER_ID, sessionClaims: {} }),
}));

describe.skipIf(!REPO)('remote chat protocol: static contract (assistant source vs Tulzo page)', () => {
  const remoteChat = at('plugin/src/background/remote-chat.ts');

  it('the page handles every frame type the device emits to it', () => {
    const emitted = new Set(framesBuiltIn(remoteChat, ['fanOut', 'emit']).map((f) => f.type));
    // remote-chat.ts forwards the native approval type as `msgType ?? "ACTION_APPROVAL_REQUEST"`; the
    // other value native sends there is the network-replay approval.
    emitted.add('REPLAY_NETWORK_APPROVAL_REQUEST');
    const handled = new Set(typesHandled(PAGE, 'msg'));
    const missing = [...emitted].filter((t) => !handled.has(t) && !isStreamFrame({ type: t }));
    expect(missing).toEqual([]);
  });

  it('the page only posts frame types the device accepts (REMOTE_INBOUND_FRAME_TYPES)', async () => {
    const { REMOTE_INBOUND_FRAME_TYPES } = await import(at('plugin/src/background/remote-fanout.ts'));
    const posted = [...new Set(framesBuiltIn(PAGE, ['post']).map((f) => f.type))].sort();
    expect(posted.filter((t) => !REMOTE_INBOUND_FRAME_TYPES.has(t))).toEqual([]);
    // ...and it can answer every kind of wait the device can block on.
    expect([...REMOTE_INBOUND_FRAME_TYPES].filter((t) => !posted.includes(t as string))).toEqual([]);
  });

  it('every frame the page posts carries the fields the device reads for that type', () => {
    const reads = fieldsReadPerType(remoteChat, 'handleInbound', 'f');
    const problems: string[] = [];
    for (const { type, keys } of framesBuiltIn(PAGE, ['post'])) {
      for (const field of reads[type] ?? []) {
        // PROPOSALS_RESPONSE.dismissed is optional on the device (absent means "submitted").
        if (type === 'PROPOSALS_RESPONSE' && field === 'dismissed') continue;
        if (!keys.includes(field)) problems.push(`${type} lacks ${field}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('documents what the device reads (guards the extraction itself)', () => {
    const reads = fieldsReadPerType(remoteChat, 'handleInbound', 'f');
    expect(reads.SEND_MESSAGE).toContain('text');
    expect(reads.ACTION_APPROVAL_RESPONSE).toEqual(['actionId', 'decision']);
    expect(reads.FORM_RESPONSE).toContain('data');
  });

  it('the device derives the chat and presence URLs from verify_endpoint, on the same origin', async () => {
    const { deriveChatUrls } = await import(remoteChat);
    const { deriveReportUrl } = await import(at('plugin/src/background/remote-presence.ts'));
    expect(deriveChatUrls('https://tulzo.online/api/verify')).toEqual({
      pollUrl: 'https://tulzo.online/api/plugin/chat/poll',
      emitUrl: 'https://tulzo.online/api/plugin/chat/emit',
    });
    expect(deriveReportUrl('https://tulzo.online/api/verify')).toBe('https://tulzo.online/api/plugin/report');
  });
});

// ── Round trip: the device's own relay client against Tulzo's route handlers ──────────────

type Handler = (r: ReturnType<typeof req>, ctx?: unknown) => Promise<Response>;

function db() {
  return createClient(
    process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
    process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

describe.skipIf(!REPO || !dbReady)('remote chat protocol: device relay ↔ Tulzo routes (real DB)', () => {
  const apiKey = `tlz_chat_protocol_${crypto.randomBytes(10).toString('hex')}`;
  let apiKeyId = '';
  let sessionId = '';
  const ORIGIN = 'http://localhost:3000';

  // fetch for the device client: dispatch the URL to the matching Tulzo route handler.
  async function routeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = new URL(String(input));
    const r = req(url.pathname + url.search, init as never);
    const table: Record<string, () => Promise<Handler>> = {
      'GET /api/plugin/chat/poll': async () => (await import('@/app/api/plugin/chat/poll/route')).GET as Handler,
      'POST /api/plugin/chat/emit': async () => (await import('@/app/api/plugin/chat/emit/route')).POST as Handler,
      'POST /api/plugin/report': async () => (await import('@/app/api/plugin/report/route')).POST as Handler,
    };
    const h = table[`${init?.method ?? 'GET'} ${url.pathname}`];
    if (!h) throw new Error(`unrouted ${init?.method} ${url.pathname}`);
    return (await h())(r);
  }

  // Page side: Tulzo's Clerk-authed routes (auth() is mocked to USER_ID).
  async function pageSend(frame: Record<string, unknown>) {
    const { POST } = await import('@/app/api/plugin/chat/send/route');
    const res = await POST(req('/api/plugin/chat/send', { method: 'POST', body: JSON.stringify({ session_id: sessionId, frame }) }));
    return { status: res.status, body: await res.json() };
  }
  async function pageReceive(after: number | 'latest') {
    const { GET } = await import('@/app/api/plugin/chat/receive/route');
    const res = await GET(req(`/api/plugin/chat/receive?session_id=${sessionId}&after=${after}`));
    return { status: res.status, body: await res.json() };
  }

  beforeAll(async () => {
    const { data, error } = await db()
      .from('api_keys')
      .insert({
        user_id: USER_ID,
        api_key_hash: crypto.createHash('sha256').update(apiKey).digest('hex'),
        api_key_suffix: apiKey.slice(-4),
        name: 'protocol',
        server_name: `chat-protocol-${crypto.randomUUID()}`,
        device_name: 'protocol-device',
        provider: 'custom',
        plan: 'pro',
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    apiKeyId = (data as { id: string }).id;
  });

  afterAll(async () => {
    if (!apiKeyId) return;
    await db().from('device_heartbeats').delete().eq('api_key_id', apiKeyId);
    await db().from('api_keys').delete().eq('id', apiKeyId);
  });

  it('POST /sessions creates a session for an owned device; GET lists it', async () => {
    const { POST, GET } = await import('@/app/api/plugin/chat/sessions/route');
    const res = await POST(req('/api/plugin/chat/sessions', { method: 'POST', body: JSON.stringify({ api_key_id: apiKeyId }) }));
    expect(res.status).toBe(201);
    const { session } = await res.json();
    expect(session).toMatchObject({ user_id: USER_ID, api_key_id: apiKeyId, device_name: 'protocol-device', title: null });
    sessionId = session.id;
    const list = await (await GET()).json();
    expect(list.sessions.map((s: { id: string }) => s.id)).toContain(sessionId);
  });

  it('page → device: frames posted to /send reach the assistant relay as {seq, sessionId, frame}', async () => {
    const { createRemoteRelay, parsePollFrames } = await import(at('plugin/src/background/remote-relay.ts'));
    const { isAllowedRemoteInbound } = await import(at('plugin/src/background/remote-fanout.ts'));
    const { deriveChatUrls } = await import(at('plugin/src/background/remote-chat.ts'));

    const outbound: Array<Record<string, unknown>> = [
      { type: 'SEND_MESSAGE', text: 'hello device', model: 'claude-sonnet-4-6', sessionId },
      { type: 'ACTION_APPROVAL_RESPONSE', actionId: 'act-1', decision: 'approve' },
      { type: 'BRAIN_QUESTIONS_RESPONSE', questionId: 'q-1', answers: { a: 'b' } },
      { type: 'PLAN_RESPONSE', planId: 'p-1', approved: true },
      { type: 'FORM_RESPONSE', formId: 'f-1', data: { city: 'Lisbon' } },
      { type: 'PROPOSALS_RESPONSE', approved: ['x'], rejected: [] },
      { type: 'USER_RESPONSE', text: 'done' },
      { type: 'STOP_STREAM' },
    ];
    const sent = await pageSend(outbound[0]);
    expect(sent).toEqual({ status: 200, body: { ok: true, deviceOnline: expect.any(Boolean) } });
    for (const f of outbound.slice(1)) expect((await pageSend(f)).status).toBe(200);

    // Raw poll body: the envelope shape the device's parser requires.
    const peek = await routeFetch(`${ORIGIN}/api/plugin/chat/poll`, { method: 'GET', headers: { authorization: `Bearer ${apiKey}` } });
    const body = await peek.json();
    const envelopes = parsePollFrames(body);
    expect(envelopes).toHaveLength(outbound.length);
    expect(envelopes.every((e: { seq: unknown; sessionId: unknown }) => typeof e.seq === 'number' && e.sessionId === sessionId)).toBe(true);
    const seqs = envelopes.map((e: { seq: number }) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(envelopes.map((e: { frame: unknown }) => e.frame)).toEqual(outbound);
    expect(envelopes.every((e: { frame: unknown }) => isAllowedRemoteInbound(e.frame))).toBe(true);

    // The real relay client: a second batch is delivered once, then the inbox is empty.
    await pageSend({ type: 'SEND_MESSAGE', text: 'second', model: 'm', sessionId });
    const got: Array<[string, unknown]> = [];
    const urls = deriveChatUrls(`${ORIGIN}/api/verify`)!;
    const relay = createRemoteRelay({ fetchImpl: routeFetch, onInbound: (s: string, f: unknown) => got.push([s, f]), idleDelayMs: 50 });
    relay.start({ sessionId: apiKey, apiKey, pollUrl: urls.pollUrl, emitUrl: urls.emitUrl });
    await vi.waitFor(() => expect(got).toHaveLength(1), { timeout: 15_000 });
    relay.stop();
    expect(got[0]).toEqual([sessionId, { type: 'SEND_MESSAGE', text: 'second', model: 'm', sessionId }]);
  });

  it('device → page: emitted frames come back from /receive in emission order with a seq cursor', async () => {
    const { createRemoteRelay } = await import(at('plugin/src/background/remote-relay.ts'));
    const { deriveChatUrls } = await import(at('plugin/src/background/remote-chat.ts'));
    const urls = deriveChatUrls(`${ORIGIN}/api/verify`)!;
    const relay = createRemoteRelay({ fetchImpl: routeFetch, onInbound: () => {}, idleDelayMs: 60_000 });
    relay.start({ sessionId: apiKey, apiKey, pollUrl: urls.pollUrl, emitUrl: urls.emitUrl });

    const primed = await pageReceive('latest');
    expect(primed).toEqual({ status: 200, body: { frames: [], cursor: expect.any(Number) } });
    const cursor0 = primed.body.cursor as number;

    // Shapes exactly as remote-chat.ts builds them (fanOut literals).
    const frames: Array<Record<string, unknown>> = [
      { type: 'THINKING_CHUNK', delta: 'thinking…' },
      { type: 'STREAM_CHUNK', delta: 'Hello ' },
      { type: 'STREAM_CHUNK', delta: 'from ' },
      { type: 'STREAM_CHUNK', delta: 'the device' },
      { type: 'STREAM_VERIFY', state: 'verifying' },
      { type: 'RENDER_BLOCK', block: { kind: 'chart', config: {} } },
      {
        type: 'ACTION_APPROVAL_REQUEST',
        actionId: 'act-9',
        action: { actionId: 'act-9', actionType: 'DELETE_WORKFLOW', target: 'wf-e2e', value: 'Delete workflow wf-e2e', reasoning: 'r' },
      },
      { type: 'BRAIN_QUESTIONS_REQUEST', questionId: 'q-9', questions: [{ id: 'a', question: 'Why?', type: 'text' }] },
      { type: 'PLAN_CREATED', plan: { id: 'p-9', title: 'Plan', steps: [], status: 'pending' } },
      { type: 'PLAN_STEP_UPDATE', planId: 'p-9', stepId: 1, status: 'done', result: 'ok' },
      { type: 'PLAN_COMPLETE', planId: 'p-9', summary: 'all done' },
      { type: 'INTERACTIVE_FORM', form: { id: 'f-9', title: 'Trip', steps: [] } },
      { type: 'INTERACTIVE_PROPOSALS', title: 'Changes', items: [] },
      { type: 'WAIT_FOR_USER_PROMPT', message: 'Log in, then reply' },
      { type: 'STREAM_DONE', inputTokens: 12, outputTokens: 7, message: { role: 'assistant', content: 'Hello from the device' } },
    ];
    // Fire-and-forget like fanOut does; the relay serializes emits so arrival order == call order.
    const pending = frames.map((f) => relay.emit(sessionId, f));
    await Promise.all(pending);
    relay.stop();

    const got = await pageReceive(cursor0);
    expect(got.status).toBe(200);
    const parsed = parseReceive(got.body);
    expect(parsed.frames).toHaveLength(frames.length); // nothing dropped as malformed
    const { fresh, cursor } = takeFresh(parsed.frames, cursor0);
    expect(fresh.map((e) => e.frame)).toEqual(frames);
    expect(cursor).toBe(parsed.cursor);
    expect(fresh.every((e, i) => i === 0 || e.seq > fresh[i - 1].seq)).toBe(true);

    // The page assembles the stream into one bubble.
    const bubble = fresh
      .map((e) => e.frame)
      .filter(isStreamFrame)
      .reduce((acc, f) => applyStreamFrame(acc, f), { content: '', streaming: true } as Parameters<typeof applyStreamFrame>[0]);
    expect(bubble).toMatchObject({ content: 'Hello from the device', thinking: 'thinking…', verifyState: 'verifying', streaming: false });

    // Past the cursor there is nothing new.
    expect((await pageReceive(cursor)).body).toEqual({ frames: [], cursor });
  });

  it('STREAM_DONE.message is persisted as durable history the page can render', async () => {
    const { GET } = await import('@/app/api/plugin/chat/sessions/[id]/messages/route');
    const res = await GET(req(`/api/plugin/chat/sessions/${sessionId}/messages`), { params: Promise.resolve({ id: sessionId }) });
    const { messages } = (await res.json()) as { messages: Array<{ role: string; content: unknown; seq: number }> };
    const roles = messages.map((m) => m.role);
    expect(roles[0]).toBe('user');
    expect(contentText(messages[0].content)).toBe('hello device');
    const last = messages[messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(contentText(last.content)).toBe('Hello from the device');
    // The first SEND_MESSAGE titled the session.
    const { GET: list } = await import('@/app/api/plugin/chat/sessions/route');
    const { sessions } = await (await list()).json();
    expect(sessions.find((s: { id: string }) => s.id === sessionId).title).toBe('hello device');
  });

  it('presence: the device heartbeat (/api/plugin/report) makes the page show it online with its model', async () => {
    const { createPresenceReporter, deriveReportUrl } = await import(at('plugin/src/background/remote-presence.ts'));
    await db().from('device_heartbeats').delete().eq('api_key_id', apiKeyId);
    const statuses: number[] = [];
    const reporter = createPresenceReporter({
      fetchImpl: async (u: string, i: RequestInit) => {
        const r = await routeFetch(u, i);
        statuses.push(r.status);
        return r;
      },
      reportUrl: deriveReportUrl(`${ORIGIN}/api/verify`)!,
      apiKey,
      getModel: () => 'stub-model-1',
      getDeviceName: () => 'protocol-device',
    });
    await reporter.connect();
    expect(statuses).toEqual([200]);

    const { GET } = await import('@/app/api/plugin/devices/route');
    const { devices } = (await (await GET()).json()) as {
      devices: Array<{ id: string; status: 'online' | 'offline' | 'never_connected'; last_seen_at: string | null; model: string | null }>;
    };
    const mine = devices.find((d) => d.id === apiKeyId)!;
    expect(mine).toMatchObject({ status: 'online', model: 'stub-model-1' });
    expect(presenceOf(mine, { now: Date.now() }).label).toBe('Your assistant is online');
  });
});
