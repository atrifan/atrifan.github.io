import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { EventDecoder, FrameAssembler } from '@/src/views/remote-chat/live-relay-codec';
import { LiveRelayClient } from '@/src/views/remote-chat/live-relay-client';

const text = new TextEncoder();
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('live relay SSE and fragments', () => {
  it('handles split UTF-8 and coalesced events without accepting a partial EOF', () => {
    const parser = new EventDecoder();
    const bytes = text.encode('event:heartbeat\ndata:{"text":"😀"}\n\nevent:closing\ndata:{}\n\n');
    const emoji = bytes.indexOf(0xf0);
    expect(parser.push(bytes.slice(0, emoji + 2))).toEqual([]);
    expect(parser.push(bytes.slice(emoji + 2))).toEqual([{ event: 'heartbeat', data: { text: '😀' } }, { event: 'closing', data: {} }]);
    parser.finish();
    parser.push(text.encode('event:frame\ndata:'));
    expect(() => parser.finish()).toThrow('truncated_event');
  });
  it('assembles out of order, ignores exact duplicates and rejects conflicting duplicates', async () => {
    const requestId = randomUUID();
    const value = { type: 'REQUEST_ERROR', requestId, reason: 'offline' };
    const bytes = text.encode(JSON.stringify(value));
    const frameId = randomUUID();
    const common = { frameId, requestId, count: 2, sha256: sha(bytes) };
    const part = (index: number, data: Uint8Array) => ({ ...common, index, data: Buffer.from(data).toString('base64') });
    const first = part(0, bytes.slice(0, 7));
    const last = part(1, bytes.slice(7));
    const assembler = new FrameAssembler(() => {});
    try {
      expect(await assembler.add(last)).toBeNull();
      expect(await assembler.add(last)).toBeNull();
      expect(await assembler.add(first)).toEqual(value);
      expect(await assembler.add(last)).toBeNull();
      await expect(assembler.add({ ...last, data: 'e30=' })).rejects.toThrow('conflicting_fragment');
    } finally { assembler.clear(); }
  });
  it('rejects a conflicting duplicate before the remaining fragments arrive', async () => {
    const requestId = randomUUID();
    const value = { type: 'REQUEST_ERROR', requestId, reason: 'offline' };
    const bytes = text.encode(JSON.stringify(value));
    const frameId = randomUUID();
    const common = { frameId, requestId, count: 2, sha256: sha(bytes) };
    const first = { ...common, index: 0, data: Buffer.from(bytes.slice(0, 7)).toString('base64') };
    const originalLast = bytes.slice(7);
    const assembler = new FrameAssembler(() => {});
    try {
      expect(await assembler.add({ ...common, index: 1, data: Buffer.from(originalLast).toString('base64') })).toBeNull();
      const conflicting = Uint8Array.from(originalLast);
      conflicting[0] ^= 1;
      await expect(assembler.add({ ...common, index: 1, data: Buffer.from(conflicting).toString('base64') })).rejects.toThrow('conflicting_fragment');
      expect(await assembler.add(first)).toEqual(value);
    } finally { assembler.clear(); }
  });
  it('rejects a logical frame whose request identity differs from its fragment envelope', async () => {
    const bytes = text.encode(JSON.stringify({ type: 'REQUEST_ERROR', requestId: randomUUID(), reason: 'offline' }));
    const assembler = new FrameAssembler(() => {});
    try {
      await expect(assembler.add({
        frameId: randomUUID(), requestId: randomUUID(), index: 0, count: 1,
        sha256: sha(bytes), data: Buffer.from(bytes).toString('base64'),
      })).rejects.toThrow('request_mismatch');
    } finally { assembler.clear(); }
  });
  it('rejects invalid hashes, noncanonical base64 and oversized events', async () => {
    const requestId = randomUUID();
    const assembler = new FrameAssembler(() => {});
    try {
      await expect(assembler.add({ frameId: randomUUID(), requestId, count: 1, index: 0, sha256: 'a'.repeat(64), data: 'e30=' })).rejects.toThrow('fragment_hash_mismatch');
      await expect(assembler.add({ frameId: randomUUID(), requestId, count: 1, index: 0, sha256: 'a'.repeat(64), data: 'e30' })).rejects.toThrow('invalid_fragment');
      expect(() => new EventDecoder().push(text.encode('x'.repeat(128 * 1024 + 1)))).toThrow('event_too_large');
    } finally { assembler.clear(); }
  });
});

describe('live relay client authority', () => {
  it('installs the waiter before the POST and rejects frames from another connection; missing heartbeat expires authority', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    const deviceId = randomUUID(); const clientId = randomUUID(); const streamId = randomUUID(); const connectionId = randomUUID();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let capturedRequestId = '';
    let releaseAck!: () => void;
    const heldAck = new Promise<void>((resolve) => { releaseAck = resolve; });
    const events: string[] = [];
    const emit = (event: string, value: unknown) => controller.enqueue(text.encode(`event:${event}\ndata:${JSON.stringify(value)}\n\n`));
    const frame = (logical: Record<string, unknown>, peer = connectionId, identity: { deviceId?: string; streamId?: string } = {}) => {
      const data = text.encode(JSON.stringify(logical));
      emit('frame', { protocol: 2, deviceId: identity.deviceId ?? deviceId, viewerStreamId: identity.streamId ?? streamId, connectionId: peer,
        part: { frameId: randomUUID(), requestId: logical.requestId, index: 0, count: 1, sha256: sha(data), data: Buffer.from(data).toString('base64') } });
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/stream')) {
        const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
        const now = Date.now();
        emit('ready', { protocol: 2, streamId, viewerToken: 'synthetic', ownerUserId: 'owner', deviceId, serverTime: new Date(now).toISOString(), authorizedUntil: new Date(now + 5000).toISOString(), expiresAt: new Date(now + 45000).toISOString() });
        return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      const body = JSON.parse(String(init?.body)) as { request: { requestId: string; op: { kind: string; scope?: string } } };
      const requestId = body.request.requestId;
      if (body.request.op.kind === 'hello') frame({ type: 'DEVICE_READY', requestId, connectionId, capabilities: { catalog: true, history: true, watch: true, create: true } });
      else {
        capturedRequestId = requestId;
        const foreign = { type: 'REQUEST_ERROR', requestId, reason: 'offline' };
        frame(foreign, randomUUID());
        frame(foreign, connectionId, { streamId: randomUUID() });
        frame(foreign, connectionId, { deviceId: randomUUID() });
        frame({ type: 'CATALOG_RESULT', requestId, scope: 'history', sessions: [], catalog: { version: 2, complete: true, nextCursor: null } });
        await heldAck;
      }
      return Response.json({ accepted: true, requestId }, { status: 202 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new LiveRelayClient(deviceId, clientId, (reason) => events.push(reason));
    try {
      await client.start();
      expect(client.authorized()).toBe(true);
      const result = await client.request({ kind: 'catalog.list', scope: 'history', cursor: null, limit: 50 });
      expect(result).toMatchObject({ type: 'CATALOG_RESULT', requestId: capturedRequestId });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      releaseAck();
      await vi.advanceTimersByTimeAsync(5000);
      expect(client.authorized()).toBe(false);
      expect(events).toEqual(['unavailable']);
      await expect(client.request({ kind: 'session.create', commandId: randomUUID() })).rejects.toThrow('unavailable');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally { releaseAck(); client.close('unavailable', false); }
  });
});
